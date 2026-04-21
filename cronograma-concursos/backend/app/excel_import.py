"""Excel bulk import for the Cronograma Concurso workbook.

Real workbook layout (`samples/DataSetSample.xlsx`):

    Row 0: optional title row. Column B holds the canonical project name
           (e.g. "Huawei Innovation Competition"). This is the preferred
           source for the project name.
    Row 1: header row starting with `Concurso` in column A, then
           `Secuencia / Pasos`, `Fecha de inicio`, `Fecha de fin`,
           `Duración (días)`, `Completo`, `Responsable`, `Observaciones`,
           `Status`.
    Row 2+: data rows. Column A typically repeats the project name; tasks
            live in the remaining columns.
    After the task list, a metadata block: a row where column A is
           "Contacto" and column B holds the contact person's name.

Each sheet maps to a single project. The project name is taken from the
row-0 title, falling back to the first `Concurso` value, then the sheet
tab name. The `Status` column is ignored — effective status is derived
from the dates plus the `Completo` flag. The `Contacto` row is consumed
into `Project.contact_name`.
"""
from __future__ import annotations

import io
import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Iterable

from openpyxl import load_workbook
from sqlalchemy.orm import Session

from . import models, schemas

logger = logging.getLogger(__name__)

# Excel's epoch for date serials (the "1900" system, with the leap-year bug).
_EXCEL_EPOCH = date(1899, 12, 30)

COLUMN_ALIASES: dict[str, tuple[str, ...]] = {
    "project_name": ("concurso",),
    "name": ("secuencia / pasos", "secuencia/pasos", "secuencia", "pasos", "tarea"),
    "start_date": ("fecha de inicio", "inicio"),
    "end_date": ("fecha de fin", "fin", "fecha fin"),
    "duration_days": ("duracion (dias)", "duración (días)", "duracion", "duración"),
    "complete": ("completo", "completado"),
    "responsible": ("responsable", "encargado"),
    "observations": ("observaciones", "notas"),
}


@dataclass
class _Counters:
    projects_created: int = 0
    tasks_created: int = 0
    skipped_rows: int = 0
    errors: list[str] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.errors is None:
            self.errors = []


def _normalise(text: object) -> str:
    if text is None:
        return ""
    return str(text).strip().lower()


def _match_header(header_cells: Iterable[object]) -> dict[str, int]:
    mapping: dict[str, int] = {}
    for idx, cell in enumerate(header_cells):
        label = _normalise(cell)
        if not label:
            continue
        for field, aliases in COLUMN_ALIASES.items():
            if field in mapping:
                continue
            if any(alias in label for alias in aliases):
                mapping[field] = idx
                break
    return mapping


def _to_date(value: object) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, (int, float)):
        try:
            return _EXCEL_EPOCH + timedelta(days=int(value))
        except (OverflowError, ValueError):
            return None
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y"):
            try:
                return datetime.strptime(text, fmt).date()
            except ValueError:
                continue
    return None


def _to_bool(value: object) -> bool:
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    text = _normalise(value)
    if text in {"si", "sí", "yes", "true", "1", "✅", "x", "completo", "completado"}:
        return True
    return False


def _to_int(value: object) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _clean_text(value: object) -> str | None:
    if value is None:
        return None
    text = " ".join(str(value).split())  # collapse whitespace, strip
    return text or None


def _looks_like_section_header(name: str, other_cells_empty: bool) -> bool:
    stripped = name.strip()
    if not stripped:
        return True
    if not other_cells_empty:
        return False
    letters = [c for c in stripped if c.isalpha()]
    if letters and all(c.isupper() for c in letters) and len(stripped.split()) <= 4:
        return True
    return False


def _first_non_empty(row: Iterable[object]) -> str | None:
    for cell in row:
        text = _clean_text(cell)
        if text:
            return text
    return None


def _find_project_name(rows: list[tuple], header_idx: int, header_map: dict[str, int], fallback: str) -> str:
    """Title row B > first Concurso value > sheet tab name."""
    # Rows before the header row can carry a title.
    for r in rows[:header_idx]:
        if len(r) >= 2:
            title = _clean_text(r[1])
            if title:
                return title
        lone = _first_non_empty(r)
        if lone:
            return lone

    # Fall back to the first non-empty `Concurso` cell in the data rows.
    cidx = header_map.get("project_name")
    if cidx is not None:
        for r in rows[header_idx + 1 :]:
            if cidx < len(r):
                value = _clean_text(r[cidx])
                if value and value.lower() != "contacto":
                    return value

    return fallback


