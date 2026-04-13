from __future__ import annotations

from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables / .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Supabase ---
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_JWT_SECRET: str = ""

    # --- LLM ---
    LLM_PROVIDER: Literal["claude", "openai", "deepseek", "kimi", "minimax"] = "claude"

    CLAUDE_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    DEEPSEEK_API_KEY: str = ""
    KIMI_API_KEY: str = ""
    MINIMAX_API_KEY: str = ""

    # --- Embedding ---
    EMBEDDING_PROVIDER: Literal["openai", "minimax"] = "minimax"

    # --- External APIs ---
    TMDB_API_KEY: str = ""

    # --- CORS ---
    CORS_ORIGINS: str = Field(default="http://localhost:5173")

    @property
    def cors_origin_list(self) -> list[str]:
        """Parse the comma-separated CORS_ORIGINS string into a list."""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


def get_settings() -> Settings:
    """Return a cached Settings instance (one per process)."""
    return _settings


_settings = Settings()
