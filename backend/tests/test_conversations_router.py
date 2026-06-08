"""Tests for the /api/conversations router."""

from __future__ import annotations

import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from jose import jwt

TEST_SECRET = "test-secret"
TEST_USER_ID = "user-abc-123"
# Path params are UUID-typed, so test ids must be valid UUIDs (a malformed id
# is rejected with 422 before the handler runs — see TestUuidValidation).
CONV_ID = "11111111-1111-1111-1111-111111111111"
OTHER_CONV_ID = "22222222-2222-2222-2222-222222222222"


def _make_token(sub: str = TEST_USER_ID) -> str:
    payload = {
        "sub": sub,
        "aud": "authenticated",
        "exp": time.time() + 3600,
    }
    return jwt.encode(payload, TEST_SECRET, algorithm="HS256")


class _FakeSettings:
    SUPABASE_JWT_SECRET = TEST_SECRET
    EMBEDDING_PROVIDER = "openai"
    OPENAI_API_KEY = "test-key"
    SUPABASE_URL = "https://fake.supabase.co"
    SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key"
    CORS_ORIGINS = "http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


def _fake_get_settings():
    return _FakeSettings()


@pytest.fixture
def app():
    from app.main import create_app

    return create_app()


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ---------------------------------------------------------------------------
# GET /api/conversations
# ---------------------------------------------------------------------------


class TestListConversationsEndpoint:
    @pytest.mark.asyncio
    async def test_requires_auth(self, client):
        resp = await client.get("/api/conversations")
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_returns_user_conversations(self, client):
        token = _make_token()
        fake_rows = [
            {"id": CONV_ID, "title": "Movies", "created_at": "2026-04-14T00:00:00Z", "updated_at": "2026-04-14T00:00:00Z"},
        ]

        with (
            patch("app.auth.get_settings", _fake_get_settings),
            patch(
                "app.routers.conversations.get_supabase_client",
                return_value=MagicMock(),
            ),
            patch(
                "app.routers.conversations.list_conversations",
                new_callable=AsyncMock,
                return_value=fake_rows,
            ) as mock_list,
        ):
            resp = await client.get(
                "/api/conversations",
                headers={"Authorization": f"Bearer {token}"},
            )

        assert resp.status_code == 200
        body = resp.json()
        assert body["data"] == fake_rows
        # Verify the helper was called with the caller's user_id
        args = mock_list.call_args
        assert args[0][1] == TEST_USER_ID


# ---------------------------------------------------------------------------
# GET /api/conversations/{id}/messages
# ---------------------------------------------------------------------------


