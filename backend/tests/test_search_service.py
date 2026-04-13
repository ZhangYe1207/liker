"""Tests for the search service, external APIs, and search API endpoint."""

from __future__ import annotations

import json
import time
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from httpx import ASGITransport, AsyncClient
from jose import jwt

from app.services.search import (
    execute_get_taste_profile,
    execute_search_collection,
    execute_search_external,
    search_with_tools,
)
from app.services.external_apis import search_books, search_movies, search_music

# ---------------------------------------------------------------------------
# Test constants
# ---------------------------------------------------------------------------

TEST_SECRET = "test-secret"
TEST_USER_ID = "user-abc-123"

FAKE_EMBEDDING = [0.1] * 1536

SAMPLE_ITEMS = [
    {
        "id": "item-001",
        "title": "The Great Gatsby",
        "categories": {"name": "Books", "icon": "book"},
        "description": "A novel by F. Scott Fitzgerald",
        "review": "A masterpiece of American literature",
        "rating": 5,
        "genre": "Fiction",
    },
    {
        "id": "item-002",
        "title": "Inception",
        "categories": {"name": "Movies", "icon": "film"},
        "description": "A mind-bending thriller",
        "review": "Amazing visuals and plot",
        "rating": 4,
        "genre": "Sci-Fi",
    },
    {
        "id": "item-003",
        "title": "Bohemian Rhapsody",
        "categories": {"name": "Music", "icon": "music"},
        "description": "Queen's greatest hit",
        "review": "Timeless classic",
        "rating": 5,
        "genre": "Rock",
    },
    {
        "id": "item-004",
        "title": "To Kill a Mockingbird",
        "categories": {"name": "Books", "icon": "book"},
        "description": "Harper Lee's novel",
        "review": "Powerful story",
        "rating": 3,
        "genre": "Fiction",
    },
]

SIMILARITY_MATCHES = [
    {"item_id": "item-001", "similarity": 0.95},
    {"item_id": "item-002", "similarity": 0.85},
    {"item_id": "item-003", "similarity": 0.75},
    {"item_id": "item-004", "similarity": 0.65},
]


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
    OPENAI_API_KEY = "test-key"
    CLAUDE_API_KEY = "test-key"
    TMDB_API_KEY = "test-tmdb-key"
    SUPABASE_URL = "https://fake.supabase.co"
    SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key"
    CORS_ORIGINS = "http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


def _fake_get_settings():
    return _FakeSettings()


def _mock_embedding_provider() -> MagicMock:
    """Return a mock embedding provider whose embed() returns a fixed vector."""
    provider = MagicMock()
    provider.embed = AsyncMock(return_value=[FAKE_EMBEDDING])
    provider.dimensions = 1536
    return provider


def _mock_db_client() -> MagicMock:
    """Return a bare MagicMock to stand in for the Supabase client."""
    return MagicMock()


def _mock_chat_provider(
    chat_return: dict | None = None,
    final_return: dict | None = None,
) -> MagicMock:
    """Return a mock chat provider.

    *chat_return* is the response from the first call (tool selection).
    *final_return* is the response from the second call (synthesis).
    """
    provider = MagicMock()

    if chat_return is None:
        chat_return = {"content": "Let me search for you.", "tool_calls": None}
    if final_return is None:
        final_return = {"content": "Here are the results.", "tool_calls": None}

    provider.chat = AsyncMock(side_effect=[chat_return, final_return])
    provider.model_name = "test-model"
    return provider


# ---------------------------------------------------------------------------
# execute_search_collection
# ---------------------------------------------------------------------------


