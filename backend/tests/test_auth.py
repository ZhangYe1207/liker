from __future__ import annotations

import time
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient
from jose import jwt

from fastapi import FastAPI, Depends
from app.auth import get_current_user_id

# ---------------------------------------------------------------------------
# Test constants
# ---------------------------------------------------------------------------

TEST_SECRET = "test-secret"
TEST_USER_ID = "user-123"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_token(
    sub: str = TEST_USER_ID,
    aud: str = "authenticated",
    exp: float | None = None,
    **extra_claims,
) -> str:
    """Create a signed JWT for testing."""
    if exp is None:
        exp = time.time() + 3600  # 1 hour from now
    payload = {"sub": sub, "aud": aud, "exp": exp, **extra_claims}
    return jwt.encode(payload, TEST_SECRET, algorithm="HS256")


def _make_expired_token() -> str:
    """Create a JWT that is already expired."""
    return _make_token(exp=time.time() - 3600)


class _FakeSettings:
    """Minimal settings stub for testing."""
    SUPABASE_JWT_SECRET = TEST_SECRET


def _mock_get_settings():
    return _FakeSettings()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def app():
    """Create a small FastAPI app with one protected endpoint."""
    _app = FastAPI()

    @_app.get("/protected")
    async def protected(user_id: str = Depends(get_current_user_id)):
        return {"user_id": user_id}

    return _app


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ---------------------------------------------------------------------------
# Unit tests for get_current_user_id
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_valid_token_returns_user_id(client):
    """A properly signed JWT with a valid sub claim should authenticate."""
    token = _make_token()
    with patch("app.auth.get_settings", _mock_get_settings):
        resp = await client.get(
            "/protected", headers={"Authorization": f"Bearer {token}"}
        )
    assert resp.status_code == 200
    assert resp.json()["user_id"] == TEST_USER_ID


@pytest.mark.asyncio
async def test_missing_token_returns_401(client):
    """A request without an Authorization header should be rejected."""
    resp = await client.get("/protected")
    assert resp.status_code in (401, 403)  # 401 in FastAPI >= 0.135, 403 in older


@pytest.mark.asyncio
async def test_malformed_token_returns_401(client):
    """A clearly invalid JWT string should result in 401."""
    with patch("app.auth.get_settings", _mock_get_settings):
        resp = await client.get(
            "/protected", headers={"Authorization": "Bearer not-a-real-jwt"}
        )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_expired_token_returns_401(client):
    """An expired JWT should be rejected with 401."""
    token = _make_expired_token()
    with patch("app.auth.get_settings", _mock_get_settings):
        resp = await client.get(
            "/protected", headers={"Authorization": f"Bearer {token}"}
        )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_wrong_secret_returns_401(client):
    """A JWT signed with a different secret should fail verification."""
    token = jwt.encode(
        {"sub": TEST_USER_ID, "aud": "authenticated", "exp": time.time() + 3600},
        "wrong-secret",
        algorithm="HS256",
    )
    with patch("app.auth.get_settings", _mock_get_settings):
        resp = await client.get(
            "/protected", headers={"Authorization": f"Bearer {token}"}
        )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_wrong_audience_returns_401(client):
    """A JWT with the wrong audience claim should be rejected."""
    token = _make_token(aud="wrong-audience")
    with patch("app.auth.get_settings", _mock_get_settings):
        resp = await client.get(
            "/protected", headers={"Authorization": f"Bearer {token}"}
        )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_token_without_sub_claim_returns_401(client):
    """A JWT with no sub claim should be rejected."""
    payload = {"aud": "authenticated", "exp": time.time() + 3600}
    token = jwt.encode(payload, TEST_SECRET, algorithm="HS256")
    with patch("app.auth.get_settings", _mock_get_settings):
        resp = await client.get(
            "/protected", headers={"Authorization": f"Bearer {token}"}
        )
    assert resp.status_code == 401