class TestGetMessagesEndpoint:
    @pytest.mark.asyncio
    async def test_returns_messages_when_owned(self, client):
        token = _make_token()
        fake_messages = [
            {"id": "m1", "role": "user", "content": "Hi", "recommendations": None, "created_at": "2026-04-14T00:00:00Z"},
        ]

        with (
            patch("app.auth.get_settings", _fake_get_settings),
            patch(
                "app.routers.conversations.get_supabase_client",
                return_value=MagicMock(),
            ),
            patch(
                "app.routers.conversations.get_conversation",
                new_callable=AsyncMock,
                return_value={"id": CONV_ID, "title": "Movies"},
            ),
            patch(
                "app.routers.conversations.list_messages",
                new_callable=AsyncMock,
                return_value=fake_messages,
            ),
        ):
            resp = await client.get(
                f"/api/conversations/{CONV_ID}/messages",
                headers={"Authorization": f"Bearer {token}"},
            )

        assert resp.status_code == 200
        assert resp.json()["data"] == fake_messages

    @pytest.mark.asyncio
    async def test_404_when_not_owned(self, client):
        token = _make_token()
        with (
            patch("app.auth.get_settings", _fake_get_settings),
            patch(
                "app.routers.conversations.get_supabase_client",
                return_value=MagicMock(),
            ),
            patch(
                "app.routers.conversations.get_conversation",
                new_callable=AsyncMock,
                return_value=None,
            ),
        ):
            resp = await client.get(
                f"/api/conversations/{OTHER_CONV_ID}/messages",
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 404
        # Error contract: same {data, error, metadata} envelope as every other
        # route — not Starlette's default {"detail": ...}.
        body = resp.json()
        assert body["data"] is None
        assert body["error"] == "Conversation not found"
        assert "detail" not in body


# ---------------------------------------------------------------------------
# PATCH /api/conversations/{id}
# ---------------------------------------------------------------------------


class TestRenameEndpoint:
    @pytest.mark.asyncio
    async def test_rename_success(self, client):
        token = _make_token()
        updated = {
            "id": CONV_ID,
            "title": "电影 2026 春",
            "created_at": "2026-04-14T00:00:00Z",
            "updated_at": "2026-04-14T00:00:00Z",
        }

        with (
            patch("app.auth.get_settings", _fake_get_settings),
            patch(
                "app.routers.conversations.get_supabase_client",
                return_value=MagicMock(),
            ),
            patch(
                "app.routers.conversations.update_conversation_title",
                new_callable=AsyncMock,
                return_value=updated,
            ) as mock_update,
        ):
            resp = await client.patch(
                f"/api/conversations/{CONV_ID}",
                headers={"Authorization": f"Bearer {token}"},
                json={"title": "电影 2026 春"},
            )

        assert resp.status_code == 200
        assert resp.json()["data"] == updated
        # Verify user_id is passed through
        args = mock_update.call_args
        assert args[0][1] == TEST_USER_ID
        assert args[0][2] == CONV_ID
        assert args[0][3] == "电影 2026 春"

    @pytest.mark.asyncio
    async def test_rename_404_when_not_owned(self, client):
        token = _make_token()
        with (
            patch("app.auth.get_settings", _fake_get_settings),
            patch(
                "app.routers.conversations.get_supabase_client",
                return_value=MagicMock(),
            ),
            patch(
                "app.routers.conversations.update_conversation_title",
                new_callable=AsyncMock,
                return_value=None,
            ),
        ):
            resp = await client.patch(
                f"/api/conversations/{OTHER_CONV_ID}",
                headers={"Authorization": f"Bearer {token}"},
                json={"title": "Stolen"},
            )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_rename_rejects_empty_title(self, client):
        token = _make_token()
        with patch("app.auth.get_settings", _fake_get_settings):
            resp = await client.patch(
                f"/api/conversations/{CONV_ID}",
                headers={"Authorization": f"Bearer {token}"},
                json={"title": "   "},
            )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_requires_auth(self, client):
        resp = await client.patch(
            f"/api/conversations/{CONV_ID}", json={"title": "x"}
        )
        assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# DELETE /api/conversations/{id}
# ---------------------------------------------------------------------------


class TestDeleteEndpoint:
    @pytest.mark.asyncio
    async def test_delete_success(self, client):
        token = _make_token()

        with (
            patch("app.auth.get_settings", _fake_get_settings),
            patch(
                "app.routers.conversations.get_supabase_client",
                return_value=MagicMock(),
            ),
            patch(
                "app.routers.conversations.delete_conversation",
                new_callable=AsyncMock,
                return_value=True,
            ) as mock_delete,
        ):
            resp = await client.delete(
                f"/api/conversations/{CONV_ID}",
                headers={"Authorization": f"Bearer {token}"},
            )

        assert resp.status_code == 200
        assert resp.json()["data"] == {"deleted": True}
        args = mock_delete.call_args
        assert args[0][1] == TEST_USER_ID
        assert args[0][2] == CONV_ID

    @pytest.mark.asyncio
    async def test_delete_404_when_not_owned(self, client):
        token = _make_token()
        with (
            patch("app.auth.get_settings", _fake_get_settings),
            patch(
                "app.routers.conversations.get_supabase_client",
                return_value=MagicMock(),
            ),
            patch(
                "app.routers.conversations.delete_conversation",
                new_callable=AsyncMock,
                return_value=False,
            ),
        ):
            resp = await client.delete(
                f"/api/conversations/{OTHER_CONV_ID}",
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_requires_auth(self, client):
        resp = await client.delete(f"/api/conversations/{CONV_ID}")
        assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Malformed conversation_id -> 422 (not 500)
# ---------------------------------------------------------------------------


class TestUuidValidation:
    """A malformed conversation_id must be rejected at the edge with 422,
    never reach the DB layer, and never surface as a 500."""

    @pytest.mark.asyncio
    async def test_messages_malformed_id_returns_422(self, client):
        token = _make_token()
        with patch("app.auth.get_settings", _fake_get_settings):
            resp = await client.get(
                "/api/conversations/not-a-uuid/messages",
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_rename_malformed_id_returns_422(self, client):
        token = _make_token()
        with patch("app.auth.get_settings", _fake_get_settings):
            resp = await client.patch(
                "/api/conversations/not-a-uuid",
                headers={"Authorization": f"Bearer {token}"},
                json={"title": "x"},
            )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_delete_malformed_id_returns_422(self, client):
        token = _make_token()
        with patch("app.auth.get_settings", _fake_get_settings):
            resp = await client.delete(
                "/api/conversations/not-a-uuid",
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 422