class TestExecuteSearchCollection:
    @pytest.mark.asyncio
    async def test_returns_matched_items(self):
        """Should return items that match similarity search."""
        embedding_provider = _mock_embedding_provider()
        db_client = _mock_db_client()

        with (
            patch(
                "app.services.search.similarity_search",
                new_callable=AsyncMock,
                return_value=SIMILARITY_MATCHES[:2],
            ),
            patch(
                "app.services.search.get_user_items",
                new_callable=AsyncMock,
                return_value=SAMPLE_ITEMS,
            ),
        ):
            results = await execute_search_collection(
                embedding_provider, db_client, TEST_USER_ID, {"keywords": "gatsby"}
            )

        assert len(results) == 2
        assert results[0]["title"] == "The Great Gatsby"
        assert results[0]["similarity"] == 0.95
        assert results[1]["title"] == "Inception"
        embedding_provider.embed.assert_called_once_with(["gatsby"], query=True)

    @pytest.mark.asyncio
    async def test_category_filter(self):
        """Should filter results by category."""
        embedding_provider = _mock_embedding_provider()
        db_client = _mock_db_client()

        with (
            patch(
                "app.services.search.similarity_search",
                new_callable=AsyncMock,
                return_value=SIMILARITY_MATCHES,
            ),
            patch(
                "app.services.search.get_user_items",
                new_callable=AsyncMock,
                return_value=SAMPLE_ITEMS,
            ),
        ):
            results = await execute_search_collection(
                embedding_provider,
                db_client,
                TEST_USER_ID,
                {"keywords": "classic", "category": "Books"},
            )

        # Only Books items should remain
        assert len(results) == 2
        assert all(r["category"] == "Books" for r in results)

    @pytest.mark.asyncio
    async def test_min_rating_filter(self):
        """Should filter results by minimum rating."""
        embedding_provider = _mock_embedding_provider()
        db_client = _mock_db_client()

        with (
            patch(
                "app.services.search.similarity_search",
                new_callable=AsyncMock,
                return_value=SIMILARITY_MATCHES,
            ),
            patch(
                "app.services.search.get_user_items",
                new_callable=AsyncMock,
                return_value=SAMPLE_ITEMS,
            ),
        ):
            results = await execute_search_collection(
                embedding_provider,
                db_client,
                TEST_USER_ID,
                {"keywords": "classic", "min_rating": 5},
            )

        # Only items with rating >= 5
        assert len(results) == 2
        assert all(r["rating"] == 5 for r in results)


# ---------------------------------------------------------------------------
# execute_get_taste_profile
# ---------------------------------------------------------------------------


class TestExecuteGetTasteProfile:
    @pytest.mark.asyncio
    async def test_computes_correct_stats(self):
        """Should compute correct total, average rating, and top rated."""
        db_client = _mock_db_client()

        with patch(
            "app.services.search.get_user_items",
            new_callable=AsyncMock,
            return_value=SAMPLE_ITEMS,
        ):
            result = await execute_get_taste_profile(db_client, TEST_USER_ID, {})

        assert result["total_items"] == 4
        # (5 + 4 + 5 + 3) / 4 = 4.25
        assert result["average_rating"] == 4.2
        assert len(result["top_rated"]) == 4  # only 4 items, top 5 requested
        # First item should be one with rating 5
        assert result["top_rated"][0]["rating"] == 5

    @pytest.mark.asyncio
    async def test_with_category_filter(self):
        """Should filter by category before computing stats."""
        db_client = _mock_db_client()

        with patch(
            "app.services.search.get_user_items",
            new_callable=AsyncMock,
            return_value=SAMPLE_ITEMS,
        ):
            result = await execute_get_taste_profile(
                db_client, TEST_USER_ID, {"category": "Books"}
            )

        assert result["total_items"] == 2
        # (5 + 3) / 2 = 4.0
        assert result["average_rating"] == 4.0

    @pytest.mark.asyncio
    async def test_empty_collection_returns_message(self):
        """Should return a message when collection is empty."""
        db_client = _mock_db_client()

        with patch(
            "app.services.search.get_user_items",
            new_callable=AsyncMock,
            return_value=[],
        ):
            result = await execute_get_taste_profile(db_client, TEST_USER_ID, {})

        assert "message" in result
        assert result["message"] == "该分类下没有收藏"


# ---------------------------------------------------------------------------
# search_with_tools
# ---------------------------------------------------------------------------


