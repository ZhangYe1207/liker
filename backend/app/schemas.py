"""Shared Pydantic models used across routers and the app factory."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class ResponseEnvelope(BaseModel):
    """Standard API response wrapper matching the frontend convention."""

    data: Any = None
    error: str | None = None
    metadata: dict[str, Any] | None = None
