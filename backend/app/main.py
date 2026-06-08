from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import get_settings
from app.schemas import ResponseEnvelope

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-warm JWKS so the first authenticated request doesn't pay the 6s TLS handshake.
    settings = get_settings()
    if settings.SUPABASE_URL:
        from app.auth import _fetch_jwks
        print("[startup] Warming JWKS cache...", flush=True)
        try:
            _fetch_jwks()
            print("[startup] JWKS cache warmed", flush=True)
        except Exception as exc:
            print(f"[startup] JWKS pre-warm skipped: {exc}", flush=True)
    else:
        print("[startup] SUPABASE_URL empty, skipping JWKS pre-warm", flush=True)
    yield


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
        lifespan=lifespan,
    )

    # CORS ---------------------------------------------------------------
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Error contract -----------------------------------------------------
    # Every route returns the ``ResponseEnvelope`` shape ({data, error,
    # metadata}). FastAPI/Starlette otherwise emit ``{"detail": ...}`` for
    # HTTPException and validation errors, which forced the frontend to parse
    # errors differently per endpoint. These handlers normalize the *body*
    # while preserving the original status code and headers.

    @app.exception_handler(StarletteHTTPException)
    async def _http_exception_handler(
        request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        detail = exc.detail if isinstance(exc.detail, str) else "请求失败"
        return JSONResponse(
            status_code=exc.status_code,
            content=ResponseEnvelope(error=detail).model_dump(),
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=ResponseEnvelope(
                error="请求参数校验失败",
                metadata={"errors": jsonable_encoder(exc.errors())},
            ).model_dump(),
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
    from app.routers.conversations import router as conversations_router

    app.include_router(embeddings_router)
    app.include_router(chat_router)
    app.include_router(search_router)
    app.include_router(conversations_router)

    return app


app = create_app()
