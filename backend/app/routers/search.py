"""API routes for AI-powered search."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.auth import get_current_user_id
from app.config import get_settings
from app.db.supabase_client import get_supabase_client
from app.llm import create_chat_provider, create_embedding_provider
from app.schemas import ResponseEnvelope
from app.services.search import search_with_tools, search_with_tools_persistent

router = APIRouter(prefix="/api/ai", tags=["ai"])


class SearchRequest(BaseModel):
    query: str
    stream: bool = True
    conversation_id: str | None = None


@router.post("/search")
async def ai_search(
    request: SearchRequest,
    user_id: str = Depends(get_current_user_id),
):
    settings = get_settings()
    chat_provider = create_chat_provider(settings.LLM_PROVIDER, settings)
    embedding_provider = create_embedding_provider(settings.EMBEDDING_PROVIDER, settings)
    db_client = get_supabase_client()
    tmdb_api_key = settings.TMDB_API_KEY

    if request.stream:

        async def event_generator():
            events = search_with_tools_persistent(
                chat_provider,
                embedding_provider,
                db_client,
                user_id,
                request.query,
                request.conversation_id,
                tmdb_api_key=tmdb_api_key,
            )
            async for event in events:
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

        return StreamingResponse(
            event_generator(), media_type="text/event-stream"
        )

    # Non-streaming path kept for ad-hoc callers and intentionally bypasses
    # persistence — it's the only way to return the full recommendations array
    # alongside the synthesised response.
    result, recommendations = await search_with_tools(
        chat_provider,
        embedding_provider,
        db_client,
        user_id,
        request.query,
        stream=False,
        tmdb_api_key=tmdb_api_key,
    )
    return ResponseEnvelope(
        data={"response": result, "recommendations": recommendations}
    )
