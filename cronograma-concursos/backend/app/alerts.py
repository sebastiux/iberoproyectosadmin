"""Email-based alerts: daily delays and weekly Monday summary.

Both are pure functions over the DB session. The scheduler in
`scheduler.py` calls them on a cron, but they're also exposed via
admin endpoints so they can be triggered manually for testing.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from html import escape

from sqlalchemy.orm import Session

from . import auth, crud, email_service, models
from .config import get_settings

logger = logging.getLogger(__name__)


def _recipients() -> list[str]:
    settings = get_settings()
    raw = settings.alert_recipients.strip()
    if raw:
        return [r.strip() for r in raw.split(",") if r.strip()]
    return auth.all_user_emails()


def _fmt_date(d: date | None) -> str:
    if d is None:
        return "—"
    return d.strftime("%d/%m/%Y")


def _project_link(project_id: int) -> str:
    base = get_settings().public_app_url.rstrip("/")
    return f"{base}/projects/{project_id}"


def _task_row(task: models.Task) -> str:
    project = task.project
    project_name = escape(project.name if project else "—")
    return (
        f"<tr>"
        f"<td style='padding:6px 10px;border-bottom:1px solid #eee;'>"
        f"<a href='{_project_link(task.project_id)}' style='color:#111;text-decoration:none'>{project_name}</a>"
        f"</td>"
        f"<td style='padding:6px 10px;border-bottom:1px solid #eee;'>{escape(task.name)}</td>"
        f"<td style='padding:6px 10px;border-bottom:1px solid #eee;color:#666;white-space:nowrap;'>{_fmt_date(task.start_date)}</td>"
        f"<td style='padding:6px 10px;border-bottom:1px solid #eee;color:#666;white-space:nowrap;'>{_fmt_date(task.end_date)}</td>"
        f"</tr>"
    )


def _table(rows: list[str], headers: tuple[str, ...]) -> str:
    if not rows:
        return "<p style='color:#666;'>—</p>"
    head = "".join(
        f"<th style='text-align:left;padding:6px 10px;border-bottom:2px solid #ddd;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#666;font-weight:500;'>{h}</th>"
        for h in headers
    )
    return (
        "<table style='border-collapse:collapse;width:100%;font-size:14px;'>"
        f"<thead><tr>{head}</tr></thead>"
        f"<tbody>{''.join(rows)}</tbody>"
        "</table>"
    )


# ---------------------------------------------------------------------------
# Daily delay alert
# ---------------------------------------------------------------------------

def find_overdue_tasks(db: Session, today: date | None = None) -> list[models.Task]:
    today = today or date.today()
    candidates = (
        db.query(models.Task)
        .filter(models.Task.complete.is_(False))
        .filter(models.Task.end_date.isnot(None))
        .filter(models.Task.end_date < today)
        .order_by(models.Task.end_date.asc())
        .all()
    )
    # Honour manual auto_status=False overrides: if a user fixed the status
    # to something other than 'atrasado' (e.g. 'en_proceso'), respect it.
    return [t for t in candidates if t.effective_status == models.TaskStatus.atrasado]


def send_delay_alert(db: Session, today: date | None = None) -> dict:
    today = today or date.today()
    overdue = find_overdue_tasks(db, today)
    recipients = _recipients()
    if not overdue:
        logger.info("alerts.delay nothing_to_send today=%s", today)
        return {"sent": False, "reason": "no_overdue", "count": 0}
    if not recipients:
        logger.warning("alerts.delay no_recipients overdue=%s", len(overdue))
        return {"sent": False, "reason": "no_recipients", "count": len(overdue)}

    rows = [_task_row(t) for t in overdue]
    today_str = today.strftime("%d/%m/%Y")
    html = f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:680px;margin:0 auto;padding:24px;">
      <p style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#999;margin:0 0 6px;">Alerta diaria · {today_str}</p>
      <h2 style="font-weight:500;margin:0 0 16px;">Tareas atrasadas ({len(overdue)})</h2>
      <p style="color:#444;line-height:1.5;">Estas tareas tenían fecha de fin antes de hoy y no están marcadas como completadas:</p>
      {_table(rows, ("Concurso", "Tarea", "Inicio", "Fin"))}
      <p style="color:#999;font-size:12px;margin-top:24px;">
        <a href='{get_settings().public_app_url}' style='color:#999;'>Abrir Cronograma</a>
      </p>
    </div>
    """
    ok = email_service.send_email(
        recipients,
        subject=f"Cronograma · {len(overdue)} tareas atrasadas ({today_str})",
        html=html,
    )
    return {"sent": ok, "count": len(overdue), "recipients": recipients}


