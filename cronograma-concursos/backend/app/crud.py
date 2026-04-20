from sqlalchemy.orm import Session
from sqlalchemy import func, case
from . import models, schemas


# --- PROJECTS ---
def create_project(db: Session, project: schemas.ProjectCreate):
    db_project = models.Project(**project.model_dump())
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
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
    return db_project


def delete_project(db: Session, project_id: int):
    db_project = get_project(db, project_id)
    if not db_project:
        return False
    db.delete(db_project)
    db.commit()
    return True


def projects_summary(db: Session):
    rows = (
        db.query(
            models.Project.id,
            models.Project.name,
            models.Project.contact_name,
            func.count(models.Task.id).label("total_tasks"),
            func.sum(case((models.Task.status == models.TaskStatus.completado, 1), else_=0)).label("completed"),
            func.sum(case((models.Task.status == models.TaskStatus.atrasado, 1), else_=0)).label("delayed"),
            func.sum(case((models.Task.status == models.TaskStatus.en_proceso, 1), else_=0)).label("in_progress"),
        )
        .outerjoin(models.Task)
        .group_by(models.Project.id)
        .all()
    )
    result = []
    for r in rows:
        total = r.total_tasks or 0
        completed = r.completed or 0
        pct = (completed / total * 100) if total else 0.0
        result.append(
            schemas.ProjectSummary(
                id=r.id,
                name=r.name,
                contact_name=r.contact_name,
                total_tasks=total,
                completed_tasks=completed,
                delayed_tasks=r.delayed or 0,
                in_progress_tasks=r.in_progress or 0,
                completion_percent=round(pct, 1),
            )
        )
    return result


# --- TASKS ---
def create_task(db: Session, task: schemas.TaskCreate):
    db_task = models.Task(**task.model_dump())
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    return db_task


def get_task(db: Session, task_id: int):
    return db.query(models.Task).filter(models.Task.id == task_id).first()


def list_tasks(db: Session, project_id=None):
    q = db.query(models.Task)
    if project_id is not None:
        q = q.filter(models.Task.project_id == project_id)
    return q.order_by(models.Task.order, models.Task.start_date).all()


def priority_tasks(db: Session, limit: int = 10):
    priority_order = case(
        (models.Task.status == models.TaskStatus.atrasado, 0),
        (models.Task.status == models.TaskStatus.en_proceso, 1),
        (models.Task.status == models.TaskStatus.por_iniciar, 2),
        else_=3,
    )
    return (
        db.query(models.Task)
        .filter(models.Task.status != models.TaskStatus.completado)
        .order_by(priority_order, models.Task.end_date.asc().nullslast())
        .limit(limit)
        .all()
    )


def update_task(db: Session, task_id: int, data: schemas.TaskUpdate):
    db_task = get_task(db, task_id)
    if not db_task:
        return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(db_task, k, v)
    db.commit()
    db.refresh(db_task)
    return db_task


def delete_task(db: Session, task_id: int):
    db_task = get_task(db, task_id)
    if not db_task:
        return False
    db.delete(db_task)
    db.commit()
    return True


# --- GOALS ---
def create_goal(db: Session, goal: schemas.GoalCreate):
    db_goal = models.Goal(**goal.model_dump())
    db.add(db_goal)
    db.commit()
    db.refresh(db_goal)
    return db_goal


def list_goals(db: Session):
    return db.query(models.Goal).order_by(models.Goal.target_date.asc().nullslast()).all()


def delete_goal(db: Session, goal_id: int):
    db_goal = db.query(models.Goal).filter(models.Goal.id == goal_id).first()
    if not db_goal:
        return False
    db.delete(db_goal)
    db.commit()
    return True
