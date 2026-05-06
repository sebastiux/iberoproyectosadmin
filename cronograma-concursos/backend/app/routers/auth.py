from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from .. import auth

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    username: str


class MeResponse(BaseModel):
    username: str


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest):
    if not auth.verify_credentials(payload.username, payload.password):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Usuario o contraseña incorrectos",
        )
    return LoginResponse(
        token=auth.create_token(payload.username),
        username=payload.username,
    )


@router.get("/me", response_model=MeResponse)
def me(username: str = Depends(auth.current_user)):
    return MeResponse(username=username)