# ---------------------------------------------------------------------------
# Weekly Monday report
# ---------------------------------------------------------------------------

def _monday_of(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _completed_last_week(db: Session, this_monday: date) -> list[models.Task]:
    last_monday = this_monday - timedelta(days=7)
    return (
        db.query(models.Task)
        .filter(models.Task.complete.is_(True))
        .filter(models.Task.updated_at >= datetime.combine(last_monday, datetime.min.time()))
        .filter(models.Task.updated_at < datetime.combine(this_monday, datetime.min.time()))
        .order_by(models.Task.updated_at.asc())
        .all()
    )


def _upcoming_this_week(db: Session, this_monday: date) -> list[models.Task]:
    next_monday = this_monday + timedelta(days=7)
    candidates = (
        db.query(models.Task)
        .filter(models.Task.complete.is_(False))
        .filter(models.Task.start_date.isnot(None))
        .filter(models.Task.start_date >= this_monday)
        .filter(models.Task.start_date < next_monday)
        .order_by(models.Task.start_date.asc())
        .all()
    )
    return candidates


def send_weekly_report(db: Session, today: date | None = None) -> dict:
    today = today or date.today()
    monday = _monday_of(today)

    overdue = find_overdue_tasks(db, today)
    completed = _completed_last_week(db, monday)
    upcoming = _upcoming_this_week(db, monday)

    recipients = _recipients()
    if not recipients:
        logger.warning("alerts.weekly no_recipients")
        return {"sent": False, "reason": "no_recipients"}

    week_label = f"{monday.strftime('%d/%m')} – {(monday + timedelta(days=6)).strftime('%d/%m/%Y')}"
    html = f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:720px;margin:0 auto;padding:24px;">
      <p style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#999;margin:0 0 6px;">Informe semanal · {week_label}</p>
      <h2 style="font-weight:500;margin:0 0 24px;">Cronograma Concursos</h2>

      <div style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:24px;">
        <div><div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#999;">Completadas</div><div style="font-size:28px;font-weight:600;">{len(completed)}</div></div>
        <div><div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#999;">Esta semana</div><div style="font-size:28px;font-weight:600;">{len(upcoming)}</div></div>
        <div><div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#999;">Atrasadas</div><div style="font-size:28px;font-weight:600;color:#b91c1c;">{len(overdue)}</div></div>
      </div>

      <h3 style="font-weight:500;margin:24px 0 8px;font-size:16px;">Atrasadas</h3>
      {_table([_task_row(t) for t in overdue], ("Concurso", "Tarea", "Inicio", "Fin"))}

      <h3 style="font-weight:500;margin:24px 0 8px;font-size:16px;">Inician esta semana</h3>
      {_table([_task_row(t) for t in upcoming], ("Concurso", "Tarea", "Inicio", "Fin"))}

      <h3 style="font-weight:500;margin:24px 0 8px;font-size:16px;">Completadas la semana pasada</h3>
      {_table([_task_row(t) for t in completed], ("Concurso", "Tarea", "Inicio", "Fin"))}

      <p style="color:#999;font-size:12px;margin-top:24px;">
        <a href='{get_settings().public_app_url}' style='color:#999;'>Abrir Cronograma</a>
      </p>
    </div>
    """
    ok = email_service.send_email(
        recipients,
        subject=f"Cronograma · Informe semanal {week_label}",
        html=html,
    )
    return {
        "sent": ok,
        "overdue": len(overdue),
        "upcoming": len(upcoming),
        "completed": len(completed),
        "recipients": recipients,
    }
