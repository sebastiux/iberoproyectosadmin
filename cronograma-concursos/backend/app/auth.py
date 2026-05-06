"""Tiny env-based auth.

Users live in a single env var (`AUTH_USERS=user1:pw1,user2:pw2`). On
login we hand back a short-signed token (`<user>.<expiry>.<sig>`) that
clients send back as `Authorization: Bearer ...`. No DB, no sessions.

The signing secret comes from `AUTH_SECRET`. If it's missing we derive
a per-process one so dev still works, but production deploys must set
it explicitly so tokens survive restarts.
"""
from __future__ import annotations

import base64
import hmac
import logging
import secrets
import time
from hashlib import sha256

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import get_settings

logger = logging.getLogger(__name__)

_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60  # 7 days


def _parse_users(raw: str) -> dict[str, str]:
    users: dict[str, str] = {}
    for pair in raw.split(","):
        pair = pair.strip()
        if not pair or ":" not in pair:
            continue
        user, _, pw = pair.partition(":")
        user = user.strip()
        pw = pw.strip()
        if user and pw:
            users[user] = pw
    return users


def _get_users() -> dict[str, str]:
    return _parse_users(get_settings().auth_users)


def _get_secret() -> bytes:
    secret = get_settings().auth_secret
    if not secret:
        # Per-process fallback so dev runs without configuration. Tokens
        # become invalid on each restart, which is fine locally and an
        # obvious nudge to set AUTH_SECRET in production.
        global _EPHEMERAL_SECRET
        try:
            return _EPHEMERAL_SECRET
        except NameError:
            _EPHEMERAL_SECRET = secrets.token_bytes(32)
            logger.warning(
                "AUTH_SECRET not set — using ephemeral per-process secret. "
                "Tokens will not survive a restart."
            )
            return _EPHEMERAL_SECRET
    return secret.encode("utf-8")


def _sign(payload: str) -> str:
    sig = hmac.new(_get_secret(), payload.encode("utf-8"), sha256).digest()
    return base64.urlsafe_b64encode(sig).rstrip(b"=").decode("ascii")


def verify_credentials(username: str, password: str) -> bool:
    expected = _get_users().get(username)
    if expected is None:
        # Constant-ish time even when the user doesn't exist.
        hmac.compare_digest("x", "y")
        return False
    return hmac.compare_digest(expected, password)


def create_token(username: str, ttl_seconds: int = _TOKEN_TTL_SECONDS) -> str:
    expiry = int(time.time()) + ttl_seconds
    payload = f"{username}.{expiry}"
    return f"{payload}.{_sign(payload)}"


def verify_token(token: str) -> str:
    """Returns the username if valid; raises HTTPException(401) otherwise."""
    try:
        username, expiry_str, sig = token.rsplit(".", 2)
        expiry = int(expiry_str)
    except (ValueError, AttributeError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token inválido")

    if expiry < int(time.time()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token expirado")

    expected_sig = _sign(f"{username}.{expiry}")
    if not hmac.compare_digest(expected_sig, sig):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Firma de token inválida")

    if username not in _get_users():
        # User was removed from AUTH_USERS after token issue.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario ya no existe")

    return username


_bearer_scheme = HTTPBearer(auto_error=False)


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> str:
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Falta el token de autenticación",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return verify_token(credentials.credentials)
