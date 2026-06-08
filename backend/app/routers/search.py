"""API routes for AI-powered search."""

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
from app.services.search import search_with_tools_persistent

router = APIRouter(prefix="/api/ai", tags=["ai"])


class SearchRequest(BaseModel):
    query: str
    # See ChatRequest: UUID-typed for 422-at-the-edge, str-ified before the DB.
    conversation_id: UUID | None = None


@router.post("/search")
async def ai_search(
    request: SearchRequest,
    user_id: str = Depends(get_current_user_id),
):
    """AI search with function calling.

    Always streams over SSE with conversation persistence — the old
    non-streaming/non-persistent branch had no callers and was removed.
    """
    settings = get_settings()
    chat_provider = create_chat_provider(settings.LLM_PROVIDER, settings)
    embedding_provider = create_embedding_provider(settings.EMBEDDING_PROVIDER, settings)
    db_client = get_supabase_client()
    tmdb_api_key = settings.TMDB_API_KEY
    conversation_id = (
        str(request.conversation_id) if request.conversation_id else None
    )

    async def event_generator():
        events = search_with_tools_persistent(
            chat_provider,
            embedding_provider,
            db_client,
            user_id,
            request.query,
            conversation_id,
            tmdb_api_key=tmdb_api_key,
        )
        async for event in events:
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(), media_type="text/event-stream"
    )
