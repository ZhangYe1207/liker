"""Tests for db.conversations CRUD helpers."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.db.conversations import (
    create_conversation,
    delete_conversation,
    get_conversation,
    insert_message,
    list_conversations,
    list_messages,
    update_conversation_title,
)

TEST_USER_ID = "user-abc-123"
OTHER_CONV_ID = "conv-999"
CONV_ID = "conv-001"


def _client_with_result(rows: list[dict]) -> MagicMock:
    """Build a MagicMock that returns ``rows`` from the execute() chain.

    Because supabase-py uses chained builders (``.table().select()...``),
    we rely on MagicMock's auto-creation of attributes: every chained call
    returns the same mock, and ``.execute()`` returns an object with a
    ``.data`` attribute. We expose the terminal mock as ``client.terminal``
    so tests can assert on the final call args.
    """
    client = MagicMock()
    execute_result = MagicMock()
    execute_result.data = rows
    # All chained calls (.table, .select, .eq, .order, .insert, .update, .delete)
    # return the same mock by default thanks to MagicMock's behavior.
    client.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
        execute_result
    )
    client.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = (
        execute_result
    )
    client.table.return_value.insert.return_value.execute.return_value = (
        execute_result
    )
    client.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = (
        execute_result
    )
    client.table.return_value.delete.return_value.eq.return_value.eq.return_value.execute.return_value = (
        execute_result
    )
    return client


# ---------------------------------------------------------------------------
# list_conversations
# ---------------------------------------------------------------------------


class TestListConversations:
    @pytest.mark.asyncio
    async def test_filters_by_user_id(self):
        rows = [{"id": CONV_ID, "title": "Hi", "updated_at": "2026-04-14T00:00:00Z", "created_at": "2026-04-14T00:00:00Z"}]
        client = _client_with_result(rows)

        result = await list_conversations(client, TEST_USER_ID)

        client.table.assert_called_with("conversations")
        # Verify .eq('user_id', user_id) was on the chain
        client.table.return_value.select.return_value.eq.assert_called_with(
            "user_id", TEST_USER_ID
        )
        # Verify ordering is updated_at DESC
        order_mock = client.table.return_value.select.return_value.eq.return_value.order
        order_mock.assert_called_with("updated_at", desc=True)
        assert result == rows

    @pytest.mark.asyncio
    async def test_empty_result(self):
        client = _client_with_result([])
        result = await list_conversations(client, TEST_USER_ID)
        assert result == []


# ---------------------------------------------------------------------------
# get_conversation
# ---------------------------------------------------------------------------


class TestGetConversation:
    @pytest.mark.asyncio
    async def test_returns_row_when_found(self):
        row = {"id": CONV_ID, "title": "Hi", "updated_at": "2026-04-14T00:00:00Z", "created_at": "2026-04-14T00:00:00Z"}
        client = _client_with_result([row])

        result = await get_conversation(client, TEST_USER_ID, CONV_ID)
        assert result == row

    @pytest.mark.asyncio
    async def test_filters_by_user_id(self):
        client = _client_with_result([])

        await get_conversation(client, TEST_USER_ID, CONV_ID)

        # Inner .eq should be chained twice: once for id, once for user_id
        first_eq = client.table.return_value.select.return_value.eq
        first_eq.assert_called_with("id", CONV_ID)
        second_eq = first_eq.return_value.eq
        second_eq.assert_called_with("user_id", TEST_USER_ID)

    @pytest.mark.asyncio
    async def test_returns_none_when_missing(self):
        client = _client_with_result([])
        result = await get_conversation(client, TEST_USER_ID, CONV_ID)
        assert result is None


# ---------------------------------------------------------------------------
# create_conversation
# ---------------------------------------------------------------------------


class TestCreateConversation:
    @pytest.mark.asyncio
    async def test_inserts_with_user_id_and_title(self):
        row = {
            "id": CONV_ID,
            "title": "A new one",
            "user_id": TEST_USER_ID,
            "updated_at": "2026-04-14T00:00:00Z",
            "created_at": "2026-04-14T00:00:00Z",
        }
        client = _client_with_result([row])

        result = await create_conversation(client, TEST_USER_ID, "A new one")

        client.table.assert_called_with("conversations")
        client.table.return_value.insert.assert_called_with(
            {"user_id": TEST_USER_ID, "title": "A new one"}
        )
        assert result == row


# ---------------------------------------------------------------------------
# update_conversation_title
# ---------------------------------------------------------------------------


class TestUpdateConversationTitle:
    @pytest.mark.asyncio
    async def test_updates_and_filters_by_user(self):
        row = {"id": CONV_ID, "title": "New Title", "updated_at": "2026-04-14T00:00:00Z", "created_at": "2026-04-14T00:00:00Z"}
        client = _client_with_result([row])

        result = await update_conversation_title(
            client, TEST_USER_ID, CONV_ID, "New Title"
        )

        client.table.return_value.update.assert_called_with({"title": "New Title"})
        first_eq = client.table.return_value.update.return_value.eq
        first_eq.assert_called_with("id", CONV_ID)
        second_eq = first_eq.return_value.eq
        second_eq.assert_called_with("user_id", TEST_USER_ID)
        assert result == row

    @pytest.mark.asyncio
    async def test_returns_none_when_not_owned(self):
        client = _client_with_result([])  # update returns [] when filter matches nothing
        result = await update_conversation_title(
            client, TEST_USER_ID, OTHER_CONV_ID, "Hack"
        )
        assert result is None


# ---------------------------------------------------------------------------
# delete_conversation
# ---------------------------------------------------------------------------


class TestDeleteConversation:
    @pytest.mark.asyncio
    async def test_deletes_filtering_by_user(self):
        client = _client_with_result([{"id": CONV_ID}])

        result = await delete_conversation(client, TEST_USER_ID, CONV_ID)

        client.table.assert_called_with("conversations")
        first_eq = client.table.return_value.delete.return_value.eq
        first_eq.assert_called_with("id", CONV_ID)
        second_eq = first_eq.return_value.eq
        second_eq.assert_called_with("user_id", TEST_USER_ID)
        assert result is True

    @pytest.mark.asyncio
    async def test_returns_false_when_nothing_deleted(self):
        client = _client_with_result([])
        result = await delete_conversation(client, TEST_USER_ID, "missing")
        assert result is False


# ---------------------------------------------------------------------------
# list_messages
# ---------------------------------------------------------------------------


class TestListMessages:
    @pytest.mark.asyncio
    async def test_filters_by_conversation_id_and_orders(self):
        rows = [
            {"id": "m1", "role": "user", "content": "Hi", "recommendations": None, "created_at": "2026-04-14T00:00:00Z"},
            {"id": "m2", "role": "assistant", "content": "Hello", "recommendations": None, "created_at": "2026-04-14T00:00:01Z"},
        ]
        client = _client_with_result(rows)

        result = await list_messages(client, CONV_ID)

        client.table.assert_called_with("messages")
        client.table.return_value.select.return_value.eq.assert_called_with(
            "conversation_id", CONV_ID
        )
        order_mock = client.table.return_value.select.return_value.eq.return_value.order
        order_mock.assert_called_with("created_at", desc=False)
        assert result == rows


# ---------------------------------------------------------------------------
# insert_message
# ---------------------------------------------------------------------------


class TestInsertMessage:
    @pytest.mark.asyncio
    async def test_inserts_plain_message(self):
        row = {
            "id": "m-1",
            "role": "user",
            "content": "Hi there",
            "recommendations": None,
            "created_at": "2026-04-14T00:00:00Z",
        }
        client = _client_with_result([row])

        result = await insert_message(client, CONV_ID, "user", "Hi there")

        client.table.assert_called_with("messages")
        client.table.return_value.insert.assert_called_with(
            {"conversation_id": CONV_ID, "role": "user", "content": "Hi there"}
        )
        assert result == row

    @pytest.mark.asyncio
    async def test_inserts_message_with_recommendations(self):
        recs = [{"title": "Inception", "year": "2010"}]
        row = {
            "id": "m-2",
            "role": "assistant",
            "content": "Try this:",
            "recommendations": recs,
            "created_at": "2026-04-14T00:00:00Z",
        }
        client = _client_with_result([row])

        result = await insert_message(
            client, CONV_ID, "assistant", "Try this:", recommendations=recs
        )

        client.table.return_value.insert.assert_called_with(
            {
                "conversation_id": CONV_ID,
                "role": "assistant",
                "content": "Try this:",
                "recommendations": recs,
            }
        )
        assert result == row

    @pytest.mark.asyncio
    async def test_omits_recommendations_key_when_none(self):
        """Passing recommendations=None should not send a ``recommendations`` key,
        so the DB default (NULL) applies cleanly."""
        row = {
            "id": "m-3",
            "role": "assistant",
            "content": "plain",
            "recommendations": None,
            "created_at": "2026-04-14T00:00:00Z",
        }
        client = _client_with_result([row])

        await insert_message(client, CONV_ID, "assistant", "plain", recommendations=None)

        payload = client.table.return_value.insert.call_args[0][0]
        assert "recommendations" not in payload
