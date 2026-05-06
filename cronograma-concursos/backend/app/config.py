from functools import lru_cache
from typing import List, Optional
from urllib.parse import quote_plus

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _blank_to_none(value: object) -> Optional[str]:
    """Treat empty strings as unset.

    Railway substitutes an empty string when a variable reference like
    ``${{MySQL.MYSQLHOST}}`` fails to resolve, so we normalise those away
    before they reach the type-checked fields.
    """
    if value is None:
        return None
    if isinstance(value, str) and value.strip() == "":
        return None
    return str(value)


class Settings(BaseSettings):
    # A full connection URL overrides everything else when present.
    database_url: Optional[str] = Field(default=None)

    # Individual MySQL parts — matches Railway's MySQL plugin variable names.
    mysql_host: Optional[str] = Field(default=None, alias="MYSQLHOST")
    mysql_port: Optional[int] = Field(default=3306, alias="MYSQLPORT")
    mysql_user: Optional[str] = Field(default=None, alias="MYSQLUSER")
    mysql_password: Optional[str] = Field(default=None, alias="MYSQLPASSWORD")
    mysql_database: Optional[str] = Field(default=None, alias="MYSQLDATABASE")

    frontend_origin: str = Field(default="http://localhost:3000")
    # Optional comma-separated extra origins (e.g. a custom domain plus the
    # railway.app preview URL).
    extra_cors_origins: str = Field(default="")
    environment: str = Field(default="development")
    log_level: str = Field(default="INFO")

    # Comma-separated entries. Each entry is "user:password" or
    # "user:password:email". Email is required for the second login
    # step (Resend OTP) and for receiving alerts/weekly reports.
    auth_users: str = Field(default="")
    # Random string used to sign session tokens. Must be set in production
    # so tokens survive restarts.
    auth_secret: str = Field(default="")

    # Resend (https://resend.com) — optional. When the API key is missing,
    # the email-confirmation step is skipped (login becomes single-step)
    # and the scheduled alerts simply log instead of sending.
    resend_api_key: str = Field(default="")
    resend_from: str = Field(default="Cronograma <onboarding@resend.dev>")

    # Where alerts and the Monday weekly report are sent. Comma-separated
    # list of emails. If empty, falls back to every email configured in
    # AUTH_USERS.
    alert_recipients: str = Field(default="")

    # Scheduler timezone + times (24h). Daily delay alert is sent at
    # alert_daily_hour, weekly report is sent every Monday at
    # weekly_report_hour, both in the configured timezone.
    scheduler_timezone: str = Field(default="America/Mexico_City")
    alert_daily_hour: int = Field(default=9)
    weekly_report_hour: int = Field(default=8)
    # Public URL of the frontend, embedded in email links.
    public_app_url: str = Field(default="http://localhost:3000")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
        populate_by_name=True,
    )

    @field_validator(
        "database_url",
        "mysql_host",
        "mysql_user",
        "mysql_password",
        "mysql_database",
        mode="before",
    )
    @classmethod
    def _coerce_blank_string(cls, value: object) -> Optional[str]:
        return _blank_to_none(value)

    @field_validator("mysql_port", mode="before")
    @classmethod
    def _coerce_port(cls, value: object) -> Optional[int]:
        cleaned = _blank_to_none(value)
        if cleaned is None:
            return None
        try:
            return int(cleaned)
        except (TypeError, ValueError):
            return None

    @field_validator("database_url")
    @classmethod
    def _normalise_database_url(cls, value: Optional[str]) -> Optional[str]:
        # Railway's MySQL plugin exposes the URL with the bare "mysql://"
        # scheme; pin it to PyMySQL so SQLAlchemy picks the right driver.
        if value and value.startswith("mysql://"):
            return value.replace("mysql://", "mysql+pymysql://", 1)
        return value

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

    @property
    def effective_database_url(self) -> str:
        """Pick a DB URL in priority order: DATABASE_URL → MYSQL* parts → local SQLite."""
        if self.database_url:
            return self.database_url
        if self.mysql_host and self.mysql_user:
            user = quote_plus(self.mysql_user)
            pw = quote_plus(self.mysql_password or "")
            db = self.mysql_database or ""
            port = self.mysql_port or 3306
            return f"mysql+pymysql://{user}:{pw}@{self.mysql_host}:{port}/{db}"
        return "sqlite:///./cronograma.db"


@lru_cache
def get_settings() -> Settings:
    return Settings()
