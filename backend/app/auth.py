from __future__ import annotations

import httpx
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.config import get_settings

security = HTTPBearer()

_jwks_cache: dict | None = None


def _fetch_jwks() -> dict:
    global _jwks_cache
    if _jwks_cache is not None:
        return _jwks_cache
    settings = get_settings()
    url = f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json"
    response = httpx.get(url, timeout=30.0)
    response.raise_for_status()
    _jwks_cache = response.json()
    return _jwks_cache


def _find_key(kid: str | None) -> dict | None:
    jwks = _fetch_jwks()
    keys = jwks.get("keys", [])
    if kid is None:
        return keys[0] if keys else None
    for key in keys:
        if key.get("kid") == kid:
            return key
    # kid not found — invalidate cache and retry once in case of rotation
    global _jwks_cache
    _jwks_cache = None
    jwks = _fetch_jwks()
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            return key
    return None


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    """Validate Supabase JWT and extract user_id (sub claim).

    Supports both legacy HS256 (shared secret) and new asymmetric ES256/RS256
    (via project JWKS endpoint). Algorithm is selected from the token header.
    """
    settings = get_settings()
    token = credentials.credentials
    try:
        header = jwt.get_unverified_header(token)
        alg = header.get("alg", "HS256")

        if alg == "HS256":
            payload = jwt.decode(
                token,
                settings.SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience="authenticated",
            )
        elif alg in ("ES256", "RS256"):
            key = _find_key(header.get("kid"))
            if key is None:
                raise HTTPException(status_code=401, detail="Signing key not found in JWKS")
            payload = jwt.decode(
                token,
                key,
                algorithms=[alg],
                audience="authenticated",
            )
        else:
            raise HTTPException(status_code=401, detail=f"Unsupported JWT alg: {alg}")

        user_id: str | None = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: no sub claim")
        return user_id
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")
