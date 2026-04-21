import logging

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List

from . import crud, schemas
from .config import get_settings
from .database import Base, engine, get_db
from .routers import projects, tasks

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)

# In development we keep auto-creating tables for convenience; in production
# Alembic migrations are the source of truth.
if not settings.is_production:
    Base.metadata.create_all(bind=engine)

app = FastAPI(title="Cronograma Concursos API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router)
app.include_router(tasks.router)

_db_dialect = settings.effective_database_url.split("://", 1)[0]
logger.info(
    "app.startup env=%s db=%s cors_origins=%s",
    settings.environment,
    _db_dialect,
    settings.cors_origins,
)


@app.get("/")
def root():
    return {"status": "ok", "service": "cronograma-concursos"}


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}


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
