from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import alerts, email_service
from ..auth import current_user
from ..database import get_db

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(current_user)],
)


@router.post("/alerts/delays")
def trigger_delay_alert(db: Session = Depends(get_db)):
    return alerts.send_delay_alert(db)


@router.post("/alerts/weekly")
def trigger_weekly_report(db: Session = Depends(get_db)):
    return alerts.send_weekly_report(db)


@router.get("/alerts/status")
def alerts_status(db: Session = Depends(get_db)):
    """Quick visibility into what *would* go out without sending."""
    return {
        "resend_configured": email_service.is_configured(),
        "overdue_count": len(alerts.find_overdue_tasks(db)),
        "recipients": alerts._recipients(),
    }
