from datetime import date
from sqlalchemy import Column, Integer, String, Date, Boolean, ForeignKey, DateTime, Enum, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

from .database import Base


class TaskStatus(str, enum.Enum):
    completado = "completado"
    en_proceso = "en_proceso"
    por_iniciar = "por_iniciar"
    atrasado = "atrasado"


def compute_task_status(
    complete: bool,
    start_date: date | None,
    end_date: date | None,
    today: date | None = None,
) -> TaskStatus:
    if today is None:
        today = date.today()
    if complete:
        return TaskStatus.completado
    if end_date is not None and end_date < today:
        return TaskStatus.atrasado
    if start_date is not None and end_date is not None and start_date <= today <= end_date:
        return TaskStatus.en_proceso
    if start_date is not None and start_date > today:
        return TaskStatus.por_iniciar
    return TaskStatus.por_iniciar


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False, unique=True)
    contact_name = Column(String(200), nullable=True)
    description = Column(Text, nullable=True)
    observations = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    tasks = relationship("Task", back_populates="project", cascade="all, delete-orphan")


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(300), nullable=False)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    duration_days = Column(Integer, nullable=True)
    complete = Column(Boolean, default=False, nullable=False)
    responsible = Column(String(200), nullable=True)
    observations = Column(Text, nullable=True)
    # Manual override. Only consulted when auto_status is False.
    status = Column(Enum(TaskStatus), nullable=True)
    auto_status = Column(Boolean, default=True, nullable=False, server_default="1")
    order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    project = relationship("Project", back_populates="tasks")

    @property
    def computed_status(self) -> TaskStatus:
        return compute_task_status(self.complete, self.start_date, self.end_date)

    @property
    def effective_status(self) -> TaskStatus:
        if self.auto_status or self.status is None:
            return self.computed_status
        return self.status


class Goal(Base):
    __tablename__ = "goals"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(300), nullable=False)
    description = Column(Text, nullable=True)
    target_date = Column(Date, nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    achieved = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
