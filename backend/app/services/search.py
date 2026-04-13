"""Search service with LLM function calling for intelligent search."""

from __future__ import annotations

import json
from typing import AsyncIterator

from app.db.embeddings import similarity_search
from app.db.items import get_user_items
from app.llm.protocols import ChatProvider, EmbeddingProvider
from app.services.external_apis import search_books, search_movies, search_music

SEARCH_SYSTEM_PROMPT = """你是 Liker 的 AI 搜索助手。用户会用自然语言搜索内容。
你可以使用以下工具来帮助用户：
- search_collection: 在用户的收藏中搜索
- search_external: 在外部数据库搜索（电影、书籍、音乐）
- get_taste_profile: 获取用户的品味偏好概要

规则：
- 始终使用中文回复
- 根据用户意图选择合适的工具
- 推荐时引用用户的偏好数据来解释原因
- 搜索结果要包含足够的信息让用户一键收藏"""

TOOL_DEFINITIONS = [
    {
        "name": "search_collection",
        "description": "在用户的收藏中搜索相关内容",
        "parameters": {
            "type": "object",
            "properties": {
                "keywords": {"type": "string", "description": "搜索关键词"},
                "category": {"type": "string", "description": "分类筛选（可选）"},
                "min_rating": {
                    "type": "integer",
                    "description": "最低评分筛选（可选）",
                },
            },
            "required": ["keywords"],
        },
    },
    {
        "name": "search_external",
        "description": "在外部数据库搜索内容（电影、书籍、音乐）",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "搜索内容"},
                "media_type": {
                    "type": "string",
                    "enum": ["movie", "book", "music"],
                    "description": "媒体类型",
                },
            },
            "required": ["query", "media_type"],
        },
    },
    {
        "name": "get_taste_profile",
        "description": "获取用户的品味偏好概要",
        "parameters": {
            "type": "object",
            "properties": {
                "category": {"type": "string", "description": "特定分类（可选）"},
            },
        },
    },
]


async def execute_search_collection(
    embedding_provider: EmbeddingProvider,
    db_client: object,
    user_id: str,
    arguments: dict,
) -> list[dict]:
    """Search user's collection via vector similarity."""
    keywords = arguments.get("keywords", "")
    vectors = await embedding_provider.embed([keywords], query=True)
    matches = await similarity_search(db_client, user_id, vectors[0], limit=10)

    items = await get_user_items(db_client, user_id)
    items_by_id = {item["id"]: item for item in items}

    results = []
    for match in matches:
        item = items_by_id.get(match["item_id"])
        if item:
            # Apply optional filters
            category = arguments.get("category")
            min_rating = arguments.get("min_rating")
            cat = item.get("categories", {})
            cat_name = cat.get("name", "") if isinstance(cat, dict) else ""
            if category and category.lower() not in cat_name.lower():
                continue
            if min_rating and (item.get("rating", 0) < min_rating):
                continue
            results.append(
                {
                    "title": item["title"],
                    "rating": item.get("rating"),
                    "category": cat_name,
                    "review": item.get("review", ""),
                    "similarity": match["similarity"],
                }
            )
    return results


async def execute_search_external(
    arguments: dict, tmdb_api_key: str = ""
) -> list[dict]:
    """Search external APIs based on media type."""
    media_type = arguments.get("media_type", "movie")
    query = arguments.get("query", "")

    if media_type == "movie":
        return await search_movies(query, tmdb_api_key)
    elif media_type == "book":
        return await search_books(query)
    elif media_type == "music":
        return await search_music(query)
    return []


async def execute_get_taste_profile(
    db_client: object, user_id: str, arguments: dict
) -> dict:
    """Build a taste profile from user's collection."""
    items = await get_user_items(db_client, user_id)
    category = arguments.get("category")

    if category:
        items = [
            i
            for i in items
            if category.lower()
            in (
                i.get("categories", {}).get("name", "")
                if isinstance(i.get("categories"), dict)
                else ""
            ).lower()
        ]

    if not items:
        return {"message": "该分类下没有收藏"}

    total = len(items)
    avg_rating = sum(i.get("rating", 0) for i in items) / total
    top_items = sorted(items, key=lambda x: x.get("rating", 0), reverse=True)[:5]

    return {
        "total_items": total,
        "average_rating": round(avg_rating, 1),
        "top_rated": [
            {"title": i["title"], "rating": i.get("rating")} for i in top_items
        ],
    }


async def search_with_tools(
    chat_provider: ChatProvider,
    embedding_provider: EmbeddingProvider,
    db_client: object,
    user_id: str,
    query: str,
    stream: bool = False,
    tmdb_api_key: str = "",
) -> tuple[dict | AsyncIterator[dict], list[dict]]:
    """Single-turn function calling search flow.

    Returns a tuple of (final_result, recommendations).
    *final_result* is either a dict or an async iterator depending on *stream*.
    """
    messages: list[dict] = [
        {"role": "system", "content": SEARCH_SYSTEM_PROMPT},
        {"role": "user", "content": query},
    ]

    # Step 1: LLM decides which tools to call
    result = await chat_provider.chat(messages, tools=TOOL_DEFINITIONS, stream=False)

    tool_results: list[dict] = []
    recommendations: list[dict] = []

    if result.get("tool_calls"):
        for tool_call in result["tool_calls"]:
            name = tool_call["name"]
            args = tool_call["arguments"]

            if name == "search_collection":
                tool_result = await execute_search_collection(
                    embedding_provider, db_client, user_id, args
                )
                tool_results.append({"tool": name, "result": tool_result})
            elif name == "search_external":
                tool_result = await execute_search_external(args, tmdb_api_key)
                recommendations.extend(tool_result)
                tool_results.append({"tool": name, "result": tool_result})
            elif name == "get_taste_profile":
                tool_result = await execute_get_taste_profile(
                    db_client, user_id, args
                )
                tool_results.append({"tool": name, "result": tool_result})

    # Step 2: Send tool results back to LLM for synthesis
    messages.append(
        {
            "role": "assistant",
            "content": result.get("content", ""),
            "tool_calls": result.get("tool_calls"),
        }
    )
    messages.append(
        {
            "role": "user",
            "content": f"工具返回结果：\n{json.dumps(tool_results, ensure_ascii=False, default=str)}",
        }
    )

    # Step 3: LLM generates final response
    final_result = await chat_provider.chat(messages, stream=stream)

    return final_result, recommendations
