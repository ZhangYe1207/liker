"""Tests for the embedding service, DB operations, and API endpoints."""

from __future__ import annotations

import hashlib
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from jose import jwt

from app.services.embedding import (
    build_embedding_text,
    compute_content_hash,
    embed_item,
    sync_all_embeddings,
)

# ---------------------------------------------------------------------------
# Test constants
# ---------------------------------------------------------------------------

TEST_SECRET = "test-secret"
TEST_USER_ID = "user-abc-123"

SAMPLE_ITEM = {
    "id": "item-001",
    "title": "The Great Gatsby",
    "categories": {"name": "Books", "icon": "book"},
    "description": "A novel by F. Scott Fitzgerald",
    "review": "A masterpiece of American literature",
    "rating": 5,
    "genre": "Fiction",
}

SAMPLE_ITEM_MINIMAL = {
    "id": "item-002",
    "title": "Untitled",
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


FAKE_EMBEDDING = [0.1] * 1536


def _mock_embedding_provider() -> MagicMock:
    """Return a mock embedding provider whose embed() returns a fixed vector."""
    provider = MagicMock()
    provider.embed = AsyncMock(return_value=[FAKE_EMBEDDING])
    provider.dimensions = 1536
    return provider


def _mock_db_client() -> MagicMock:
    """Return a bare MagicMock to stand in for the Supabase client."""
    return MagicMock()


# ---------------------------------------------------------------------------
# build_embedding_text
# ---------------------------------------------------------------------------


class TestBuildEmbeddingText:
    def test_full_item(self):
        text = build_embedding_text(SAMPLE_ITEM)
        assert "The Great Gatsby" in text
        assert "Books" in text
        assert "A novel by F. Scott Fitzgerald" in text
        assert "A masterpiece of American literature" in text
        assert "评分: 5/5" in text
        assert "Fiction" in text

    def test_minimal_item(self):
        text = build_embedding_text(SAMPLE_ITEM_MINIMAL)
        assert text == "Untitled"

    def test_missing_category(self):
        item = {"id": "x", "title": "No Cat"}
        text = build_embedding_text(item)
        assert text == "No Cat"

    def test_category_not_dict(self):
        """If categories is not a dict (e.g. None), it should be ignored."""
        item = {"id": "x", "title": "Test", "categories": None}
        text = build_embedding_text(item)
        assert text == "Test"

    def test_empty_category_name(self):
        item = {"id": "x", "title": "Test", "categories": {"name": "", "icon": ""}}
        text = build_embedding_text(item)
        assert text == "Test"

    def test_rating_zero_skipped(self):
        """A falsy rating (0) should be skipped."""
        item = {"id": "x", "title": "Test", "rating": 0}
        text = build_embedding_text(item)
        assert "评分" not in text

    def test_description_only(self):
        item = {"id": "x", "title": "T", "description": "Desc here"}
        text = build_embedding_text(item)
        assert text == "T Desc here"


# ---------------------------------------------------------------------------
# compute_content_hash
# ---------------------------------------------------------------------------


class TestComputeContentHash:
    def test_consistent(self):
        h1 = compute_content_hash("hello")
        h2 = compute_content_hash("hello")
        assert h1 == h2

    def test_correct_sha256(self):
        expected = hashlib.sha256("hello".encode()).hexdigest()
        assert compute_content_hash("hello") == expected

    def test_different_inputs(self):
        assert compute_content_hash("a") != compute_content_hash("b")


# ---------------------------------------------------------------------------
# embed_item
# ---------------------------------------------------------------------------


class TestEmbedItem:
    @pytest.mark.asyncio
    async def test_skips_when_hash_matches(self):
        """If the existing embedding has the same content hash, skip."""
        provider = _mock_embedding_provider()
        db = _mock_db_client()

        text = build_embedding_text(SAMPLE_ITEM)
        existing_hash = compute_content_hash(text)

        with patch(
            "app.services.embedding.get_embedding",
            new_callable=AsyncMock,
            return_value={"content_hash": existing_hash},
        ):
            result = await embed_item(provider, db, SAMPLE_ITEM, TEST_USER_ID)

        assert result is False
        provider.embed.assert_not_called()

    @pytest.mark.asyncio
    async def test_updates_when_hash_differs(self):
        """If the existing hash is stale, re-embed and upsert."""
        provider = _mock_embedding_provider()
        db = _mock_db_client()

        with (
            patch(
                "app.services.embedding.get_embedding",
                new_callable=AsyncMock,
                return_value={"content_hash": "old-stale-hash"},
            ),
            patch(
                "app.services.embedding.upsert_embedding",
                new_callable=AsyncMock,
            ) as mock_upsert,
        ):
            result = await embed_item(provider, db, SAMPLE_ITEM, TEST_USER_ID)

        assert result is True
        provider.embed.assert_called_once()
        mock_upsert.assert_called_once()

        # Verify upsert was called with correct args
        call_args = mock_upsert.call_args
        assert call_args[0][1] == SAMPLE_ITEM["id"]  # item_id
        assert call_args[0][2] == TEST_USER_ID  # user_id
        assert call_args[0][3] == FAKE_EMBEDDING  # embedding vector

    @pytest.mark.asyncio
    async def test_creates_for_new_item(self):
        """If no embedding exists yet, generate and store one."""
        provider = _mock_embedding_provider()
        db = _mock_db_client()

        with (
            patch(
                "app.services.embedding.get_embedding",
                new_callable=AsyncMock,
                return_value=None,
            ),
            patch(
                "app.services.embedding.upsert_embedding",
                new_callable=AsyncMock,
            ) as mock_upsert,
        ):
            result = await embed_item(provider, db, SAMPLE_ITEM, TEST_USER_ID)

        assert result is True
        provider.embed.assert_called_once()
        mock_upsert.assert_called_once()


# ---------------------------------------------------------------------------
# sync_all_embeddings
# ---------------------------------------------------------------------------


class TestSyncAllEmbeddings:
    @pytest.mark.asyncio
    async def test_processes_all_items(self):
        """sync_all_embeddings should iterate over every user item."""
        provider = _mock_embedding_provider()
        db = _mock_db_client()

        items = [
            {**SAMPLE_ITEM, "id": "item-1"},
            {**SAMPLE_ITEM_MINIMAL, "id": "item-2"},
            {**SAMPLE_ITEM, "id": "item-3"},
        ]

        with (
            patch(
                "app.services.embedding.get_user_items",
                new_callable=AsyncMock,
                return_value=items,
            ),
            patch(
                "app.services.embedding.get_embedding",
                new_callable=AsyncMock,
                return_value=None,  # all items are new
            ),
            patch(
                "app.services.embedding.upsert_embedding",
                new_callable=AsyncMock,
            ),
        ):
            stats = await sync_all_embeddings(provider, db, TEST_USER_ID)

        assert stats["total"] == 3
        assert stats["updated"] == 3
        assert stats["skipped"] == 0

    @pytest.mark.asyncio
    async def test_mixed_update_and_skip(self):
        """Items with matching hashes should be skipped; others updated."""
        provider = _mock_embedding_provider()
        db = _mock_db_client()

        item_new = {**SAMPLE_ITEM, "id": "item-new"}
        item_existing = {**SAMPLE_ITEM_MINIMAL, "id": "item-existing"}

        existing_text = build_embedding_text(item_existing)
        existing_hash = compute_content_hash(existing_text)

        items = [item_new, item_existing]

        async def _fake_get_embedding(_client, item_id):
            if item_id == "item-existing":
                return {"content_hash": existing_hash}
            return None

        with (
            patch(
                "app.services.embedding.get_user_items",
                new_callable=AsyncMock,
                return_value=items,
            ),
            patch(
                "app.services.embedding.get_embedding",
                side_effect=_fake_get_embedding,
            ),
            patch(
                "app.services.embedding.upsert_embedding",
                new_callable=AsyncMock,
            ),
        ):
            stats = await sync_all_embeddings(provider, db, TEST_USER_ID)

        assert stats["total"] == 2
        assert stats["updated"] == 1
        assert stats["skipped"] == 1

    @pytest.mark.asyncio
    async def test_empty_collection(self):
        provider = _mock_embedding_provider()
        db = _mock_db_client()

        with patch(
            "app.services.embedding.get_user_items",
            new_callable=AsyncMock,
            return_value=[],
        ):
            stats = await sync_all_embeddings(provider, db, TEST_USER_ID)

        assert stats == {"total": 0, "updated": 0, "skipped": 0}


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


class TestSyncEndpoint:
    @pytest.mark.asyncio
    async def test_sync_success(self, client):
        token = _make_token()
        expected_stats = {"total": 5, "updated": 3, "skipped": 2}

        with (
            patch("app.auth.get_settings", _fake_get_settings),
            patch("app.routers.embeddings.get_settings", _fake_get_settings),
            patch(
                "app.routers.embeddings.create_embedding_provider",
                return_value=_mock_embedding_provider(),
            ),
            patch(
                "app.routers.embeddings.get_supabase_client",
                return_value=_mock_db_client(),
            ),
            patch(
                "app.routers.embeddings.sync_all_embeddings",
                new_callable=AsyncMock,
                return_value=expected_stats,
            ),
        ):
            resp = await client.post(
                "/api/embeddings/sync",
                headers={"Authorization": f"Bearer {token}"},
            )

        assert resp.status_code == 200
        body = resp.json()
        assert body["data"] == expected_stats
        assert body["error"] is None

    @pytest.mark.asyncio
    async def test_sync_requires_auth(self, client):
        resp = await client.post("/api/embeddings/sync")
        assert resp.status_code in (401, 403)


class TestEmbedSingleItemEndpoint:
    @pytest.mark.asyncio
    async def test_embed_item_success(self, client):
        token = _make_token()

        with (
            patch("app.auth.get_settings", _fake_get_settings),
            patch("app.routers.embeddings.get_settings", _fake_get_settings),
            patch(
                "app.routers.embeddings.create_embedding_provider",
                return_value=_mock_embedding_provider(),
            ),
            patch(
                "app.routers.embeddings.get_supabase_client",
                return_value=_mock_db_client(),
            ),
            patch(
                "app.routers.embeddings.get_item_with_category",
                new_callable=AsyncMock,
                return_value=SAMPLE_ITEM,
            ),
            patch(
                "app.routers.embeddings.embed_item",
                new_callable=AsyncMock,
                return_value=True,
            ),
        ):
            resp = await client.post(
                "/api/embeddings/item/item-001",
                headers={"Authorization": f"Bearer {token}"},
            )

        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["updated"] is True
        assert body["error"] is None

    @pytest.mark.asyncio
    async def test_embed_item_not_found(self, client):
        token = _make_token()

        with (
            patch("app.auth.get_settings", _fake_get_settings),
            patch("app.routers.embeddings.get_settings", _fake_get_settings),
            patch(
                "app.routers.embeddings.create_embedding_provider",
                return_value=_mock_embedding_provider(),
            ),
            patch(
                "app.routers.embeddings.get_supabase_client",
                return_value=_mock_db_client(),
            ),
            patch(
                "app.routers.embeddings.get_item_with_category",
                new_callable=AsyncMock,
                return_value=None,
            ),
        ):
            resp = await client.post(
                "/api/embeddings/item/nonexistent",
                headers={"Authorization": f"Bearer {token}"},
            )

        assert resp.status_code == 200
        body = resp.json()
        assert body["error"] == "Item not found"
        assert body["data"] is None

    @pytest.mark.asyncio
    async def test_embed_item_requires_auth(self, client):
        resp = await client.post("/api/embeddings/item/item-001")
        assert resp.status_code in (401, 403)
