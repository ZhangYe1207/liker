"""API routes for AI chat with RAG."""

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
from app.services.rag import chat_with_rag

router = APIRouter(prefix="/api/ai", tags=["ai"])


class ChatRequest(BaseModel):
    message: str
    stream: bool = True


@router.post("/chat")
async def ai_chat(
    request: ChatRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Chat with the AI taste analyst using RAG over user's collection."""
    settings = get_settings()
    chat_provider = create_chat_provider(settings.LLM_PROVIDER, settings)
    embedding_provider = create_embedding_provider(
        settings.EMBEDDING_PROVIDER, settings
    )
    db_client = get_supabase_client()

    if request.stream:

        async def event_generator():
            result = await chat_with_rag(
                chat_provider,
                embedding_provider,
                db_client,
                user_id,
                request.message,
                stream=True,
            )
            async for chunk in result:
                yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"

        return StreamingResponse(
            event_generator(), media_type="text/event-stream"
        )
    else:
        result = await chat_with_rag(
            chat_provider,
            embedding_provider,
            db_client,
            user_id,
            request.message,
            stream=False,
        )
        return ResponseEnvelope(data=result)
