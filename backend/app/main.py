from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.config import get_settings


# ---------------------------------------------------------------------------
# Response envelope
# ---------------------------------------------------------------------------

class ResponseEnvelope(BaseModel):
    """Standard API response wrapper matching the frontend convention."""
    data: Any = None
    error: str | None = None
    metadata: dict[str, Any] | None = None


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------

def create_app() -> FastAPI:
    """Build and configure the FastAPI application."""
    settings = get_settings()

    app = FastAPI(
        title="Liker Backend",
        version="0.1.0",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )

    # CORS ---------------------------------------------------------------
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Health check -------------------------------------------------------
    @app.get("/api/health", response_model=ResponseEnvelope)
    async def health_check() -> ResponseEnvelope:
        return ResponseEnvelope(
            data={"status": "ok"},
            metadata={
                "version": app.version,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )

    return app


app = create_app()
