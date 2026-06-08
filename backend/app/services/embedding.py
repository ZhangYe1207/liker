"""Embedding service — build text, hash, embed, and sync items."""

from __future__ import annotations

import hashlib

from supabase import Client

from app.db.embeddings import get_embedding, upsert_embedding
from app.db.items import get_user_items
from app.llm.protocols import EmbeddingProvider

# Truncate long free-form fields before joining. MiniMax embo-01 caps single
# inputs around 500 tokens; 600 chars stays safely under that for mixed
# zh/en content and avoids losing entire items to one runaway review.
_MAX_FIELD_CHARS = 600
# MiniMax supports up to 32 texts per embeddings request; batching slashes
# RPM pressure by the same factor.
_EMBED_BATCH_SIZE = 32


def _truncate(text: str, limit: int = _MAX_FIELD_CHARS) -> str:
    if len(text) <= limit:
        return text
    return text[:limit]


def build_embedding_text(item: dict) -> str:
    """Assemble text for embedding from item fields.

    Combines title, category name, description, review, rating, and genre
    into a single string suitable for embedding. Long free-form fields
    (description, review) are truncated to stay under the per-input token
    limit of the embedding model.
    """
    parts: list[str] = [item.get("title", "")]

    # Category info comes from the Supabase join (items + categories)
    categories = item.get("categories", {})
    if isinstance(categories, dict):
        cat_name = categories.get("name", "")
        if cat_name:
            parts.append(cat_name)

    if item.get("description"):
        parts.append(_truncate(item["description"]))
    if item.get("review"):
        parts.append(_truncate(item["review"]))
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

    pending: list[tuple[dict, str, str]] = []  # (item, text, hash)
    skipped = 0
    for item in items:
        text = build_embedding_text(item)
        new_hash = compute_content_hash(text)
        existing = await get_embedding(db_client, item["id"])
        if existing and existing.get("content_hash") == new_hash:
            skipped += 1
            continue
        pending.append((item, text, new_hash))

    updated = 0
    for start in range(0, len(pending), _EMBED_BATCH_SIZE):
        batch = pending[start : start + _EMBED_BATCH_SIZE]
        texts = [text for _, text, _ in batch]
        vectors = await embedding_provider.embed(texts)
        for (item, _, new_hash), vector in zip(batch, vectors):
            await upsert_embedding(
                db_client, item["id"], user_id, vector, new_hash
            )
            updated += 1

    return {"total": len(items), "updated": updated, "skipped": skipped}