class TestSearchWithTools:
    @pytest.mark.asyncio
    async def test_executes_tool_calls(self):
        """When the LLM returns tool_calls, they should be executed."""
        chat_provider = _mock_chat_provider(
            chat_return={
                "content": "I'll search your collection.",
                "tool_calls": [
                    {
                        "name": "search_collection",
                        "arguments": {"keywords": "gatsby"},
                    }
                ],
            },
            final_return={"content": "Found The Great Gatsby in your collection."},
        )
        embedding_provider = _mock_embedding_provider()
        db_client = _mock_db_client()

        with (
            patch(
                "app.services.search.similarity_search",
                new_callable=AsyncMock,
                return_value=SIMILARITY_MATCHES[:1],
            ),
            patch(
                "app.services.search.get_user_items",
                new_callable=AsyncMock,
                return_value=SAMPLE_ITEMS[:1],
            ),
        ):
            result, recommendations = await search_with_tools(
                chat_provider,
                embedding_provider,
                db_client,
                TEST_USER_ID,
                "find gatsby",
                stream=False,
            )

        assert result["content"] == "Found The Great Gatsby in your collection."
        assert recommendations == []
        # chat() should be called twice: tool selection + synthesis
        assert chat_provider.chat.call_count == 2

    @pytest.mark.asyncio
    async def test_handles_no_tool_calls(self):
        """When the LLM responds directly without tools, it should still work."""
        chat_provider = _mock_chat_provider(
            chat_return={
                "content": "I can help you search.",
                "tool_calls": None,
            },
            final_return={"content": "How can I help?"},
        )
        embedding_provider = _mock_embedding_provider()
        db_client = _mock_db_client()

        result, recommendations = await search_with_tools(
            chat_provider,
            embedding_provider,
            db_client,
            TEST_USER_ID,
            "hello",
            stream=False,
        )

        assert result["content"] == "How can I help?"
        assert recommendations == []

    @pytest.mark.asyncio
    async def test_external_search_populates_recommendations(self):
        """External search results should appear in recommendations."""
        fake_external_results = [
            {
                "title": "Interstellar",
                "description": "A space epic",
                "year": "2014",
                "coverUrl": "",
                "genre": "",
                "source": "tmdb",
                "externalId": "157336",
            }
        ]

        chat_provider = _mock_chat_provider(
            chat_return={
                "content": "Searching for movies.",
                "tool_calls": [
                    {
                        "name": "search_external",
                        "arguments": {"query": "space movie", "media_type": "movie"},
                    }
                ],
            },
            final_return={"content": "Found Interstellar for you."},
        )
        embedding_provider = _mock_embedding_provider()
        db_client = _mock_db_client()

        with patch(
            "app.services.search.search_movies",
            new_callable=AsyncMock,
            return_value=fake_external_results,
        ):
            result, recommendations = await search_with_tools(
                chat_provider,
                embedding_provider,
                db_client,
                TEST_USER_ID,
                "recommend a space movie",
                stream=False,
                tmdb_api_key="test-key",
            )

        assert len(recommendations) == 1
        assert recommendations[0]["title"] == "Interstellar"

    @pytest.mark.asyncio
    async def test_taste_profile_tool_call(self):
        """get_taste_profile tool call should be executed properly."""
        chat_provider = _mock_chat_provider(
            chat_return={
                "content": "Let me check your taste.",
                "tool_calls": [
                    {
                        "name": "get_taste_profile",
                        "arguments": {"category": "Books"},
                    }
                ],
            },
            final_return={"content": "You love Books with avg rating 4.0."},
        )
        embedding_provider = _mock_embedding_provider()
        db_client = _mock_db_client()

        with patch(
            "app.services.search.get_user_items",
            new_callable=AsyncMock,
            return_value=SAMPLE_ITEMS,
        ):
            result, recommendations = await search_with_tools(
                chat_provider,
                embedding_provider,
                db_client,
                TEST_USER_ID,
                "what are my book preferences",
                stream=False,
            )

        assert "Books" in result["content"] or "4.0" in result["content"]
        assert recommendations == []


# ---------------------------------------------------------------------------
# External API tests
# ---------------------------------------------------------------------------


