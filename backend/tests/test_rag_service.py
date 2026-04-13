"""Tests for the RAG service and chat API endpoints."""

from __future__ import annotations

import json
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from jose import jwt

from app.services.rag import (
    SYSTEM_PROMPT,
    chat_with_rag,
    format_context,
    retrieve_context,
)

# ---------------------------------------------------------------------------
# Test constants
# ---------------------------------------------------------------------------

TEST_SECRET = "test-secret"
TEST_USER_ID = "user-abc-123"

SAMPLE_ITEM_FULL = {
    "id": "item-001",
    "title": "The Great Gatsby",
    "categories": {"name": "Books", "icon": "book"},
    "description": "A novel by F. Scott Fitzgerald about the American dream",
    "review": "A masterpiece of American literature",
    "rating": 5,
}

SAMPLE_ITEM_MINIMAL = {
    "id": "item-002",
    "title": "Untitled Song",
}

SAMPLE_ITEM_NO_REVIEW = {
    "id": "item-003",
    "title": "Inception",
    "categories": {"name": "Movies", "icon": "film"},
    "description": "A mind-bending thriller by Christopher Nolan",
    "rating": 4,
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_token(sub: str = TEST_USER_ID) -> str:
    payload = {
        "sub": sub,
        "aud": "authenticated",
        "exp": time.time() + 3600,
    }
    return jwt.encode(payload, TEST_SECRET, algorithm="HS256")


class _FakeSettings:
    SUPABASE_JWT_SECRET = TEST_SECRET
    LLM_PROVIDER = "claude"
    EMBEDDING_PROVIDER = "openai"
    CLAUDE_API_KEY = "test-key"
    OPENAI_API_KEY = "test-key"
    SUPABASE_URL = "https://fake.supabase.co"
    SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key"
    CORS_ORIGINS = "http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


def _fake_get_settings():
    return _FakeSettings()


FAKE_EMBEDDING = [0.1] * 1536


def _mock_embedding_provider() -> MagicMock:
    provider = MagicMock()
    provider.embed = AsyncMock(return_value=[FAKE_EMBEDDING])
    provider.dimensions = 1536
    return provider


def _mock_chat_provider(response: dict | None = None) -> MagicMock:
    provider = MagicMock()
    if response is None:
        response = {"content": "这是AI的回复", "tool_calls": None}
    provider.chat = AsyncMock(return_value=response)
    provider.model_name = "test-model"
    return provider


def _mock_streaming_chat_provider(chunks: list[dict] | None = None) -> MagicMock:
    if chunks is None:
        chunks = [
            {"content": "你好", "done": False},
            {"content": "世界", "done": False},
            {"content": "", "done": True},
        ]

    async def _stream_iter():
        for chunk in chunks:
            yield chunk

    provider = MagicMock()
    provider.chat = AsyncMock(return_value=_stream_iter())
    provider.model_name = "test-model"
    return provider


def _mock_db_client() -> MagicMock:
    return MagicMock()


# ---------------------------------------------------------------------------
# format_context
# ---------------------------------------------------------------------------


class TestFormatContext:
    def test_empty_list_returns_no_data_message(self):
        result = format_context([])
        assert "没有相关收藏" in result

    def test_full_item_formatted(self):
        result = format_context([{**SAMPLE_ITEM_FULL, "similarity": 0.95}])
        assert "The Great Gatsby" in result
        assert "Books" in result
        assert "评分: 5/5" in result
        assert "A masterpiece" in result
        assert "A novel by F. Scott Fitzgerald" in result

    def test_item_without_review(self):
        result = format_context([{**SAMPLE_ITEM_NO_REVIEW, "similarity": 0.8}])
        assert "Inception" in result
        assert "Movies" in result
        assert "评分: 4/5" in result
        assert "评价" not in result

    def test_minimal_item(self):
        result = format_context([{**SAMPLE_ITEM_MINIMAL, "similarity": 0.7}])
        assert "Untitled Song" in result
        assert "评分" not in result
        assert "评价" not in result
        assert "简介" not in result

    def test_multiple_items_numbered(self):
        items = [
            {**SAMPLE_ITEM_FULL, "similarity": 0.95},
            {**SAMPLE_ITEM_NO_REVIEW, "similarity": 0.8},
        ]
        result = format_context(items)
        assert "1." in result
        assert "2." in result
        assert "The Great Gatsby" in result
        assert "Inception" in result

    def test_category_not_dict(self):
        """Items with non-dict categories should not crash."""
        item = {
            "id": "x",
            "title": "Test",
            "categories": None,
            "similarity": 0.5,
        }
        result = format_context([item])
        assert "Test" in result

    def test_description_truncated(self):
        long_desc = "A" * 200
        item = {
            "id": "x",
            "title": "Long",
            "description": long_desc,
            "similarity": 0.5,
        }
        result = format_context([item])
        # Description should be truncated to first 100 chars
        assert "A" * 100 in result
        assert "A" * 101 not in result


# ---------------------------------------------------------------------------
# retrieve_context
# ---------------------------------------------------------------------------


class TestRetrieveContext:
    @pytest.mark.asyncio
    async def test_calls_embedding_and_similarity_search(self):
        embedding_provider = _mock_embedding_provider()
        db_client = _mock_db_client()

        similarity_matches = [
            {"item_id": "item-001", "similarity": 0.95},
            {"item_id": "item-003", "similarity": 0.80},
        ]

        user_items = [SAMPLE_ITEM_FULL, SAMPLE_ITEM_MINIMAL, SAMPLE_ITEM_NO_REVIEW]

        with (
            patch(
                "app.services.rag.similarity_search",
                new_callable=AsyncMock,
                return_value=similarity_matches,
            ) as mock_sim,
            patch(
                "app.services.rag.get_user_items",
                new_callable=AsyncMock,
                return_value=user_items,
            ) as mock_items,
        ):
            context_items, query_emb = await retrieve_context(
                embedding_provider, db_client, TEST_USER_ID, "推荐小说"
            )

        # Embedding provider called with query
        embedding_provider.embed.assert_called_once_with(["推荐小说"], query=True)

        # Similarity search called with correct args
        mock_sim.assert_called_once_with(
            db_client, TEST_USER_ID, FAKE_EMBEDDING, 10
        )

        # get_user_items called
        mock_items.assert_called_once_with(db_client, TEST_USER_ID)

        # Only matched items returned
        assert len(context_items) == 2
        assert context_items[0]["title"] == "The Great Gatsby"
        assert context_items[0]["similarity"] == 0.95
        assert context_items[1]["title"] == "Inception"

    @pytest.mark.asyncio
    async def test_returns_query_embedding(self):
        embedding_provider = _mock_embedding_provider()
        db_client = _mock_db_client()

        with (
            patch(
                "app.services.rag.similarity_search",
                new_callable=AsyncMock,
                return_value=[],
            ),
        ):
            _, query_emb = await retrieve_context(
                embedding_provider, db_client, TEST_USER_ID, "test"
            )

        assert query_emb == FAKE_EMBEDDING

    @pytest.mark.asyncio
    async def test_empty_similarity_results(self):
        embedding_provider = _mock_embedding_provider()
        db_client = _mock_db_client()

        with patch(
            "app.services.rag.similarity_search",
            new_callable=AsyncMock,
            return_value=[],
        ):
            context_items, query_emb = await retrieve_context(
                embedding_provider, db_client, TEST_USER_ID, "test"
            )

        assert context_items == []
        assert query_emb == FAKE_EMBEDDING

    @pytest.mark.asyncio
    async def test_custom_limit(self):
        embedding_provider = _mock_embedding_provider()
        db_client = _mock_db_client()

        with (
            patch(
                "app.services.rag.similarity_search",
                new_callable=AsyncMock,
                return_value=[],
            ) as mock_sim,
        ):
            await retrieve_context(
                embedding_provider, db_client, TEST_USER_ID, "test", limit=5
            )

        mock_sim.assert_called_once_with(
            db_client, TEST_USER_ID, FAKE_EMBEDDING, 5
        )


# ---------------------------------------------------------------------------
# chat_with_rag
# ---------------------------------------------------------------------------


class TestChatWithRag:
    @pytest.mark.asyncio
    async def test_assembles_messages_correctly(self):
        chat_provider = _mock_chat_provider()
        embedding_provider = _mock_embedding_provider()
        db_client = _mock_db_client()

        context_items = [{**SAMPLE_ITEM_FULL, "similarity": 0.95}]

        with (
            patch(
                "app.services.rag.retrieve_context",
                new_callable=AsyncMock,
                return_value=(context_items, FAKE_EMBEDDING),
            ),
        ):
            result = await chat_with_rag(
                chat_provider,
                embedding_provider,
                db_client,
                TEST_USER_ID,
                "分析我的读书品味",
                stream=False,
            )

        # Verify chat was called with correct message structure
        chat_provider.chat.assert_called_once()
        call_args = chat_provider.chat.call_args
        messages = call_args[0][0]

        assert len(messages) == 2
        assert messages[0]["role"] == "system"
        assert messages[0]["content"] == SYSTEM_PROMPT
        assert messages[1]["role"] == "user"
        assert "收藏数据参考" in messages[1]["content"]
        assert "The Great Gatsby" in messages[1]["content"]
        assert "分析我的读书品味" in messages[1]["content"]

        # stream=False passed
        assert call_args[1]["stream"] is False

        assert result == {"content": "这是AI的回复", "tool_calls": None}

    @pytest.mark.asyncio
    async def test_handles_empty_collection(self):
        chat_provider = _mock_chat_provider()
        embedding_provider = _mock_embedding_provider()
        db_client = _mock_db_client()

        with patch(
            "app.services.rag.retrieve_context",
            new_callable=AsyncMock,
            return_value=([], FAKE_EMBEDDING),
        ):
            result = await chat_with_rag(
                chat_provider,
                embedding_provider,
                db_client,
                TEST_USER_ID,
                "我喜欢什么类型的电影？",
                stream=False,
            )

        # Should still call chat, with empty context message
        chat_provider.chat.assert_called_once()
        messages = chat_provider.chat.call_args[0][0]
        assert "没有相关收藏" in messages[1]["content"]

    @pytest.mark.asyncio
    async def test_stream_mode(self):
        chat_provider = _mock_streaming_chat_provider()
        embedding_provider = _mock_embedding_provider()
        db_client = _mock_db_client()

        with patch(
            "app.services.rag.retrieve_context",
            new_callable=AsyncMock,
            return_value=([], FAKE_EMBEDDING),
        ):
            result = await chat_with_rag(
                chat_provider,
                embedding_provider,
                db_client,
                TEST_USER_ID,
                "test",
                stream=True,
            )

        # stream=True should be passed to chat
        chat_provider.chat.assert_called_once()
        assert chat_provider.chat.call_args[1]["stream"] is True

        # Result should be an async iterator
        chunks = []
        async for chunk in result:
            chunks.append(chunk)
        assert len(chunks) == 3
        assert chunks[0] == {"content": "你好", "done": False}
        assert chunks[-1] == {"content": "", "done": True}


# ---------------------------------------------------------------------------
# API endpoint tests
# ---------------------------------------------------------------------------


@pytest.fixture
def app():
    from app.main import create_app

    return create_app()


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


class TestChatEndpoint:
    @pytest.mark.asyncio
    async def test_non_stream_returns_envelope(self, client):
        token = _make_token()
        expected = {"content": "你的品味很独特", "tool_calls": None}

        with (
            patch("app.auth.get_settings", _fake_get_settings),
            patch("app.routers.chat.get_settings", _fake_get_settings),
            patch(
                "app.routers.chat.create_chat_provider",
                return_value=_mock_chat_provider(expected),
            ),
            patch(
                "app.routers.chat.create_embedding_provider",
                return_value=_mock_embedding_provider(),
            ),
            patch(
                "app.routers.chat.get_supabase_client",
                return_value=_mock_db_client(),
            ),
            patch(
                "app.routers.chat.chat_with_rag",
                new_callable=AsyncMock,
                return_value=expected,
            ),
        ):
            resp = await client.post(
                "/api/ai/chat",
                json={"message": "分析我的品味", "stream": False},
                headers={"Authorization": f"Bearer {token}"},
            )

        assert resp.status_code == 200
        body = resp.json()
        assert body["data"] == expected
        assert body["error"] is None

    @pytest.mark.asyncio
    async def test_stream_returns_event_stream(self, client):
        token = _make_token()
        chunks = [
            {"content": "你好", "done": False},
            {"content": "", "done": True},
        ]

        async def _fake_stream_iter():
            for chunk in chunks:
                yield chunk

        with (
            patch("app.auth.get_settings", _fake_get_settings),
            patch("app.routers.chat.get_settings", _fake_get_settings),
            patch(
                "app.routers.chat.create_chat_provider",
                return_value=MagicMock(),
            ),
            patch(
                "app.routers.chat.create_embedding_provider",
                return_value=MagicMock(),
            ),
            patch(
                "app.routers.chat.get_supabase_client",
                return_value=MagicMock(),
            ),
            patch(
                "app.routers.chat.chat_with_rag",
                new_callable=AsyncMock,
                return_value=_fake_stream_iter(),
            ),
        ):
            resp = await client.post(
                "/api/ai/chat",
                json={"message": "你好", "stream": True},
                headers={"Authorization": f"Bearer {token}"},
            )

        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers["content-type"]

        # Parse SSE events from body
        body = resp.text
        lines = [l for l in body.strip().split("\n") if l.startswith("data: ")]
        assert len(lines) == 2

        first = json.loads(lines[0].removeprefix("data: "))
        assert first["content"] == "你好"
        assert first["done"] is False

        last = json.loads(lines[1].removeprefix("data: "))
        assert last["done"] is True

    @pytest.mark.asyncio
    async def test_requires_auth(self, client):
        resp = await client.post(
            "/api/ai/chat",
            json={"message": "hello", "stream": False},
        )
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_missing_message_returns_422(self, client):
        token = _make_token()
        with patch("app.auth.get_settings", _fake_get_settings):
            resp = await client.post(
                "/api/ai/chat",
                json={},
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 422
