from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import create_app


@pytest.fixture
def app():
    return create_app()


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_health_returns_200(client):
    resp = await client.get("/api/health")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_health_envelope_structure(client):
    resp = await client.get("/api/health")
    body = resp.json()

    assert "data" in body
    assert "error" in body
    assert "metadata" in body

    assert body["error"] is None
    assert body["data"]["status"] == "ok"


@pytest.mark.asyncio
async def test_health_metadata_contains_version_and_timestamp(client):
    resp = await client.get("/api/health")
    body = resp.json()

    metadata = body["metadata"]
    assert "version" in metadata
    assert metadata["version"] == "0.1.0"
    assert "timestamp" in metadata


@pytest.mark.asyncio
async def test_cors_headers(client):
    resp = await client.options(
        "/api/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:5173"
