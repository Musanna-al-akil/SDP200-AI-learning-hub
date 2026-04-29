from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from fastapi_users import exceptions

from app.models import User
from app.schemas import AuthResponse, LoginRequest, LogoutResponse, UserCreate, UserRead
from app.users import auth_backend, current_active_user, get_user_manager

router = APIRouter(prefix="/auth", tags=["auth"])


def _error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"error": {"code": code, "message": message}})


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: UserCreate, user_manager=Depends(get_user_manager)) -> AuthResponse:
    try:
        user = await user_manager.create(payload, safe=True)
    except exceptions.UserAlreadyExists as error:
        raise _error(status.HTTP_400_BAD_REQUEST, "user_exists", "User with this email already exists.") from error

    strategy = auth_backend.get_strategy()
    token = await strategy.write_token(user)
    return AuthResponse(user=UserRead.model_validate(user), token=token)


@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest, user_manager=Depends(get_user_manager)) -> AuthResponse:
    credentials = OAuth2PasswordRequestForm(
        username=payload.email,
        password=payload.password,
        scope="",
        client_id=None,
        client_secret=None,
    )
    user = await user_manager.authenticate(credentials)
    if user is None:
        raise _error(status.HTTP_401_UNAUTHORIZED, "invalid_credentials", "Invalid email or password.")

    strategy = auth_backend.get_strategy()
    token = await strategy.write_token(user)
    return AuthResponse(user=UserRead.model_validate(user), token=token)


@router.post("/logout", response_model=LogoutResponse)
async def logout(user: User = Depends(current_active_user)) -> LogoutResponse:
    _ = user
    return LogoutResponse(success=True)


@router.get("/me", response_model=UserRead)
async def me(user: User = Depends(current_active_user)) -> UserRead:
    return UserRead.model_validate(user)
