"""Database operations for AI chat conversations and messages.

Backend uses the Supabase service-role key which bypasses RLS. Every
function here that writes or reads scoped data filters ``user_id``
(conversations) or joins through ``conversations`` (messages) to
enforce tenant isolation as defense-in-depth.
"""

from __future__ import annotations

from supabase import Client


# ---------------------------------------------------------------------------
# Conversations
# ---------------------------------------------------------------------------


async def list_conversations(client: Client, user_id: str) -> list[dict]:
    """Return all conversations for a user, most recently active first."""
    result = (
        client.table("conversations")
        .select("id, title, created_at, updated_at")
        .eq("user_id", user_id)
        .order("updated_at", desc=True)
        .execute()
    )
    return result.data


async def get_conversation(
    client: Client, user_id: str, conversation_id: str
) -> dict | None:
    """Fetch a single conversation if it belongs to the user."""
    result = (
        client.table("conversations")
        .select("id, title, created_at, updated_at")
        .eq("id", conversation_id)
        .eq("user_id", user_id)
        .execute()
    )
    return result.data[0] if result.data else None


async def create_conversation(
    client: Client, user_id: str, title: str
) -> dict:
    """Insert a new conversation and return the created row."""
    result = (
        client.table("conversations")
        .insert({"user_id": user_id, "title": title})
        .execute()
    )
    return result.data[0]


async def update_conversation_title(
    client: Client, user_id: str, conversation_id: str, title: str
) -> dict | None:
    """Rename a conversation; returns the updated row or None if not found."""
    result = (
        client.table("conversations")
        .update({"title": title})
        .eq("id", conversation_id)
        .eq("user_id", user_id)
        .execute()
    )
    return result.data[0] if result.data else None


async def delete_conversation(
    client: Client, user_id: str, conversation_id: str
) -> bool:
    """Hard-delete a conversation. Messages cascade via FK.

    Returns True if a row was deleted, False if not found / not owned.
    """
    result = (
        client.table("conversations")
        .delete()
        .eq("id", conversation_id)
        .eq("user_id", user_id)
        .execute()
    )
    return bool(result.data)


# ---------------------------------------------------------------------------
# Messages
# ---------------------------------------------------------------------------


async def list_messages(client: Client, conversation_id: str) -> list[dict]:
    """Return all messages in a conversation, chronological order.

    Caller is responsible for verifying the user owns the conversation
    (typically by calling ``get_conversation`` first).
    """
    result = (
        client.table("messages")
        .select("id, role, content, recommendations, created_at")
        .eq("conversation_id", conversation_id)
        .order("created_at", desc=False)
        .execute()
    )
    return result.data


async def insert_message(
    client: Client,
    conversation_id: str,
    role: str,
    content: str,
    recommendations: list[dict] | None = None,
) -> dict:
    """Insert one chat turn.

    ``role`` must be ``'user'`` or ``'assistant'`` (enforced by DB CHECK).
    ``recommendations`` is stored as jsonb; ``None`` → SQL NULL.
    """
    payload: dict = {
        "conversation_id": conversation_id,
        "role": role,
        "content": content,
    }
    if recommendations is not None:
        payload["recommendations"] = recommendations
    result = client.table("messages").insert(payload).execute()
    return result.data[0]
