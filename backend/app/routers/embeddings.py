"""API routes for embedding operations."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import get_current_user_id
from app.config import get_settings
from app.db.items import get_item_with_category
from app.db.supabase_client import get_supabase_client
from app.llm import create_embedding_provider
from app.schemas import ResponseEnvelope
from app.services.embedding import embed_item, sync_all_embeddings

router = APIRouter(prefix="/api/embeddings", tags=["embeddings"])


@router.post("/sync", response_model=ResponseEnvelope)
async def sync_embeddings(
    user_id: str = Depends(get_current_user_id),
) -> ResponseEnvelope:
    """Bulk sync embeddings for all user items."""
    settings = get_settings()
    provider = create_embedding_provider(settings.EMBEDDING_PROVIDER, settings)
    client = get_supabase_client()
    stats = await sync_all_embeddings(provider, client, user_id)
    return ResponseEnvelope(data=stats)


@router.post("/item/{item_id}", response_model=ResponseEnvelope)
async def embed_single_item(
    item_id: str,
    user_id: str = Depends(get_current_user_id),
) -> ResponseEnvelope:
    """Update embedding for a single item."""
    settings = get_settings()
    provider = create_embedding_provider(settings.EMBEDDING_PROVIDER, settings)
    client = get_supabase_client()
    item = await get_item_with_category(client, item_id, user_id)
    if not item:
        return ResponseEnvelope(error="Item not found")
    was_updated = await embed_item(provider, client, item, user_id)
    return ResponseEnvelope(data={"updated": was_updated})
