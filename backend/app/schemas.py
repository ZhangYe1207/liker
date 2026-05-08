"""Shared Pydantic models used across routers and the app factory."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

# Cap conversation title length so the rename endpoint can't be abused to
# stash multi-MB strings on a row. 100 chars matches the DB CHECK we add in
# migration 006.
CONVERSATION_TITLE_MAX_LEN = 100


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
    title: str = Field(max_length=CONVERSATION_TITLE_MAX_LEN)
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
    title: str = Field(min_length=1, max_length=CONVERSATION_TITLE_MAX_LEN)
