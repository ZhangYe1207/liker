"""API routes for AI chat with RAG."""

from __future__ import annotations

import json
from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.auth import get_current_user_id
from app.config import get_settings
from app.db.supabase_client import get_supabase_client
from app.llm import create_chat_provider, create_embedding_provider
from app.services.rag import chat_with_rag_persistent

router = APIRouter(prefix="/api/ai", tags=["ai"])


class ChatRequest(BaseModel):
    message: str
    # UUID-typed so a malformed id is rejected with 422 at the edge rather than
    # blowing up as a 500 deep in the DB layer. Serialized back to str before
    # it reaches supabase-py.
    conversation_id: UUID | None = None


@router.post("/chat")
async def ai_chat(
    request: ChatRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Chat with the AI taste analyst using RAG over user's collection.

    Always streams over SSE with conversation persistence — the old
    non-streaming/non-persistent branch had no callers and was removed.
    """
    settings = get_settings()
    chat_provider = create_chat_provider(settings.LLM_PROVIDER, settings)
    embedding_provider = create_embedding_provider(
        settings.EMBEDDING_PROVIDER, settings
    )
    db_client = get_supabase_client()

    conversation_id = (
        str(request.conversation_id) if request.conversation_id else None
    )

    async def event_generator():
        events = chat_with_rag_persistent(
            chat_provider,
            embedding_provider,
            db_client,
            user_id,
            request.message,
            conversation_id,
        )
        async for event in events:
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(), media_type="text/event-stream"
    )
