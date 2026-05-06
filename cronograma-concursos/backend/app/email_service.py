"""Tiny Resend wrapper.

Uses the REST API directly so we don't pull in the official SDK. When
RESEND_API_KEY is not set, calls become no-ops that log a warning so
local development doesn't need a real key.
"""
from __future__ import annotations

import logging
from typing import Iterable

import httpx

from .config import get_settings

logger = logging.getLogger(__name__)

_RESEND_URL = "https://api.resend.com/emails"


def is_configured() -> bool:
    return bool(get_settings().resend_api_key)


def send_email(
    to: str | Iterable[str],
    subject: str,
    html: str,
    *,
    text: str | None = None,
) -> bool:
    """Send via Resend. Returns True on success, False otherwise.

    Always swallows network errors: scheduled jobs should keep running
    even if a single send fails, and login flows fall back to telling
    the user to retry.
    """
    settings = get_settings()
    if not settings.resend_api_key:
        logger.warning(
            "email.skip reason=no_api_key to=%s subject=%s",
            to,
            subject,
        )
        return False

    recipients = [to] if isinstance(to, str) else list(to)
    if not recipients:
        return False

    payload: dict = {
        "from": settings.resend_from,
        "to": recipients,
        "subject": subject,
        "html": html,
    }
    if text:
        payload["text"] = text

    try:
        with httpx.Client(timeout=10.0) as client:
            r = client.post(
                _RESEND_URL,
                headers={
                    "Authorization": f"Bearer {settings.resend_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        if r.status_code >= 400:
            logger.error(
                "email.resend_error status=%s body=%s",
                r.status_code,
                r.text[:500],
            )
            return False
        logger.info("email.sent to=%s subject=%s", recipients, subject)
        return True
    except Exception:
        logger.exception("email.send_exception to=%s subject=%s", recipients, subject)
        return False
