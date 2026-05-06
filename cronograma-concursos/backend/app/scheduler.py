"""APScheduler bootstrap: daily delay alert + weekly Monday report.

Single in-process scheduler — fine for a single Railway replica. If we
ever scale to multiple instances we'll need to centralise the schedule
(e.g. Railway Cron Jobs hitting the manual-trigger endpoints).
"""
from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from . import alerts
from .config import get_settings
from .database import SessionLocal

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def _run_delay_alert() -> None:
    db = SessionLocal()
    try:
        result = alerts.send_delay_alert(db)
        logger.info("scheduler.delay_alert result=%s", result)
    except Exception:
        logger.exception("scheduler.delay_alert failed")
    finally:
        db.close()


def _run_weekly_report() -> None:
    db = SessionLocal()
    try:
        result = alerts.send_weekly_report(db)
        logger.info("scheduler.weekly_report result=%s", result)
    except Exception:
        logger.exception("scheduler.weekly_report failed")
    finally:
        db.close()


def start() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    settings = get_settings()
    tz = settings.scheduler_timezone

    sch = BackgroundScheduler(timezone=tz)
    sch.add_job(
        _run_delay_alert,
        CronTrigger(hour=settings.alert_daily_hour, minute=0, timezone=tz),
        id="daily_delay_alert",
        replace_existing=True,
    )
    sch.add_job(
        _run_weekly_report,
        CronTrigger(day_of_week="mon", hour=settings.weekly_report_hour, minute=0, timezone=tz),
        id="weekly_monday_report",
        replace_existing=True,
    )
    sch.start()
    _scheduler = sch
    logger.info(
        "scheduler.started tz=%s daily_hour=%s weekly_hour=%s",
        tz,
        settings.alert_daily_hour,
        settings.weekly_report_hour,
    )


def shutdown() -> None:
    global _scheduler
    if _scheduler is None:
        return
    _scheduler.shutdown(wait=False)
    _scheduler = None
    logger.info("scheduler.stopped")
