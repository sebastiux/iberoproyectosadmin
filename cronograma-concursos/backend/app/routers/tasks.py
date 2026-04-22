from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from .. import crud, schemas
from ..database import get_db

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("/", response_model=List[schemas.TaskOut])
def list_tasks(project_id: Optional[int] = Query(None), db: Session = Depends(get_db)):
    return crud.list_tasks(db, project_id)


@router.get("/priority", response_model=List[schemas.TaskOut])
def priority_tasks(
    limit: int = 10,
    project_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    return crud.priority_tasks(db, limit=limit, project_id=project_id)


@router.get("/step-suggestions", response_model=List[str])
def step_suggestions(db: Session = Depends(get_db)):
    return crud.step_suggestions(db)


@router.get("/responsible-suggestions", response_model=List[str])
def responsible_suggestions(db: Session = Depends(get_db)):
    return crud.responsible_suggestions(db)


@router.get("/week", response_model=List[schemas.WeekGroup])
def tasks_this_week(db: Session = Depends(get_db)):
    return crud.tasks_pending_this_week(db)


@router.post("/recalculate-status", response_model=schemas.RecalculateResult)
def recalculate_statuses(db: Session = Depends(get_db)):
    return crud.recalculate_statuses(db)


@router.post("/", response_model=schemas.TaskOut, status_code=201)
def create_task(payload: schemas.TaskCreate, db: Session = Depends(get_db)):
    return crud.create_task(db, payload)


@router.patch("/{task_id}", response_model=schemas.TaskOut)
def update_task(task_id: int, payload: schemas.TaskUpdate, db: Session = Depends(get_db)):
    t = crud.update_task(db, task_id, payload)
    if not t:
        raise HTTPException(404, "Tarea no encontrada")
    return t


@router.delete("/{task_id}", status_code=204)
def delete_task(task_id: int, db: Session = Depends(get_db)):
    ok = crud.delete_task(db, task_id)
    if not ok:
        raise HTTPException(404, "Tarea no encontrada")
