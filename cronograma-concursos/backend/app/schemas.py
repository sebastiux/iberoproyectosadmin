from pydantic import BaseModel, ConfigDict, field_validator, model_validator
from datetime import date, datetime
from typing import Optional, List, Self
from .models import TaskStatus


class TaskBase(BaseModel):
    name: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    duration_days: Optional[int] = None
    complete: bool = False
    responsible: Optional[str] = None
    observations: Optional[str] = None
    status: Optional[TaskStatus] = None
    auto_status: bool = True
    order: int = 0

    @model_validator(mode="after")
    def _validate_dates(self) -> Self:
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError(
                "La fecha de fin no puede ser anterior a la fecha de inicio."
            )
        return self


class TaskCreate(TaskBase):
    project_id: int


class TaskUpdate(BaseModel):
    name: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    duration_days: Optional[int] = None
    complete: Optional[bool] = None
    responsible: Optional[str] = None
    observations: Optional[str] = None
    status: Optional[TaskStatus] = None
    auto_status: Optional[bool] = None
    order: Optional[int] = None

    @model_validator(mode="after")
    def _validate_dates(self) -> Self:
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError(
                "La fecha de fin no puede ser anterior a la fecha de inicio."
            )
        return self


class TaskOut(BaseModel):
    id: int
    project_id: int
    name: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    duration_days: Optional[int] = None
    complete: bool
    responsible: Optional[str] = None
    observations: Optional[str] = None
    status: Optional[TaskStatus] = None
    auto_status: bool
    effective_status: TaskStatus
    order: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProjectBase(BaseModel):
    name: str
    contact_name: Optional[str] = None
    description: Optional[str] = None
    observations: Optional[str] = None


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    contact_name: Optional[str] = None
    description: Optional[str] = None
    observations: Optional[str] = None


class ProjectOut(ProjectBase):
    id: int
    created_at: datetime
    updated_at: datetime
    tasks: List[TaskOut] = []

    model_config = ConfigDict(from_attributes=True)


class ProjectSummary(BaseModel):
    id: int
    name: str
    contact_name: Optional[str] = None
    total_tasks: int
    completed_tasks: int
    delayed_tasks: int
    in_progress_tasks: int
    completion_percent: float

    model_config = ConfigDict(from_attributes=True)


class GoalBase(BaseModel):
    title: str
    description: Optional[str] = None
    target_date: Optional[date] = None
    project_id: Optional[int] = None
    achieved: bool = False

    @field_validator("achieved", mode="before")
    @classmethod
    def _coerce_achieved(cls, value: object) -> bool:
        # MySQL columns created before nullable=False existed can hold
        # NULL — coerce to False so the response model doesn't 500.
        if value is None:
            return False
        return bool(value)


class GoalCreate(GoalBase):
    pass


class GoalUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    target_date: Optional[date] = None
    project_id: Optional[int] = None
    achieved: Optional[bool] = None


class GoalOut(GoalBase):
    id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class RecalculateResult(BaseModel):
    updated: int
    total_auto: int


class ImportExcelResult(BaseModel):
    projects_created: int
    tasks_created: int
    skipped_rows: int
    errors: List[str] = []


class WeekGroup(BaseModel):
    project_id: int
    project_name: str
    week_start: date
    week_end: date
    tasks: List[TaskOut] = []

    model_config = ConfigDict(from_attributes=True)


class WeeklyPlanDay(BaseModel):
    date: date
    tasks: List[TaskOut] = []


class WeeklyPlan(BaseModel):
    week_start: date
    week_end: date
    days: List[WeeklyPlanDay]
    unscheduled: List[TaskOut] = []


class WeeklyPlanGenerated(BaseModel):
    week_start: date
    week_end: date
    assigned: int
    plan: WeeklyPlan
