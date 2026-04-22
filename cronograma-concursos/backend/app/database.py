from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from .config import get_settings

settings = get_settings()

SQLALCHEMY_DATABASE_URL = settings.effective_database_url

_engine_kwargs: dict = {"pool_pre_ping": True, "pool_recycle": 280}
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    _engine_kwargs["connect_args"] = {"check_same_thread": False}
    # SQLite doesn't benefit from recycling, and it would warn on reset.
    _engine_kwargs.pop("pool_recycle", None)

engine = create_engine(SQLALCHEMY_DATABASE_URL, **_engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
