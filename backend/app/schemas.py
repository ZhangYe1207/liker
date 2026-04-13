"""Shared Pydantic models used across routers and the app factory."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class ResponseEnvelope(BaseModel):
    """Standard API response wrapper matching the frontend convention."""

    data: Any = None
    error: str | None = None
    metadata: dict[str, Any] | None = None


# ---------------------------------------------------------------------------
# AI chat conversations
# ---------------------------------------------------------------------------


class ConversationOut(BaseModel):
    """Conversation row returned to the frontend."""

    id: str
    title: str
    created_at: datetime
    updated_at: datetime


class MessageOut(BaseModel):
    """Message row returned to the frontend."""

    id: str
    role: str
    content: str
    recommendations: list[dict[str, Any]] | None = None
    created_at: datetime


class RenameConversationRequest(BaseModel):
    title: str
