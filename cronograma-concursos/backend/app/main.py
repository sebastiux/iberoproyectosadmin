from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List

from . import crud, schemas
from .database import Base, engine, get_db
from .routers import projects, tasks

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Cronograma Concursos API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router)
app.include_router(tasks.router)


@app.get("/")
def root():
    return {"status": "ok", "service": "cronograma-concursos"}


@app.get("/goals", response_model=List[schemas.GoalOut], tags=["goals"])
def list_goals(db: Session = Depends(get_db)):
    return crud.list_goals(db)


@app.post("/goals", response_model=schemas.GoalOut, status_code=201, tags=["goals"])
def create_goal(payload: schemas.GoalCreate, db: Session = Depends(get_db)):
    return crud.create_goal(db, payload)


@app.delete("/goals/{goal_id}", status_code=204, tags=["goals"])
def delete_goal(goal_id: int, db: Session = Depends(get_db)):
    if not crud.delete_goal(db, goal_id):
        raise HTTPException(404, "Meta no encontrada")
