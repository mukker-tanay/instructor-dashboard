"""Application configuration loaded from environment variables."""

import os
from pathlib import Path
from pydantic_settings import BaseSettings
from typing import List

# Resolve .env relative to backend/ directory (parent of app/)
_BACKEND_DIR = Path(__file__).resolve().parent.parent
_ENV_FILE = _BACKEND_DIR / ".env"


class Settings(BaseSettings):
    # Google OAuth
    google_client_id: str = ""
    google_client_secret: str = ""

    # Google Sheets
    google_service_account_file: str = "service-account.json"
    google_credentials_json: str = ""
    spreadsheet_id: str = ""

    # Slack
    slack_webhook_url: str = ""

    # JWT
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expiry_hours: int = 24

    # Frontend
    frontend_url: str = "http://localhost:5173"
    
    # API Base URL (for OAuth redirects)
    # In dev: http://localhost:5173 (proxied) or http://localhost:8000
    # In prod: https://<your-backend>.onrender.com
    api_base_url: str = ""

    # Admin emails (comma-separated)
    admin_emails: str = ""

    # Cache
    cache_refresh_seconds: int = 120

    @property
    def admin_email_list(self) -> List[str]:
        if not self.admin_emails:
            return []
        return [e.strip().lower() for e in self.admin_emails.split(",") if e.strip()]

    class Config:
        env_file = str(_ENV_FILE)
        env_file_encoding = "utf-8"


settings = Settings()

