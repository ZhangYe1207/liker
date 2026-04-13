"""RAG pipeline: retrieve relevant items, assemble context, generate response."""

from __future__ import annotations

from typing import AsyncIterator

from supabase import Client

from app.db.embeddings import similarity_search
from app.db.items import get_user_items
from app.llm.protocols import ChatProvider, EmbeddingProvider

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

    # Fetch full item details for matched items
    items = await get_user_items(db_client, user_id)
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


async def chat_with_rag(
    chat_provider: ChatProvider,
    embedding_provider: EmbeddingProvider,
    db_client: Client,
    user_id: str,
    message: str,
    stream: bool = False,
) -> dict | AsyncIterator[dict]:
    """Full RAG pipeline: retrieve -> assemble -> generate."""
    context_items, _ = await retrieve_context(
        embedding_provider, db_client, user_id, message
    )
    context_text = format_context(context_items)

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": f"【收藏数据参考】\n{context_text}\n\n【用户问题】\n{message}",
        },
    ]

    return await chat_provider.chat(messages, stream=stream)
