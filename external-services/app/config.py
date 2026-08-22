"""
Centralised settings for the TaskForge Services Platform.
All env vars are read here via Pydantic BaseSettings.
"""

import os
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ---- Database ----
    database_url: str = ""

    # ---- Encryption ----
    # 32-byte (64 hex chars) secret key for AES-256-GCM
    # Generate: python -c "import secrets; print(secrets.token_hex(32))"
    secret_key: str = ""

    # ---- Mail (SMTP) ----
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    frontend_url: str = "http://localhost:3000"



    # ---- Internal service URLs ----
    jwks_url: str = ""
    core_service_url: str = "http://core-service:8081"

    # ---- AI providers ----
    # Providers supported: openai, anthropic, google
    supported_providers: list[str] = ["openai", "anthropic", "google"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