def import_workbook(db: Session, file_bytes: bytes) -> schemas.ImportExcelResult:
    try:
        wb = load_workbook(io.BytesIO(file_bytes), data_only=True)
    except Exception as exc:  # openpyxl raises various exceptions for bad files
        return schemas.ImportExcelResult(
            projects_created=0,
            tasks_created=0,
            skipped_rows=0,
            errors=[f"Archivo inválido: {exc}"],
        )

    counters = _Counters()

    for sheet in wb.worksheets:
        _import_sheet(db, sheet, counters)

    db.commit()
    logger.info(
        "excel.import projects_created=%s tasks_created=%s skipped=%s errors=%s",
        counters.projects_created,
        counters.tasks_created,
        counters.skipped_rows,
        len(counters.errors),
    )
    return schemas.ImportExcelResult(
        projects_created=counters.projects_created,
        tasks_created=counters.tasks_created,
        skipped_rows=counters.skipped_rows,
        errors=counters.errors,
    )


def _import_sheet(db: Session, sheet, counters: _Counters) -> None:
    sheet_label = sheet.title.strip() or "(sin título)"
    rows = list(sheet.iter_rows(values_only=True))
    if not rows:
        return

    # Find header row: first row with a recognised "name" column.
    header_idx = -1
    header_map: dict[str, int] = {}
    for idx, row in enumerate(rows):
        candidate = _match_header(row)
        if "name" in candidate:
            header_map = candidate
            header_idx = idx
            break

    if "name" not in header_map:
        counters.errors.append(f"Hoja '{sheet_label}': no se encontró columna de tareas.")
        return

    project_name = _find_project_name(rows, header_idx, header_map, fallback=sheet_label)

    existing = db.query(models.Project).filter(models.Project.name == project_name).first()
    if existing:
        project = existing
    else:
        project = models.Project(name=project_name)
        db.add(project)
        db.flush()
        counters.projects_created += 1

    def cell_for(row: tuple, field: str):
        i = header_map.get(field)
        if i is None or i >= len(row):
            return None
        return row[i]

    # Task-order counter scoped to the project so repeated imports on the same
    # project continue the sequence.
    order = (
        db.query(models.Task)
        .filter(models.Task.project_id == project.id)
        .count()
    )

    contact_captured: str | None = None

    for row in rows[header_idx + 1 :]:
        project_cell = _clean_text(cell_for(row, "project_name"))
        name_cell = _clean_text(cell_for(row, "name"))

        # Metadata row: A="Contacto", B holds the contact name.
        if project_cell and project_cell.lower() == "contacto":
            if name_cell and not contact_captured:
                contact_captured = name_cell
            continue

        name = name_cell or ""
        other_empty = all(
            cell_for(row, f) in (None, "")
            for f in ("start_date", "end_date", "duration_days", "responsible")
        )
        if not name or _looks_like_section_header(name, other_empty):
            counters.skipped_rows += 1
            continue

        try:
            start = _to_date(cell_for(row, "start_date"))
            end = _to_date(cell_for(row, "end_date"))
            if start and end and end < start:
                counters.errors.append(
                    f"'{project_name}' · '{name}': fecha de fin anterior al inicio (omitida)."
                )
                counters.skipped_rows += 1
                continue

            duration = _to_int(cell_for(row, "duration_days"))
            if duration is None and start and end:
                duration = (end - start).days

            task = models.Task(
                project_id=project.id,
                name=name[:300],
                start_date=start,
                end_date=end,
                duration_days=duration,
                complete=_to_bool(cell_for(row, "complete")),
                responsible=_clean_text(cell_for(row, "responsible")),
                observations=_clean_text(cell_for(row, "observations")),
                auto_status=True,
                order=order,
            )
            db.add(task)
            counters.tasks_created += 1
            order += 1
        except Exception as exc:
            counters.errors.append(f"'{project_name}' · '{name}': {exc}")
            counters.skipped_rows += 1

    if contact_captured and not project.contact_name:
        project.contact_name = contact_captured
