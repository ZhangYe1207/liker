"""Shared helpers for persisting chat/search interactions to conversations.

Both ``/api/ai/chat`` and ``/api/ai/search`` share the same persistence
contract:

1. Lazily create a conversation when the caller passes ``conversation_id=None``.
2. Eagerly write the user's message before hitting the LLM (so refresh-mid-stream
   still shows the prompt).
3. After the stream completes, write the assistant's message with the
   accumulated content (and recommendations, for search).

Helpers here are thin wrappers over ``db.conversations`` with the title-truncation
and history-shape conversions that the services care about.
"""

from __future__ import annotations

from typing import Any

from supabase import Client

from app.db.conversations import (
    create_conversation,
    insert_message,
    list_messages,
)

TITLE_MAX_LEN = 20


def _title_from_message(message: str) -> str:
    """Truncate the first user message to form a conversation title.

    Strips leading/trailing whitespace so multi-line prompts produce a
    readable title.
    """
    cleaned = (message or "").strip()
    if len(cleaned) <= TITLE_MAX_LEN:
        return cleaned or "新对话"
    return cleaned[:TITLE_MAX_LEN]


async def ensure_conversation(
    client: Client,
    user_id: str,
    conversation_id: str | None,
    first_user_message: str,
) -> tuple[str, bool]:
    """Return ``(conversation_id, is_new)``.

    If *conversation_id* is ``None``, creates a new conversation with a title
    derived from *first_user_message* and returns ``is_new=True``. Otherwise
    returns the given id as-is.
    """
    if conversation_id:
        return conversation_id, False

    title = _title_from_message(first_user_message)
    row = await create_conversation(client, user_id, title)
    return row["id"], True


async def load_history(
    client: Client, conversation_id: str
) -> list[dict[str, str]]:
    """Load messages for *conversation_id* as a list of ``{role, content}`` dicts.

    Strips the ``recommendations`` / ``id`` / ``created_at`` fields — the LLM
    only needs role + content to continue the conversation.
    """
    rows = await list_messages(client, conversation_id)
    return [{"role": r["role"], "content": r["content"]} for r in rows]


async def persist_user_message(
    client: Client, conversation_id: str, content: str
) -> dict[str, Any]:
    """Write the user's message. Thin alias to keep call sites expressive."""
    return await insert_message(client, conversation_id, "user", content)


async def persist_assistant_message(
    client: Client,
    conversation_id: str,
    content: str,
    recommendations: list[dict] | None = None,
) -> dict[str, Any]:
    """Write the assistant's final message after the stream completes."""
    return await insert_message(
        client,
        conversation_id,
        "assistant",
        content,
        recommendations=recommendations,
    )
