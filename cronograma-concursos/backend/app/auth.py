"""Env-based auth with optional Resend email-OTP confirmation.

User entries in `AUTH_USERS` are comma-separated. Each entry is one of:

    user:password
    user:password:email@domain.com

When an email is present and Resend is configured, login becomes a
two-step flow: POST /auth/login validates the password and emails a
6-digit code; POST /auth/verify-code exchanges the code for a token.
Without Resend (no API key) or without an email, login is single-step
and returns a token directly.

Tokens are signed `<user>.<expiry>.<sig>` strings with a 7-day TTL.
"""
from __future__ import annotations

import base64
import hmac
import logging
import secrets
import time
from dataclasses import dataclass
from hashlib import sha256

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import get_settings

logger = logging.getLogger(__name__)

_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60  # 7 days
_OTP_TTL_SECONDS = 10 * 60             # 10 minutes
_CHALLENGE_TTL_SECONDS = 10 * 60


@dataclass
class User:
    username: str
    password: str
    email: str | None


def _parse_users(raw: str) -> dict[str, User]:
    users: dict[str, User] = {}
    for pair in raw.split(","):
        pair = pair.strip()
        if not pair or ":" not in pair:
            continue
        parts = [p.strip() for p in pair.split(":")]
        # Recombine in case the password legitimately contains ':' — only
        # the last segment is treated as an email if it looks like one.
        if len(parts) >= 3 and "@" in parts[-1]:
            user, pw, email = parts[0], ":".join(parts[1:-1]), parts[-1]
        else:
            user, pw, email = parts[0], ":".join(parts[1:]), None
        if user and pw:
            users[user] = User(username=user, password=pw, email=email or None)
    return users


def _get_users() -> dict[str, User]:
    return _parse_users(get_settings().auth_users)


def get_user(username: str) -> User | None:
    return _get_users().get(username)


def all_user_emails() -> list[str]:
    return [u.email for u in _get_users().values() if u.email]


def _get_secret() -> bytes:
    secret = get_settings().auth_secret
    if not secret:
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


def verify_credentials(username: str, password: str) -> User | None:
    user = _get_users().get(username)
    if user is None:
        hmac.compare_digest("x", "y")  # rough timing parity
        return None
    if hmac.compare_digest(user.password, password):
        return user
    return None


def create_token(username: str, ttl_seconds: int = _TOKEN_TTL_SECONDS) -> str:
    expiry = int(time.time()) + ttl_seconds
    payload = f"{username}.{expiry}"
    return f"{payload}.{_sign(payload)}"


def verify_token(token: str) -> str:
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
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario ya no existe")
    return username


# ---------------------------------------------------------------------------
# Email-OTP challenge
# ---------------------------------------------------------------------------
#
# After a successful password we hand the client a `challenge_id` and email
# them a 6-digit code. They POST both back to /auth/verify-code to exchange
# them for an access token. Challenges live in-process so they don't survive
# a restart — fine for our scale, and keeps the surface area small.

@dataclass
class _Challenge:
    username: str
    code_hash: str
    expires_at: int


_challenges: dict[str, _Challenge] = {}


def _hash_code(code: str) -> str:
    return sha256((_get_secret() + code.encode()).hex().encode()).hexdigest()


def issue_challenge(username: str) -> tuple[str, str]:
    """Returns (challenge_id, plain_code). Caller is responsible for emailing
    the code to the user — we never store it in cleartext."""
    challenge_id = secrets.token_urlsafe(24)
    code = f"{secrets.randbelow(1_000_000):06d}"
    _challenges[challenge_id] = _Challenge(
        username=username,
        code_hash=_hash_code(code),
        expires_at=int(time.time()) + _CHALLENGE_TTL_SECONDS,
    )
    _expire_challenges()
    return challenge_id, code


def verify_challenge(challenge_id: str, code: str) -> str | None:
    """Returns the username if the code matches, or None. Single-use:
    a successful verification deletes the challenge."""
    challenge = _challenges.get(challenge_id)
    if challenge is None:
        return None
    if challenge.expires_at < int(time.time()):
        _challenges.pop(challenge_id, None)
        return None
    if not hmac.compare_digest(challenge.code_hash, _hash_code(code)):
        return None
    _challenges.pop(challenge_id, None)
    return challenge.username


def _expire_challenges() -> None:
    now = int(time.time())
    stale = [k for k, c in _challenges.items() if c.expires_at < now]
    for k in stale:
        _challenges.pop(k, None)


# ---------------------------------------------------------------------------
# Bearer dependency
# ---------------------------------------------------------------------------

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
