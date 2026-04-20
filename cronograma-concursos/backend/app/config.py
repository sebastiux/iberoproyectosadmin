from functools import lru_cache
from typing import List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = Field(default="sqlite:///./cronograma.db")
    frontend_origin: str = Field(default="http://localhost:3000")
    # Optional comma-separated extra origins (e.g. a custom domain plus the
    # railway.app preview URL).
    extra_cors_origins: str = Field(default="")
    environment: str = Field(default="development")
    log_level: str = Field(default="INFO")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def cors_origins(self) -> List[str]:
        origins = [self.frontend_origin.strip()]
        for extra in self.extra_cors_origins.split(","):
            extra = extra.strip()
            if extra:
                origins.append(extra)
        return [o for o in origins if o]

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @field_validator("database_url")
    @classmethod
    def _normalise_database_url(cls, value: str) -> str:
        # Railway's MySQL plugin exposes the URL with the bare "mysql://"
        # scheme; pin it to PyMySQL so SQLAlchemy picks the right driver.
        if value.startswith("mysql://"):
            return value.replace("mysql://", "mysql+pymysql://", 1)
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
