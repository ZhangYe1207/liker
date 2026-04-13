"""External API wrappers for movie, book, and music search."""

from __future__ import annotations

import httpx

TMDB_BASE = "https://api.themoviedb.org/3"
OPEN_LIBRARY_BASE = "https://openlibrary.org"
ITUNES_BASE = "https://itunes.apple.com"


async def search_movies(query: str, api_key: str = "") -> list[dict]:
    """Search TMDB for movies."""
    if not api_key:
        return []
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{TMDB_BASE}/search/movie",
            params={"query": query, "api_key": api_key, "language": "zh-CN"},
        )
        if resp.status_code != 200:
            return []
        data = resp.json()
        return [
            {
                "title": m["title"],
                "description": m.get("overview", ""),
                "year": m.get("release_date", "")[:4],
                "coverUrl": (
                    f"https://image.tmdb.org/t/p/w300{m['poster_path']}"
                    if m.get("poster_path")
                    else ""
                ),
                "genre": "",
                "source": "tmdb",
                "externalId": str(m["id"]),
            }
            for m in data.get("results", [])[:5]
        ]


async def search_books(query: str) -> list[dict]:
    """Search Open Library for books."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{OPEN_LIBRARY_BASE}/search.json",
            params={"q": query, "limit": 5, "language": "chi"},
        )
        if resp.status_code != 200:
            return []
        data = resp.json()
        return [
            {
                "title": b.get("title", ""),
                "description": ", ".join(b.get("author_name", [])),
                "year": str(b.get("first_publish_year", "")),
                "coverUrl": (
                    f"https://covers.openlibrary.org/b/olid/{b['cover_edition_key']}-M.jpg"
                    if b.get("cover_edition_key")
                    else ""
                ),
                "genre": "",
                "source": "openlibrary",
                "externalId": b.get("key", ""),
            }
            for b in data.get("docs", [])[:5]
        ]


async def search_music(query: str) -> list[dict]:
    """Search iTunes for music."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{ITUNES_BASE}/search",
            params={"term": query, "media": "music", "limit": 5},
        )
        if resp.status_code != 200:
            return []
        data = resp.json()
        return [
            {
                "title": f"{r.get('trackName', '')} - {r.get('artistName', '')}",
                "description": r.get("collectionName", ""),
                "year": r.get("releaseDate", "")[:4],
                "coverUrl": r.get("artworkUrl100", ""),
                "genre": r.get("primaryGenreName", ""),
                "source": "itunes",
                "externalId": str(r.get("trackId", "")),
            }
            for r in data.get("results", [])[:5]
        ]
