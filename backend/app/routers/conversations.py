"""REST endpoints for AI chat conversations (list / rename / delete).

Creation is **not** exposed here: new conversations are created lazily
by ``/api/ai/chat`` when the first user message arrives. See
``services/rag.py`` and ``services/search.py`` for that path.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user_id
from app.db.conversations import (
    delete_conversation,
    list_conversations,
    list_messages,
    update_conversation_title,
    get_conversation,
)
from app.db.supabase_client import get_supabase_client
from app.schemas import RenameConversationRequest, ResponseEnvelope

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


@router.get("", response_model=ResponseEnvelope)
async def list_user_conversations(
    user_id: str = Depends(get_current_user_id),
) -> ResponseEnvelope:
    """Return all conversations for the caller, most recent first."""
    client = get_supabase_client()
    rows = await list_conversations(client, user_id)
    return ResponseEnvelope(data=rows)


@router.get("/{conversation_id}/messages", response_model=ResponseEnvelope)
async def get_conversation_messages(
    conversation_id: str,
    user_id: str = Depends(get_current_user_id),
) -> ResponseEnvelope:
    """Return messages for a conversation the caller owns (chronological)."""
    client = get_supabase_client()
    owned = await get_conversation(client, user_id, conversation_id)
    if not owned:
        raise HTTPException(status_code=404, detail="Conversation not found")
    rows = await list_messages(client, conversation_id)
    return ResponseEnvelope(data=rows)


@router.patch("/{conversation_id}", response_model=ResponseEnvelope)
async def rename_conversation(
    conversation_id: str,
    payload: RenameConversationRequest,
    user_id: str = Depends(get_current_user_id),
) -> ResponseEnvelope:
    """Rename a conversation. 404 if missing or not owned."""
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title cannot be empty")
    client = get_supabase_client()
    updated = await update_conversation_title(
        client, user_id, conversation_id, title
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return ResponseEnvelope(data=updated)


@router.delete("/{conversation_id}", response_model=ResponseEnvelope)
async def remove_conversation(
    conversation_id: str,
    user_id: str = Depends(get_current_user_id),
) -> ResponseEnvelope:
    """Hard-delete a conversation (messages cascade via FK)."""
    client = get_supabase_client()
    ok = await delete_conversation(client, user_id, conversation_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return ResponseEnvelope(data={"deleted": True})
