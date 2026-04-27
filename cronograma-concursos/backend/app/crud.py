import logging
from datetime import date, timedelta
from typing import List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from . import models, schemas

logger = logging.getLogger(__name__)


def _severity(status: models.TaskStatus) -> int:
    # Lower score = higher priority.
    return {
        models.TaskStatus.atrasado: 0,
        models.TaskStatus.en_proceso: 1,
        models.TaskStatus.por_iniciar: 2,
        models.TaskStatus.completado: 3,
    }[status]


def _apply_derived_fields(data: dict) -> dict:
    """Auto-compute duration_days when both dates are known and no explicit value."""
    start = data.get("start_date")
    end = data.get("end_date")
    if start and end and data.get("duration_days") in (None, 0):
        data["duration_days"] = (end - start).days
    return data


# --- PROJECTS ---
def create_project(db: Session, project: schemas.ProjectCreate):
    db_project = models.Project(**project.model_dump())
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    logger.info("project.create id=%s name=%s", db_project.id, db_project.name)
    return db_project


def get_project(db: Session, project_id: int):
    return db.query(models.Project).filter(models.Project.id == project_id).first()


def list_projects(db: Session):
    return db.query(models.Project).order_by(models.Project.created_at.desc()).all()


def update_project(db: Session, project_id: int, data: schemas.ProjectUpdate):
    db_project = get_project(db, project_id)
    if not db_project:
        return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(db_project, k, v)
    db.commit()
    db.refresh(db_project)
    logger.info("project.update id=%s", project_id)
    return db_project


def delete_project(db: Session, project_id: int):
    db_project = get_project(db, project_id)
    if not db_project:
        return False
    db.delete(db_project)
    db.commit()
    logger.info("project.delete id=%s", project_id)
    return True


def projects_summary(db: Session):
    projects = db.query(models.Project).all()
    result = []
    for p in projects:
        tasks = p.tasks
        total = len(tasks)
        completed = sum(1 for t in tasks if t.effective_status == models.TaskStatus.completado)
        delayed = sum(1 for t in tasks if t.effective_status == models.TaskStatus.atrasado)
        in_progress = sum(1 for t in tasks if t.effective_status == models.TaskStatus.en_proceso)
        pct = (completed / total * 100) if total else 0.0
        result.append(
            schemas.ProjectSummary(
                id=p.id,
                name=p.name,
                contact_name=p.contact_name,
                total_tasks=total,
                completed_tasks=completed,
                delayed_tasks=delayed,
                in_progress_tasks=in_progress,
                completion_percent=round(pct, 1),
            )
        )
    return result


# --- TASKS ---
def create_task(db: Session, task: schemas.TaskCreate):
    payload = _apply_derived_fields(task.model_dump())
    db_task = models.Task(**payload)
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    logger.info("task.create id=%s project_id=%s", db_task.id, db_task.project_id)
    return db_task


def get_task(db: Session, task_id: int):
    return db.query(models.Task).filter(models.Task.id == task_id).first()


def list_tasks(db: Session, project_id: Optional[int] = None):
    q = db.query(models.Task)
    if project_id is not None:
        q = q.filter(models.Task.project_id == project_id)
    return q.order_by(models.Task.order, models.Task.start_date).all()


def priority_tasks(db: Session, limit: int = 10, project_id: Optional[int] = None):
    q = db.query(models.Task)
    if project_id is not None:
        q = q.filter(models.Task.project_id == project_id)
    candidates = q.all()

    today = date.today()
    open_tasks = [t for t in candidates if t.effective_status != models.TaskStatus.completado]

    def sort_key(t: models.Task):
        severity = _severity(t.effective_status)
        # Days until due; tasks with no end_date sort last.
        if t.end_date is None:
            days_bucket = (1, 0)
        else:
            days_bucket = (0, (t.end_date - today).days)
        return (severity, days_bucket, t.project_id, t.id)

    open_tasks.sort(key=sort_key)
    return open_tasks[:limit]


