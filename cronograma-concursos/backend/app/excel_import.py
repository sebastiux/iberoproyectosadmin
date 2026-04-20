"""Excel bulk import for the legacy `Cronograma_Concurso_Semaforo.xlsx` workbook.

Each worksheet becomes a Project (name = sheet name). Each row whose first
meaningful column contains a task name becomes a Task on that project.
"""
from __future__ import annotations

import io
import logging
from datetime import date, datetime, timedelta
from typing import Iterable

from openpyxl import load_workbook
from sqlalchemy.orm import Session

from . import models, schemas

logger = logging.getLogger(__name__)

# Excel's epoch for date serials (the "1900" system, with the leap-year bug).
_EXCEL_EPOCH = date(1899, 12, 30)

COLUMN_ALIASES: dict[str, tuple[str, ...]] = {
    "name": ("secuencia / pasos", "secuencia/pasos", "secuencia", "pasos", "tarea"),
    "start_date": ("fecha de inicio", "inicio"),
    "end_date": ("fecha de fin", "fin", "fecha fin"),
    "duration_days": ("duracion (dias)", "duración (días)", "duracion", "duración"),
    "complete": ("completo", "completado"),
    "responsible": ("responsable", "encargado"),
    "observations": ("observaciones", "notas"),
}


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


def _looks_like_section_header(name: str, other_cells_empty: bool) -> bool:
    stripped = name.strip()
    if not stripped:
        return True
    if not other_cells_empty:
        return False
    # Short, mostly-uppercase titles like "FASE 1", "HITOS", "ENTREGABLES".
    letters = [c for c in stripped if c.isalpha()]
    if letters and all(c.isupper() for c in letters) and len(stripped.split()) <= 4:
        return True
    return False


def import_workbook(db: Session, file_bytes: bytes) -> schemas.ImportExcelResult:
    try:
        wb = load_workbook(io.BytesIO(file_bytes), data_only=True)
    except Exception as exc:  # openpyxl raises various exceptions for bad files
        return schemas.ImportExcelResult(
            projects_created=0, tasks_created=0, skipped_rows=0, errors=[f"Archivo inválido: {exc}"]
        )

    projects_created = 0
    tasks_created = 0
    skipped_rows = 0
    errors: list[str] = []

    for sheet in wb.worksheets:
        project_name = sheet.title.strip()
        if not project_name:
            continue

        existing = (
            db.query(models.Project).filter(models.Project.name == project_name).first()
        )
        if existing:
            project = existing
        else:
            project = models.Project(name=project_name)
            db.add(project)
            db.flush()
            projects_created += 1

        rows = list(sheet.iter_rows(values_only=True))
        if not rows:
            continue

        # Find header row: first row with at least one recognised alias.
        header_idx = 0
        header_map: dict[str, int] = {}
        for idx, row in enumerate(rows):
            candidate = _match_header(row)
            if "name" in candidate:
                header_map = candidate
                header_idx = idx
                break

        if "name" not in header_map:
            errors.append(f"Hoja '{project_name}': no se encontró columna de tareas.")
            continue

        order = 0
        for row in rows[header_idx + 1 :]:
            name_cell = row[header_map["name"]] if len(row) > header_map["name"] else None
            name = str(name_cell).strip() if name_cell is not None else ""

            def cell(field: str):
                i = header_map.get(field)
                if i is None or i >= len(row):
                    return None
                return row[i]

            other_empty = all(
                cell(f) in (None, "") for f in ("start_date", "end_date", "duration_days", "responsible")
            )
            if not name or _looks_like_section_header(name, other_empty):
                skipped_rows += 1
                continue

            try:
                start = _to_date(cell("start_date"))
                end = _to_date(cell("end_date"))
                if start and end and end < start:
                    errors.append(
                        f"Hoja '{project_name}' tarea '{name}': fecha de fin anterior al inicio (omitida)."
                    )
                    skipped_rows += 1
                    continue

                duration = _to_int(cell("duration_days"))
                if duration is None and start and end:
                    duration = (end - start).days

                task = models.Task(
                    project_id=project.id,
                    name=name[:300],
                    start_date=start,
                    end_date=end,
                    duration_days=duration,
                    complete=_to_bool(cell("complete")),
                    responsible=str(cell("responsible")).strip() if cell("responsible") else None,
                    observations=str(cell("observations")).strip() if cell("observations") else None,
                    auto_status=True,
                    order=order,
                )
                db.add(task)
                tasks_created += 1
                order += 1
            except Exception as exc:
                errors.append(f"Hoja '{project_name}' tarea '{name}': {exc}")
                skipped_rows += 1

    db.commit()
    logger.info(
        "excel.import projects_created=%s tasks_created=%s skipped=%s errors=%s",
        projects_created,
        tasks_created,
        skipped_rows,
        len(errors),
    )
    return schemas.ImportExcelResult(
        projects_created=projects_created,
        tasks_created=tasks_created,
        skipped_rows=skipped_rows,
        errors=errors,
    )
