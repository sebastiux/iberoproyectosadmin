from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import List

from .. import crud, schemas
from ..auth import current_user
from ..database import get_db
from ..excel_import import export_workbook, generate_template, import_workbook

router = APIRouter(
    prefix="/projects",
    tags=["projects"],
    dependencies=[Depends(current_user)],
)


@router.get("/", response_model=List[schemas.ProjectOut])
def list_projects(db: Session = Depends(get_db)):
    return crud.list_projects(db)


@router.get("/summary", response_model=List[schemas.ProjectSummary])
def projects_summary(db: Session = Depends(get_db)):
    return crud.projects_summary(db)


@router.get("/import-excel/template")
def download_import_template():
    blob = generate_template()
    return Response(
        content=blob,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": 'attachment; filename="plantilla-concursos.xlsx"'
        },
    )


@router.get("/export-excel")
def download_current_data(db: Session = Depends(get_db)):
    """Snapshot of every project + tasks with IDs prefilled — ready for
    bulk edit and re-upload via /import-excel."""
    blob = export_workbook(db)
    return Response(
        content=blob,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": 'attachment; filename="concursos-actuales.xlsx"'
        },
    )


@router.post("/import-excel", response_model=schemas.ImportExcelResult)
async def import_projects_excel(
    file: UploadFile = File(...),
    replace_tasks: bool = Form(False),
    db: Session = Depends(get_db),
):
    if not file.filename or not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(400, "Se requiere un archivo .xlsx")
    contents = await file.read()
    return import_workbook(db, contents, replace_tasks=replace_tasks)


@router.get("/{project_id}", response_model=schemas.ProjectOut)
def get_project(project_id: int, db: Session = Depends(get_db)):
    p = crud.get_project(db, project_id)
    if not p:
        raise HTTPException(404, "Proyecto no encontrado")
    return p


@router.post("/", response_model=schemas.ProjectOut, status_code=201)
def create_project(payload: schemas.ProjectCreate, db: Session = Depends(get_db)):
    return crud.create_project(db, payload)


@router.patch("/{project_id}", response_model=schemas.ProjectOut)
def update_project(project_id: int, payload: schemas.ProjectUpdate, db: Session = Depends(get_db)):
    p = crud.update_project(db, project_id, payload)
    if not p:
        raise HTTPException(404, "Proyecto no encontrado")
    return p


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: int, db: Session = Depends(get_db)):
    ok = crud.delete_project(db, project_id)
    if not ok:
        raise HTTPException(404, "Proyecto no encontrado")
