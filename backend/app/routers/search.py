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
from app.services.search import search_with_tools

router = APIRouter(prefix="/api/ai", tags=["ai"])


class SearchRequest(BaseModel):
    query: str
    stream: bool = True


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
            result, recommendations = await search_with_tools(
                chat_provider,
                embedding_provider,
                db_client,
                user_id,
                request.query,
                stream=True,
                tmdb_api_key=tmdb_api_key,
            )
            # First send recommendations as a special event
            if recommendations:
                yield (
                    f"data: {json.dumps({'type': 'recommendations', 'items': recommendations}, ensure_ascii=False)}\n\n"
                )
            # Then stream the LLM response
            async for chunk in result:
                yield f"data: {json.dumps({'type': 'content', **chunk}, ensure_ascii=False)}\n\n"

        return StreamingResponse(
            event_generator(), media_type="text/event-stream"
        )
    else:
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
