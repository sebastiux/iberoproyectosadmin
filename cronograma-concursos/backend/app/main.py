import logging

from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from typing import List

from . import crud, schemas
from .auth import current_user
from .config import get_settings
from .database import Base, engine, get_db
from .routers import auth, projects, tasks

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)

# Ensure tables exist on every boot. `create_all` is a no-op for tables that
# already exist, so it's safe to run unconditionally and survives fresh
# databases, restored snapshots, and first deploys.
try:
    Base.metadata.create_all(bind=engine)
    logger.info("db.create_all ok")
except Exception:
    logger.exception("db.create_all failed")

app = FastAPI(title="Cronograma Concursos API", version="0.2.0")

class ForceCORSHeaders(BaseHTTPMiddleware):
    """Belt-and-braces: attach permissive CORS headers to every response,
    including ones that bypass Starlette's CORSMiddleware (e.g. raw
    exceptions, ASGI-level errors). Safe while we have no auth/cookies."""

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.method == "OPTIONS":
            response = Response(status_code=204)
        else:
            try:
                response = await call_next(request)
            except Exception:
                logger.exception(
                    "unhandled_exception_asgi method=%s path=%s",
                    request.method,
                    request.url.path,
                )
                response = JSONResponse(
                    status_code=500,
                    content={"detail": "Error interno del servidor"},
                )
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "*"
        response.headers["Access-Control-Max-Age"] = "600"
        return response


# Outer layer: guarantees CORS headers on every response.
app.add_middleware(ForceCORSHeaders)

# Inner layer: the standard CORSMiddleware still runs first for well-formed
# requests so preflights get proper method/header negotiation.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600,
)

app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(tasks.router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Log the full traceback and return a JSON 500 (with CORS headers
    attached by the middleware layer)."""
    logger.exception(
        "unhandled_exception method=%s path=%s",
        request.method,
        request.url.path,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Error interno del servidor", "error": type(exc).__name__},
    )


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


@app.get("/goals", response_model=List[schemas.GoalOut], tags=["goals"], dependencies=[Depends(current_user)])
def list_goals(db: Session = Depends(get_db)):
    return crud.list_goals(db)


@app.post("/goals", response_model=schemas.GoalOut, status_code=201, tags=["goals"], dependencies=[Depends(current_user)])
def create_goal(payload: schemas.GoalCreate, db: Session = Depends(get_db)):
    return crud.create_goal(db, payload)


@app.patch("/goals/{goal_id}", response_model=schemas.GoalOut, tags=["goals"], dependencies=[Depends(current_user)])
def update_goal(goal_id: int, payload: schemas.GoalUpdate, db: Session = Depends(get_db)):
    g = crud.update_goal(db, goal_id, payload)
    if not g:
        raise HTTPException(404, "Meta no encontrada")
    return g


@app.delete("/goals/{goal_id}", status_code=204, tags=["goals"], dependencies=[Depends(current_user)])
def delete_goal(goal_id: int, db: Session = Depends(get_db)):
    if not crud.delete_goal(db, goal_id):
        raise HTTPException(404, "Meta no encontrada")
