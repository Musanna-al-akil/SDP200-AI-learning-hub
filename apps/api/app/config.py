from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv


ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


def _env(name: str, default: str | None = None) -> str:
    if value := os.getenv(name, "").strip():
        return value
    if default is not None:
        return default
    raise RuntimeError(
        f"Missing required environment variable '{name}'. "
        f"Copy .env.example to {ENV_FILE} and set all required values."
    )


def _int_env(name: str, default: str) -> int:
    raw_value = _env(name, default)
    try:
        return int(raw_value)
    except ValueError as error:
        raise RuntimeError(f"{name} must be an integer. Received: '{raw_value}'") from error


def _parse_origins(raw_origins: str) -> list[str]:
    origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
    if not origins:
        raise RuntimeError(
            "CORS_ORIGIN is empty. Provide at least one origin, "
            "for example: http://localhost:3000"
        )
    return origins


@dataclass(frozen=True)
class Settings:
    database_url: str
    r2_account_id: str
    r2_access_key_id: str
    r2_secret_access_key: str
    r2_bucket_name: str
    r2_public_base_url: str
    openrouter_api_key: str
    openrouter_model: str
    jwt_secret_key: str
    session_secret_key: str
    cors_origins: list[str]
    api_host: str
    api_port: int
    api_base_url: str


@lru_cache
def get_settings() -> Settings:
    load_dotenv(ENV_FILE, override=False)

    return Settings(
        database_url=_env("DATABASE_URL"),
        r2_account_id=_env("R2_ACCOUNT_ID"),
        r2_access_key_id=_env("R2_ACCESS_KEY_ID"),
        r2_secret_access_key=_env("R2_SECRET_ACCESS_KEY"),
        r2_bucket_name=_env("R2_BUCKET_NAME"),
        r2_public_base_url=_env("R2_PUBLIC_BASE_URL"),
        openrouter_api_key=_env("OPENROUTER_API_KEY"),
        openrouter_model=_env("OPENROUTER_MODEL"),
        jwt_secret_key=_env("JWT_SECRET_KEY"),
        session_secret_key=_env("SESSION_SECRET_KEY"),
        cors_origins=_parse_origins(_env("CORS_ORIGIN")),
        api_host=_env("API_HOST", "0.0.0.0"),
        api_port=_int_env("API_PORT", "8000"),
        api_base_url=_env("API_BASE_URL", "http://localhost:8000").rstrip("/"),
    )
