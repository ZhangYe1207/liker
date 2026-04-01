"""Embedding service — build text, hash, embed, and sync items."""

from __future__ import annotations

import hashlib

from supabase import Client

from app.db.embeddings import get_embedding, upsert_embedding
from app.db.items import get_user_items
from app.llm.protocols import EmbeddingProvider


def build_embedding_text(item: dict) -> str:
    """Assemble text for embedding from item fields.

    Combines title, category name, description, review, rating, and genre
    into a single string suitable for embedding.
    """
    parts: list[str] = [item.get("title", "")]

    # Category info comes from the Supabase join (items + categories)
    categories = item.get("categories", {})
    if isinstance(categories, dict):
        cat_name = categories.get("name", "")
        if cat_name:
            parts.append(cat_name)

    if item.get("description"):
        parts.append(item["description"])
    if item.get("review"):
        parts.append(item["review"])
    if item.get("rating"):
        parts.append(f"评分: {item['rating']}/5")
    if item.get("genre"):
        parts.append(item["genre"])

    return " ".join(filter(None, parts))


def compute_content_hash(text: str) -> str:
    """Return a SHA-256 hex digest for *text*."""
    return hashlib.sha256(text.encode()).hexdigest()


async def embed_item(
    embedding_provider: EmbeddingProvider,
    db_client: Client,
    item: dict,
    user_id: str,
) -> bool:
    """Embed a single item.

    Returns ``True`` if the embedding was created/updated, ``False`` if
    skipped because the content hash has not changed.
    """
    text = build_embedding_text(item)
    new_hash = compute_content_hash(text)

    # Check if an up-to-date embedding already exists
    existing = await get_embedding(db_client, item["id"])
    if existing and existing.get("content_hash") == new_hash:
        return False  # content unchanged — skip

    # Generate embedding via the provider
    vectors = await embedding_provider.embed([text])
    embedding = vectors[0]

    # Persist
    await upsert_embedding(db_client, item["id"], user_id, embedding, new_hash)
    return True


async def sync_all_embeddings(
    embedding_provider: EmbeddingProvider,
    db_client: Client,
    user_id: str,
) -> dict:
    """Sync embeddings for all items belonging to *user_id*.

    Returns a stats dict with keys ``total``, ``updated``, ``skipped``.
    """
    items = await get_user_items(db_client, user_id)
    updated = 0
    skipped = 0
    for item in items:
        was_updated = await embed_item(embedding_provider, db_client, item, user_id)
        if was_updated:
            updated += 1
        else:
            skipped += 1
    return {"total": len(items), "updated": updated, "skipped": skipped}
