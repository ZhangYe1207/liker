"""RAG pipeline: retrieve relevant items, assemble context, generate response."""

from __future__ import annotations

from typing import AsyncIterator

from supabase import Client

from app.db.embeddings import similarity_search
from app.db.items import get_items_by_ids
from app.llm.protocols import ChatProvider, EmbeddingProvider
from app.services.conversation_helpers import (
    ConversationNotFoundError,
    ensure_conversation,
    load_history,
    persist_assistant_message,
    persist_user_message,
)

SYSTEM_PROMPT = """你是 Liker 的 AI 品味分析师。你的任务是根据用户的收藏数据分析他们的品味偏好。

规则：
- 始终使用中文回复
- 基于用户的实际收藏数据进行分析，引用具体条目
- 如果用户没有相关收藏，诚实说明
- 保持对话性和友好的语气
- 分析要有洞察力，不只是列举数据"""


async def retrieve_context(
    embedding_provider: EmbeddingProvider,
    db_client: Client,
    user_id: str,
    query: str,
    limit: int = 10,
) -> tuple[list[dict], list[float]]:
    """Embed the query and find similar items.

    Returns a tuple of (context_items, query_embedding).
    """
    query_vectors = await embedding_provider.embed([query], query=True)
    query_embedding = query_vectors[0]
    matches = await similarity_search(db_client, user_id, query_embedding, limit)

    if not matches:
        return [], query_embedding

    item_ids = [m["item_id"] for m in matches]
    items = await get_items_by_ids(db_client, user_id, item_ids)
    items_by_id = {item["id"]: item for item in items}

    context_items = []
    for match in matches:
        item = items_by_id.get(match["item_id"])
        if item:
            context_items.append({**item, "similarity": match["similarity"]})

    return context_items, query_embedding


def format_context(items: list[dict]) -> str:
    """Format retrieved items as context string for the LLM."""
    if not items:
        return "用户目前没有相关收藏数据。"

    lines = ["以下是用户收藏中与问题相关的条目：\n"]
    for i, item in enumerate(items, 1):
        cat = item.get("categories", {})
        cat_name = cat.get("name", "") if isinstance(cat, dict) else ""
        line = f"{i}. 【{cat_name}】{item['title']}"
        if item.get("rating"):
            line += f" - 评分: {item['rating']}/5"
        if item.get("review"):
            line += f"\n   评价: {item['review']}"
        if item.get("description"):
            line += f"\n   简介: {item['description'][:100]}"
        lines.append(line)
    return "\n".join(lines)


def _build_llm_messages(
    history: list[dict],
    context_text: str,
    current_message: str,
) -> list[dict]:
    """Compose the message array handed to the LLM.

    History already contains the *current* user message (we persisted it
    before loading history), so we drop the last entry and re-attach a
    context-augmented version — prior assistant turns stay intact.
    """
    prior = history[:-1] if history else []
    augmented_user = {
        "role": "user",
        "content": f"【收藏数据参考】\n{context_text}\n\n【用户问题】\n{current_message}",
    }
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        *prior,
        augmented_user,
    ]


async def chat_with_rag_persistent(
    chat_provider: ChatProvider,
    embedding_provider: EmbeddingProvider,
    db_client: Client,
    user_id: str,
    message: str,
    conversation_id: str | None,
) -> AsyncIterator[dict]:
    """Streaming RAG with conversation persistence and multi-turn history.

    Yields SSE-ready event dicts in this order:

    1. ``{"type": "conversation", "id": "..."}`` — only when a new conversation
       was lazily created for this request.
    2. ``{"type": "content", "content": "...", "done": bool}`` — one per LLM chunk.

    The user message is persisted **before** the LLM call; the assistant
    message is persisted **after** the stream finishes, with the accumulated
    content.
    """
    try:
        conv_id, is_new = await ensure_conversation(
            db_client, user_id, conversation_id, message
        )
    except ConversationNotFoundError:
        yield {
            "type": "error",
            "code": "conversation_not_found",
            "message": "会话不存在或无权访问",
        }
        return

    if is_new:
        yield {"type": "conversation", "id": conv_id}

    await persist_user_message(db_client, conv_id, message)

    accumulated = ""
    try:
        context_items, _ = await retrieve_context(
            embedding_provider, db_client, user_id, message
        )
        context_text = format_context(context_items)

        history = await load_history(db_client, conv_id)
        llm_messages = _build_llm_messages(history, context_text, message)

        stream = await chat_provider.chat(llm_messages, stream=True)

        async for chunk in stream:
            piece = chunk.get("content", "")
            if piece:
                accumulated += piece
            yield {"type": "content", **chunk}
    except Exception as exc:  # noqa: BLE001
        # Provider / DB / embedding failure mid-stream. We've already
        # persisted the user message; pair it with whatever we got
        # (or a sentinel) so load_history() doesn't see an orphan
        # user turn on the next round. Best-effort — if even the
        # sentinel write fails, give up rather than crash the route.
        yield {
            "type": "error",
            "code": "stream_failed",
            "message": str(exc) or "生成失败",
        }
        try:
            await persist_assistant_message(
                db_client, conv_id, accumulated or "（本轮生成失败）"
            )
        except Exception:  # noqa: BLE001
            pass
        return

    await persist_assistant_message(db_client, conv_id, accumulated)
