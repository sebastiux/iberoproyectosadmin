from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from .. import auth, email_service
from ..config import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    # Either a token (single-step flow) OR a challenge (two-step flow).
    token: str | None = None
    username: str | None = None
    requires_code: bool = False
    challenge_id: str | None = None
    email_hint: str | None = None
    message: str | None = None


class VerifyRequest(BaseModel):
    challenge_id: str
    code: str


class TokenResponse(BaseModel):
    token: str
    username: str


class MeResponse(BaseModel):
    username: str
    email: str | None = None


def _email_hint(email: str) -> str:
    name, _, domain = email.partition("@")
    if len(name) <= 2:
        masked_name = name[0] + "*"
    else:
        masked_name = name[0] + "***" + name[-1]
    return f"{masked_name}@{domain}"


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest):
    user = auth.verify_credentials(payload.username, payload.password)
    if user is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Usuario o contraseña incorrectos",
        )

    # If the user has an email AND Resend is configured, require the OTP
    # second step. Otherwise hand back a token immediately.
    if user.email and email_service.is_configured():
        challenge_id, code = auth.issue_challenge(user.username)
        sent = email_service.send_email(
            user.email,
            subject="Tu código de acceso a Cronograma",
            html=_otp_email_html(user.username, code),
            text=f"Tu código de acceso es: {code}\nExpira en 10 minutos.",
        )
        if not sent:
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                "No se pudo enviar el código por correo. Intenta de nuevo en un momento.",
            )
        return LoginResponse(
            requires_code=True,
            challenge_id=challenge_id,
            email_hint=_email_hint(user.email),
            message="Te enviamos un código de 6 dígitos a tu correo.",
        )

    return LoginResponse(
        token=auth.create_token(user.username),
        username=user.username,
    )


@router.post("/verify-code", response_model=TokenResponse)
def verify_code(payload: VerifyRequest):
    code = payload.code.strip().replace(" ", "")
    username = auth.verify_challenge(payload.challenge_id, code)
    if username is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Código inválido o expirado.",
        )
    return TokenResponse(token=auth.create_token(username), username=username)


@router.get("/me", response_model=MeResponse)
def me(username: str = Depends(auth.current_user)):
    user = auth.get_user(username)
    return MeResponse(
        username=username,
        email=user.email if user else None,
    )


def _otp_email_html(username: str, code: str) -> str:
    settings = get_settings()
    return f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="font-weight: 500; margin: 0 0 16px;">Hola, {username}</h2>
      <p style="color: #444; line-height: 1.5;">
        Usa este código para terminar de iniciar sesión en
        <strong>Cronograma Concursos</strong>:
      </p>
      <p style="font-size: 28px; letter-spacing: 6px; font-weight: 600; background: #f5f5f4; padding: 16px; text-align: center; border-radius: 4px; margin: 24px 0;">
        {code}
      </p>
      <p style="color: #666; font-size: 13px; line-height: 1.5;">
        El código expira en 10 minutos. Si no solicitaste este acceso, puedes ignorar este correo.
      </p>
      <p style="color: #999; font-size: 12px; margin-top: 32px;">
        <a href="{settings.public_app_url}" style="color: #999;">{settings.public_app_url}</a>
      </p>
    </div>
    """
