from __future__ import annotations

from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.schemas import ResponseEnvelope


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

    # Routers ------------------------------------------------------------
    from app.routers.embeddings import router as embeddings_router
    from app.routers.chat import router as chat_router
    from app.routers.search import router as search_router

    app.include_router(embeddings_router)
    app.include_router(chat_router)
    app.include_router(search_router)

    return app


app = create_app()
