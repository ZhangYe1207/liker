"""Database operations for item embeddings (pgvector)."""

from __future__ import annotations

from supabase import Client


async def upsert_embedding(
    client: Client,
    item_id: str,
    user_id: str,
    embedding: list[float],
    content_hash: str,
) -> None:
    """Insert or update embedding for an item."""
    client.table("item_embeddings").upsert(
        {
            "item_id": item_id,
            "user_id": user_id,
            "embedding": embedding,
            "content_hash": content_hash,
        },
        on_conflict="item_id",
    ).execute()


async def get_embedding(client: Client, item_id: str) -> dict | None:
    """Get embedding record for an item."""
    result = (
        client.table("item_embeddings")
        .select("*")
        .eq("item_id", item_id)
        .execute()
    )
    return result.data[0] if result.data else None


async def delete_embedding(client: Client, item_id: str) -> None:
    """Delete embedding for an item."""
    client.table("item_embeddings").delete().eq("item_id", item_id).execute()


async def similarity_search(
    client: Client,
    user_id: str,
    query_embedding: list[float],
    limit: int = 10,
) -> list[dict]:
    """Find most similar items using pgvector cosine distance.

    Uses a Supabase RPC call to the ``match_item_embeddings`` SQL function.
    """
    result = client.rpc(
        "match_item_embeddings",
        {
            "query_embedding": query_embedding,
            "match_user_id": user_id,
            "match_count": limit,
        },
    ).execute()
    return result.data
