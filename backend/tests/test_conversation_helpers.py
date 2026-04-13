"""Tests for services.conversation_helpers + chat/search persistent variants."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.conversation_helpers import (
    _title_from_message,
    ensure_conversation,
    load_history,
)
from app.services.rag import chat_with_rag_persistent
from app.services.search import search_with_tools_persistent

TEST_USER_ID = "user-abc-123"
EXISTING_CONV = "conv-existing"
NEW_CONV = "conv-new"

FAKE_EMBEDDING = [0.1] * 1536


# ---------------------------------------------------------------------------
# _title_from_message
# ---------------------------------------------------------------------------


class TestTitleFromMessage:
    def test_short_message_returns_whole(self):
        assert _title_from_message("推荐电影") == "推荐电影"

    def test_long_message_truncated_to_20(self):
        long = "推荐" * 30
        result = _title_from_message(long)
        assert len(result) == 20

    def test_whitespace_stripped(self):
        assert _title_from_message("   推荐   ") == "推荐"

    def test_empty_returns_fallback(self):
        assert _title_from_message("") == "新对话"
        assert _title_from_message("   ") == "新对话"


# ---------------------------------------------------------------------------
# ensure_conversation
# ---------------------------------------------------------------------------


class TestEnsureConversation:
    @pytest.mark.asyncio
    async def test_existing_id_returns_as_is(self):
        client = MagicMock()
        conv_id, is_new = await ensure_conversation(
            client, TEST_USER_ID, EXISTING_CONV, "hi"
        )
        assert conv_id == EXISTING_CONV
        assert is_new is False

    @pytest.mark.asyncio
    async def test_none_creates_new(self):
        client = MagicMock()
        with patch(
            "app.services.conversation_helpers.create_conversation",
            new_callable=AsyncMock,
            return_value={"id": NEW_CONV, "title": "推荐电影"},
        ) as mock_create:
            conv_id, is_new = await ensure_conversation(
                client, TEST_USER_ID, None, "推荐电影"
            )

        assert conv_id == NEW_CONV
        assert is_new is True
        mock_create.assert_called_once_with(client, TEST_USER_ID, "推荐电影")

    @pytest.mark.asyncio
    async def test_title_truncated_on_create(self):
        client = MagicMock()
        long_message = "帮我分析一下我最近几个月看过的所有电影和读过的书"
        with patch(
            "app.services.conversation_helpers.create_conversation",
            new_callable=AsyncMock,
            return_value={"id": NEW_CONV, "title": long_message[:20]},
        ) as mock_create:
            await ensure_conversation(client, TEST_USER_ID, None, long_message)

        sent_title = mock_create.call_args[0][2]
        assert len(sent_title) == 20
        assert sent_title == long_message[:20]


# ---------------------------------------------------------------------------
# load_history
# ---------------------------------------------------------------------------


class TestLoadHistory:
    @pytest.mark.asyncio
    async def test_strips_to_role_and_content(self):
        client = MagicMock()
        raw = [
            {
                "id": "m1",
                "role": "user",
                "content": "Hi",
                "recommendations": None,
                "created_at": "t",
            },
            {
                "id": "m2",
                "role": "assistant",
                "content": "Hello",
                "recommendations": [{"title": "X"}],
                "created_at": "t+1",
            },
        ]
        with patch(
            "app.services.conversation_helpers.list_messages",
            new_callable=AsyncMock,
            return_value=raw,
        ):
            history = await load_history(client, EXISTING_CONV)

        assert history == [
            {"role": "user", "content": "Hi"},
            {"role": "assistant", "content": "Hello"},
        ]


# ---------------------------------------------------------------------------
# chat_with_rag_persistent
# ---------------------------------------------------------------------------


def _streaming_chat_provider(chunks: list[dict] | None = None) -> MagicMock:
    if chunks is None:
        chunks = [
            {"content": "你", "done": False},
            {"content": "好", "done": False},
            {"content": "", "done": True},
        ]

    async def _stream():
        for c in chunks:
            yield c

    provider = MagicMock()
    provider.chat = AsyncMock(return_value=_stream())
    return provider


def _embedding_provider() -> MagicMock:
    provider = MagicMock()
    provider.embed = AsyncMock(return_value=[FAKE_EMBEDDING])
    provider.dimensions = 1536
    return provider


class TestChatWithRagPersistent:
    @pytest.mark.asyncio
    async def test_emits_conversation_event_when_creating_new(self):
        client = MagicMock()
        chat_provider = _streaming_chat_provider()
        embedding_provider = _embedding_provider()

        with (
            patch(
                "app.services.rag.ensure_conversation",
                new_callable=AsyncMock,
                return_value=(NEW_CONV, True),
            ),
            patch(
                "app.services.rag.persist_user_message",
                new_callable=AsyncMock,
            ),
            patch(
                "app.services.rag.retrieve_context",
                new_callable=AsyncMock,
                return_value=([], FAKE_EMBEDDING),
            ),
            patch(
                "app.services.rag.load_history",
                new_callable=AsyncMock,
                return_value=[{"role": "user", "content": "推荐电影"}],
            ),
            patch(
                "app.services.rag.persist_assistant_message",
                new_callable=AsyncMock,
            ),
        ):
            events = []
            async for event in chat_with_rag_persistent(
                chat_provider, embedding_provider, client, TEST_USER_ID,
                "推荐电影", conversation_id=None,
            ):
                events.append(event)

        assert events[0] == {"type": "conversation", "id": NEW_CONV}
        content_events = [e for e in events if e["type"] == "content"]
        assert len(content_events) == 3
        assert content_events[-1]["done"] is True

    @pytest.mark.asyncio
    async def test_no_conversation_event_for_existing(self):
        client = MagicMock()
        chat_provider = _streaming_chat_provider()
        embedding_provider = _embedding_provider()

        with (
            patch(
                "app.services.rag.ensure_conversation",
                new_callable=AsyncMock,
                return_value=(EXISTING_CONV, False),
            ),
            patch(
                "app.services.rag.persist_user_message",
                new_callable=AsyncMock,
            ),
            patch(
                "app.services.rag.retrieve_context",
                new_callable=AsyncMock,
                return_value=([], FAKE_EMBEDDING),
            ),
            patch(
                "app.services.rag.load_history",
                new_callable=AsyncMock,
                return_value=[{"role": "user", "content": "继续"}],
            ),
            patch(
                "app.services.rag.persist_assistant_message",
                new_callable=AsyncMock,
            ),
        ):
            events = [
                e async for e in chat_with_rag_persistent(
                    chat_provider, embedding_provider, client, TEST_USER_ID,
                    "继续", conversation_id=EXISTING_CONV,
                )
            ]

        types = [e["type"] for e in events]
        assert "conversation" not in types

    @pytest.mark.asyncio
    async def test_persists_accumulated_assistant_content(self):
        client = MagicMock()
        chat_provider = _streaming_chat_provider(
            [
                {"content": "Hello ", "done": False},
                {"content": "world", "done": False},
                {"content": "", "done": True},
            ]
        )
        embedding_provider = _embedding_provider()

        with (
            patch(
                "app.services.rag.ensure_conversation",
                new_callable=AsyncMock,
                return_value=(EXISTING_CONV, False),
            ),
            patch(
                "app.services.rag.persist_user_message",
                new_callable=AsyncMock,
            ),
            patch(
                "app.services.rag.retrieve_context",
                new_callable=AsyncMock,
                return_value=([], FAKE_EMBEDDING),
            ),
            patch(
                "app.services.rag.load_history",
                new_callable=AsyncMock,
                return_value=[{"role": "user", "content": "say hello"}],
            ),
            patch(
                "app.services.rag.persist_assistant_message",
                new_callable=AsyncMock,
            ) as mock_persist,
        ):
            _ = [
                e async for e in chat_with_rag_persistent(
                    chat_provider, embedding_provider, client, TEST_USER_ID,
                    "say hello", conversation_id=EXISTING_CONV,
                )
            ]

        mock_persist.assert_called_once_with(
            client, EXISTING_CONV, "Hello world"
        )

    @pytest.mark.asyncio
    async def test_history_is_threaded_into_llm_messages(self):
        """Prior assistant turns should survive in the LLM messages; only the
        last (current) user message gets RAG-augmented."""
        client = MagicMock()
        chat_provider = _streaming_chat_provider()
        embedding_provider = _embedding_provider()

        prior_history = [
            {"role": "user", "content": "上一次的问题"},
            {"role": "assistant", "content": "上一次的回答"},
            {"role": "user", "content": "新问题"},  # current, gets augmented
        ]

        with (
            patch(
                "app.services.rag.ensure_conversation",
                new_callable=AsyncMock,
                return_value=(EXISTING_CONV, False),
            ),
            patch(
                "app.services.rag.persist_user_message",
                new_callable=AsyncMock,
            ),
            patch(
                "app.services.rag.retrieve_context",
                new_callable=AsyncMock,
                return_value=([], FAKE_EMBEDDING),
            ),
            patch(
                "app.services.rag.load_history",
                new_callable=AsyncMock,
                return_value=prior_history,
            ),
            patch(
                "app.services.rag.persist_assistant_message",
                new_callable=AsyncMock,
            ),
        ):
            _ = [
                e async for e in chat_with_rag_persistent(
                    chat_provider, embedding_provider, client, TEST_USER_ID,
                    "新问题", conversation_id=EXISTING_CONV,
                )
            ]

        sent_messages = chat_provider.chat.call_args[0][0]
        # system + 2 prior + 1 augmented current
        assert len(sent_messages) == 4
        assert sent_messages[0]["role"] == "system"
        assert sent_messages[1] == {"role": "user", "content": "上一次的问题"}
        assert sent_messages[2] == {"role": "assistant", "content": "上一次的回答"}
        assert "新问题" in sent_messages[3]["content"]
        assert "收藏数据参考" in sent_messages[3]["content"]


# ---------------------------------------------------------------------------
# search_with_tools_persistent
# ---------------------------------------------------------------------------


class TestSearchWithToolsPersistent:
    @pytest.mark.asyncio
    async def test_emits_recommendations_event_and_persists_them(self):
        client = MagicMock()
        recommendations = [{"title": "Inception", "year": "2010"}]

        async def _final_stream():
            yield {"content": "Here ", "done": False}
            yield {"content": "you go", "done": False}
            yield {"content": "", "done": True}

        chat_provider = MagicMock()
        chat_provider.chat = AsyncMock(
            side_effect=[
                {
                    "content": "",
                    "tool_calls": [
                        {
                            "name": "search_external",
                            "arguments": {"query": "inception", "media_type": "movie"},
                        }
                    ],
                },
                _final_stream(),
            ]
        )
        embedding_provider = _embedding_provider()

        with (
            patch(
                "app.services.search.ensure_conversation",
                new_callable=AsyncMock,
                return_value=(NEW_CONV, True),
            ),
            patch(
                "app.services.search.persist_user_message",
                new_callable=AsyncMock,
            ),
            patch(
                "app.services.search.load_history",
                new_callable=AsyncMock,
                return_value=[{"role": "user", "content": "find inception"}],
            ),
            patch(
                "app.services.search.execute_search_external",
                new_callable=AsyncMock,
                return_value=recommendations,
            ),
            patch(
                "app.services.search.persist_assistant_message",
                new_callable=AsyncMock,
            ) as mock_persist,
        ):
            events = [
                e async for e in search_with_tools_persistent(
                    chat_provider, embedding_provider, client, TEST_USER_ID,
                    "find inception", conversation_id=None,
                )
            ]

        types = [e["type"] for e in events]
        # conversation must come before recommendations, which comes before content
        assert types[0] == "conversation"
        assert types[1] == "recommendations"
        assert all(t == "content" for t in types[2:])

        # Assistant message persisted with recommendations attached
        mock_persist.assert_called_once()
        call_args = mock_persist.call_args
        assert call_args[0][1] == NEW_CONV
        assert call_args[0][2] == "Here you go"
        assert call_args[1]["recommendations"] == recommendations

    @pytest.mark.asyncio
    async def test_no_recommendations_event_when_empty(self):
        client = MagicMock()

        async def _final_stream():
            yield {"content": "nothing", "done": False}
            yield {"content": "", "done": True}

        chat_provider = MagicMock()
        chat_provider.chat = AsyncMock(
            side_effect=[
                {"content": "", "tool_calls": None},
                _final_stream(),
            ]
        )
        embedding_provider = _embedding_provider()

        with (
            patch(
                "app.services.search.ensure_conversation",
                new_callable=AsyncMock,
                return_value=(EXISTING_CONV, False),
            ),
            patch(
                "app.services.search.persist_user_message",
                new_callable=AsyncMock,
            ),
            patch(
                "app.services.search.load_history",
                new_callable=AsyncMock,
                return_value=[{"role": "user", "content": "hi"}],
            ),
            patch(
                "app.services.search.persist_assistant_message",
                new_callable=AsyncMock,
            ) as mock_persist,
        ):
            events = [
                e async for e in search_with_tools_persistent(
                    chat_provider, embedding_provider, client, TEST_USER_ID,
                    "hi", conversation_id=EXISTING_CONV,
                )
            ]

        types = [e["type"] for e in events]
        assert "recommendations" not in types
        assert "conversation" not in types

        # Persisted without recommendations
        assert mock_persist.call_args[1]["recommendations"] is None