def update_task(db: Session, task_id: int, data: schemas.TaskUpdate):
    db_task = get_task(db, task_id)
    if not db_task:
        return None
    updates = data.model_dump(exclude_unset=True)
    # Recompute duration_days if either date changed and duration not explicitly set.
    if ("start_date" in updates or "end_date" in updates) and "duration_days" not in updates:
        start = updates.get("start_date", db_task.start_date)
        end = updates.get("end_date", db_task.end_date)
        if start and end:
            updates["duration_days"] = (end - start).days
    for k, v in updates.items():
        setattr(db_task, k, v)
    db.commit()
    db.refresh(db_task)
    logger.info("task.update id=%s", task_id)
    return db_task


def delete_task(db: Session, task_id: int):
    db_task = get_task(db, task_id)
    if not db_task:
        return False
    db.delete(db_task)
    db.commit()
    logger.info("task.delete id=%s", task_id)
    return True


def tasks_pending_this_week(db: Session) -> List[schemas.WeekGroup]:
    """Incomplete tasks whose end_date falls within the current ISO week
    (Mon→Sun), grouped by project and ordered by due date.
    """
    today = date.today()
    start_of_week = today - timedelta(days=today.weekday())  # Monday
    end_of_week = start_of_week + timedelta(days=6)           # Sunday

    tasks = (
        db.query(models.Task)
        .join(models.Project)
        .filter(models.Task.end_date.isnot(None))
        .filter(models.Task.end_date >= start_of_week)
        .filter(models.Task.end_date <= end_of_week)
        .filter(models.Task.complete.is_(False))
        .order_by(models.Project.name, models.Task.end_date)
        .all()
    )

    groups: dict[int, schemas.WeekGroup] = {}
    for t in tasks:
        g = groups.get(t.project_id)
        if g is None:
            g = schemas.WeekGroup(
                project_id=t.project_id,
                project_name=t.project.name,
                week_start=start_of_week,
                week_end=end_of_week,
                tasks=[],
            )
            groups[t.project_id] = g
        g.tasks.append(schemas.TaskOut.model_validate(t))
    return list(groups.values())


def _resolve_week_start(week_start: Optional[date]) -> date:
    today = date.today()
    if week_start is None:
        return today - timedelta(days=today.weekday())
    return week_start - timedelta(days=week_start.weekday())


def weekly_plan(db: Session, week_start: Optional[date] = None) -> schemas.WeeklyPlan:
    """Group every incomplete task with end_date in the given week (Mon→Sun)
    by date. Also surfaces incomplete tasks without an end_date as
    `unscheduled`, so the UI can offer to slot them in.
    """
    monday = _resolve_week_start(week_start)
    sunday = monday + timedelta(days=6)

    scheduled = (
        db.query(models.Task)
        .filter(models.Task.complete.is_(False))
        .filter(models.Task.end_date.isnot(None))
        .filter(models.Task.end_date >= monday)
        .filter(models.Task.end_date <= sunday)
        .order_by(models.Task.end_date, models.Task.project_id, models.Task.order)
        .all()
    )

    by_day: dict[date, list[models.Task]] = {monday + timedelta(days=i): [] for i in range(7)}
    for t in scheduled:
        by_day[t.end_date].append(t)

    unscheduled = (
        db.query(models.Task)
        .filter(models.Task.complete.is_(False))
        .filter(models.Task.end_date.is_(None))
        .order_by(models.Task.project_id, models.Task.order)
        .all()
    )

    return schemas.WeeklyPlan(
        week_start=monday,
        week_end=sunday,
        days=[
            schemas.WeeklyPlanDay(
                date=d,
                tasks=[schemas.TaskOut.model_validate(t) for t in tasks],
            )
            for d, tasks in by_day.items()
        ],
        unscheduled=[schemas.TaskOut.model_validate(t) for t in unscheduled],
    )


