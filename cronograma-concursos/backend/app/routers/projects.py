from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session
from typing import List

from .. import crud, schemas
from ..database import get_db
from ..excel_import import import_workbook

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("/", response_model=List[schemas.ProjectOut])
def list_projects(db: Session = Depends(get_db)):
    return crud.list_projects(db)


@router.get("/summary", response_model=List[schemas.ProjectSummary])
def projects_summary(db: Session = Depends(get_db)):
    return crud.projects_summary(db)


@router.post("/import-excel", response_model=schemas.ImportExcelResult)
async def import_projects_excel(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if not file.filename or not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(400, "Se requiere un archivo .xlsx")
    contents = await file.read()
    return import_workbook(db, contents)


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