class TestSearchMovies:
    @pytest.mark.asyncio
    async def test_returns_empty_without_api_key(self):
        """Should return empty list when no API key is provided."""
        result = await search_movies("test", api_key="")
        assert result == []

    @pytest.mark.asyncio
    async def test_successful_response(self):
        """Should parse TMDB response correctly."""
        mock_data = {
            "results": [
                {
                    "id": 123,
                    "title": "Inception",
                    "overview": "A mind-bending thriller",
                    "release_date": "2010-07-16",
                    "poster_path": "/poster.jpg",
                }
            ]
        }
        mock_response = httpx.Response(200, json=mock_data)

        with patch("app.services.external_apis.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_client

            result = await search_movies("inception", api_key="test-key")

        assert len(result) == 1
        assert result[0]["title"] == "Inception"
        assert result[0]["year"] == "2010"
        assert result[0]["source"] == "tmdb"
        assert result[0]["externalId"] == "123"
        assert "poster.jpg" in result[0]["coverUrl"]

    @pytest.mark.asyncio
    async def test_handles_error_response(self):
        """Should return empty list on API error."""
        mock_response = httpx.Response(500)

        with patch("app.services.external_apis.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_client

            result = await search_movies("test", api_key="test-key")

        assert result == []

    @pytest.mark.asyncio
    async def test_missing_poster_path(self):
        """Should handle missing poster_path gracefully."""
        mock_data = {
            "results": [
                {
                    "id": 456,
                    "title": "No Poster Movie",
                    "overview": "",
                    "release_date": "2020-01-01",
                    "poster_path": None,
                }
            ]
        }
        mock_response = httpx.Response(200, json=mock_data)

        with patch("app.services.external_apis.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_client

            result = await search_movies("test", api_key="test-key")

        assert result[0]["coverUrl"] == ""


class TestSearchBooks:
    @pytest.mark.asyncio
    async def test_successful_response(self):
        """Should parse Open Library response correctly."""
        mock_data = {
            "docs": [
                {
                    "title": "The Great Gatsby",
                    "author_name": ["F. Scott Fitzgerald"],
                    "first_publish_year": 1925,
                    "cover_edition_key": "OL12345M",
                    "key": "/works/OL12345W",
                }
            ]
        }
        mock_response = httpx.Response(200, json=mock_data)

        with patch("app.services.external_apis.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_client

            result = await search_books("gatsby")

        assert len(result) == 1
        assert result[0]["title"] == "The Great Gatsby"
        assert result[0]["description"] == "F. Scott Fitzgerald"
        assert result[0]["year"] == "1925"
        assert result[0]["source"] == "openlibrary"
        assert "OL12345M" in result[0]["coverUrl"]

    @pytest.mark.asyncio
    async def test_handles_error_response(self):
        """Should return empty list on API error."""
        mock_response = httpx.Response(500)

        with patch("app.services.external_apis.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_client

            result = await search_books("test")

        assert result == []

    @pytest.mark.asyncio
    async def test_missing_cover_edition_key(self):
        """Should handle missing cover_edition_key gracefully."""
        mock_data = {
            "docs": [
                {
                    "title": "No Cover Book",
                    "author_name": [],
                    "first_publish_year": 2000,
                    "key": "/works/OL999W",
                }
            ]
        }
        mock_response = httpx.Response(200, json=mock_data)

        with patch("app.services.external_apis.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_client

            result = await search_books("test")

        assert result[0]["coverUrl"] == ""


class TestSearchMusic:
    @pytest.mark.asyncio
    async def test_successful_response(self):
        """Should parse iTunes response correctly."""
        mock_data = {
            "results": [
                {
                    "trackName": "Bohemian Rhapsody",
                    "artistName": "Queen",
                    "collectionName": "A Night at the Opera",
                    "releaseDate": "1975-10-31T00:00:00Z",
                    "artworkUrl100": "https://example.com/art.jpg",
                    "primaryGenreName": "Rock",
                    "trackId": 12345,
                }
            ]
        }
        mock_response = httpx.Response(200, json=mock_data)

        with patch("app.services.external_apis.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_client

            result = await search_music("bohemian rhapsody")

        assert len(result) == 1
        assert result[0]["title"] == "Bohemian Rhapsody - Queen"
        assert result[0]["description"] == "A Night at the Opera"
        assert result[0]["year"] == "1975"
        assert result[0]["genre"] == "Rock"
        assert result[0]["source"] == "itunes"
        assert result[0]["externalId"] == "12345"

    @pytest.mark.asyncio
    async def test_handles_error_response(self):
        """Should return empty list on API error."""
        mock_response = httpx.Response(500)

        with patch("app.services.external_apis.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_client

            result = await search_music("test")

        assert result == []


# ---------------------------------------------------------------------------
# execute_search_external
# ---------------------------------------------------------------------------


class TestExecuteSearchExternal:
    @pytest.mark.asyncio
    async def test_dispatches_to_movie(self):
        with patch(
            "app.services.search.search_movies",
            new_callable=AsyncMock,
            return_value=[{"title": "Movie"}],
        ):
            result = await execute_search_external(
                {"query": "test", "media_type": "movie"}, tmdb_api_key="key"
            )
        assert result == [{"title": "Movie"}]

    @pytest.mark.asyncio
    async def test_dispatches_to_book(self):
        with patch(
            "app.services.search.search_books",
            new_callable=AsyncMock,
            return_value=[{"title": "Book"}],
        ):
            result = await execute_search_external(
                {"query": "test", "media_type": "book"}
            )
        assert result == [{"title": "Book"}]

    @pytest.mark.asyncio
    async def test_dispatches_to_music(self):
        with patch(
            "app.services.search.search_music",
            new_callable=AsyncMock,
            return_value=[{"title": "Song"}],
        ):
            result = await execute_search_external(
                {"query": "test", "media_type": "music"}
            )
        assert result == [{"title": "Song"}]

    @pytest.mark.asyncio
    async def test_unknown_media_type_returns_empty(self):
        result = await execute_search_external(
            {"query": "test", "media_type": "unknown"}
        )
        assert result == []


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


class TestSearchEndpoint:
    @pytest.mark.asyncio
    async def test_non_stream_returns_envelope(self, client):
        """Non-streaming search should return ResponseEnvelope with response and recommendations."""
        token = _make_token()
        mock_chat = _mock_chat_provider(
            chat_return={"content": "Searching...", "tool_calls": None},
            final_return={"content": "Here are results."},
        )
        mock_embed = _mock_embedding_provider()

        with (
            patch("app.auth.get_settings", _fake_get_settings),
            patch("app.routers.search.get_settings", _fake_get_settings),
            patch(
                "app.routers.search.create_chat_provider",
                return_value=mock_chat,
            ),
            patch(
                "app.routers.search.create_embedding_provider",
                return_value=mock_embed,
            ),
            patch(
                "app.routers.search.get_supabase_client",
                return_value=_mock_db_client(),
            ),
        ):
            resp = await client.post(
                "/api/ai/search",
                json={"query": "find gatsby", "stream": False},
                headers={"Authorization": f"Bearer {token}"},
            )

        assert resp.status_code == 200
        body = resp.json()
        assert "data" in body
        assert "response" in body["data"]
        assert "recommendations" in body["data"]
        assert body["error"] is None

    @pytest.mark.asyncio
    async def test_requires_auth(self, client):
        """Endpoint should require authentication."""
        resp = await client.post(
            "/api/ai/search",
            json={"query": "test", "stream": False},
        )
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_stream_returns_sse(self, client):
        """Streaming search should return text/event-stream."""
        token = _make_token()

        async def _fake_stream():
            yield {"content": "Hello", "done": False}
            yield {"content": " world", "done": True}

        mock_chat = MagicMock()
        mock_chat.chat = AsyncMock(
            side_effect=[
                {"content": "Searching...", "tool_calls": None},
                _fake_stream(),
            ]
        )
        mock_chat.model_name = "test-model"
        mock_embed = _mock_embedding_provider()

        with (
            patch("app.auth.get_settings", _fake_get_settings),
            patch("app.routers.search.get_settings", _fake_get_settings),
            patch(
                "app.routers.search.create_chat_provider",
                return_value=mock_chat,
            ),
            patch(
                "app.routers.search.create_embedding_provider",
                return_value=mock_embed,
            ),
            patch(
                "app.routers.search.get_supabase_client",
                return_value=_mock_db_client(),
            ),
        ):
            resp = await client.post(
                "/api/ai/search",
                json={"query": "hello", "stream": True},
                headers={"Authorization": f"Bearer {token}"},
            )

        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers["content-type"]
        # Parse SSE data lines
        text = resp.text
        data_lines = [
            line[len("data: "):]
            for line in text.strip().split("\n")
            if line.startswith("data: ")
        ]
        assert len(data_lines) >= 1
        # Check that content chunks are present
        for line in data_lines:
            parsed = json.loads(line)
            assert "type" in parsed
