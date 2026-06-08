from __future__ import annotations

from supabase import Client


async def get_user_items(client: Client, user_id: str) -> list[dict]:
    """Get all items for a user with their category info."""
    result = (
        client.table("items")
        .select("*, categories(name, icon)")
        .eq("user_id", user_id)
        .execute()
    )
    return result.data


async def get_user_categories(client: Client, user_id: str) -> list[dict]:
    """Get all categories for a user."""
    result = (
        client.table("categories")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )
    return result.data


async def get_item_with_category(
    client: Client, item_id: str, user_id: str
) -> dict | None:
    """Get a single item with its category, filtered by user_id."""
    result = (
        client.table("items")
        .select("*, categories(name, icon)")
        .eq("id", item_id)
        .eq("user_id", user_id)
        .execute()
    )
    return result.data[0] if result.data else None