def generate_weekly_plan(
    db: Session, week_start: Optional[date] = None
) -> schemas.WeeklyPlanGenerated:
    """Distribute every incomplete task that lacks an end_date across the
    weekdays (Mon→Fri) of the given week.

    Strategy: round-robin per project so a single project doesn't stack
    five tasks on the same day. Day order Mon, Tue, Wed, Thu, Fri.
    Also stamps start_date if missing so the dashboard's status logic
    treats them as "in progress" instead of "por iniciar".
    """
    monday = _resolve_week_start(week_start)
    weekdays = [monday + timedelta(days=i) for i in range(5)]

    undated = (
        db.query(models.Task)
        .filter(models.Task.complete.is_(False))
        .filter(models.Task.end_date.is_(None))
        .order_by(models.Task.project_id, models.Task.order, models.Task.id)
        .all()
    )

    cursor: dict[int, int] = {}
    assigned = 0
    for t in undated:
        offset = cursor.get(t.project_id, 0)
        target_day = weekdays[offset % len(weekdays)]
        cursor[t.project_id] = offset + 1
        t.end_date = target_day
        if not t.start_date:
            t.start_date = target_day
        if t.duration_days is None and t.start_date and t.end_date:
            t.duration_days = (t.end_date - t.start_date).days
        assigned += 1

    if assigned:
        db.commit()
        logger.info("weekly_plan.generate week=%s assigned=%s", monday, assigned)

    return schemas.WeeklyPlanGenerated(
        week_start=monday,
        week_end=monday + timedelta(days=6),
        assigned=assigned,
        plan=weekly_plan(db, monday),
    )


def step_suggestions(db: Session, limit: int = 200) -> List[str]:
    """Distinct task names across the whole workbook, most-used first.

    Used by the task-creation combobox so operators can reuse existing
    step names (e.g. "Alta de concurso en CRM") instead of retyping.
    """
    rows = (
        db.query(models.Task.name, func.count(models.Task.id).label("n"))
        .group_by(models.Task.name)
        .order_by(func.count(models.Task.id).desc(), models.Task.name.asc())
        .limit(limit)
        .all()
    )
    return [name for name, _ in rows]


def responsible_suggestions(db: Session, limit: int = 200) -> List[str]:
    """Distinct responsable names already used on tasks, most-used first."""
    rows = (
        db.query(models.Task.responsible, func.count(models.Task.id).label("n"))
        .filter(models.Task.responsible.isnot(None))
        .filter(models.Task.responsible != "")
        .group_by(models.Task.responsible)
        .order_by(func.count(models.Task.id).desc(), models.Task.responsible.asc())
        .limit(limit)
        .all()
    )
    return [name for name, _ in rows if name]


def recalculate_statuses(db: Session) -> schemas.RecalculateResult:
    """Persist the computed status for every task with auto_status=True."""
    tasks = db.query(models.Task).filter(models.Task.auto_status.is_(True)).all()
    updated = 0
    for t in tasks:
        new_status = t.computed_status
        if t.status != new_status:
            t.status = new_status
            updated += 1
    if updated:
        db.commit()
    logger.info("tasks.recalculate updated=%s total_auto=%s", updated, len(tasks))
    return schemas.RecalculateResult(updated=updated, total_auto=len(tasks))


# --- GOALS ---
def create_goal(db: Session, goal: schemas.GoalCreate):
    db_goal = models.Goal(**goal.model_dump())
    db.add(db_goal)
    db.commit()
    db.refresh(db_goal)
    logger.info("goal.create id=%s", db_goal.id)
    return db_goal


def list_goals(db: Session):
    return db.query(models.Goal).order_by(models.Goal.target_date.asc().nullslast()).all()


def delete_goal(db: Session, goal_id: int):
    db_goal = db.query(models.Goal).filter(models.Goal.id == goal_id).first()
    if not db_goal:
        return False
    db.delete(db_goal)
    db.commit()
    logger.info("goal.delete id=%s", goal_id)
    return True
