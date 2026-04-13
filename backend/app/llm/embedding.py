"""Embedding provider adapters."""

from __future__ import annotations

import asyncio

import httpx
from openai import AsyncOpenAI


class OpenAIEmbeddingProvider:
    """Embedding provider backed by OpenAI's text-embedding API."""

    def __init__(
        self,
        api_key: str,
        model: str = "text-embedding-3-small",
        dimensions: int = 1536,
        base_url: str | None = None,
    ) -> None:
        kwargs: dict = {"api_key": api_key}
        if base_url is not None:
            kwargs["base_url"] = base_url
        self._client = AsyncOpenAI(**kwargs)
        self._model = model
        self._dimensions = dimensions

    @property
    def dimensions(self) -> int:
        return self._dimensions

    async def embed(
        self, texts: list[str], *, query: bool = False
    ) -> list[list[float]]:
        # OpenAI has a single embedding space; the ``query`` flag is accepted
        # for Protocol parity with providers that distinguish db/query (MiniMax).
        del query
        response = await self._client.embeddings.create(
            model=self._model,
            input=texts,
        )
        return [item.embedding for item in response.data]


class MiniMaxEmbeddingProvider:
    """Embedding provider backed by MiniMax's native embedding API.

    MiniMax's embedding API is NOT OpenAI-compatible: the request uses ``texts``
    + ``type`` fields, the response returns ``vectors`` (not ``data``), and every
    call must carry a ``GroupId`` query parameter obtained from the MiniMax
    console.
    """

    _ENDPOINT = "https://api.minimaxi.com/v1/embeddings"
    # MiniMax personal-tier RPM is tight; 1002 means rate-limited. Retry with
    # exponential backoff so bulk syncs don't explode on a burst.
    _RATE_LIMIT_STATUS = 1002
    _MAX_RETRIES = 4
    _INITIAL_BACKOFF = 1.0

    def __init__(
        self,
        api_key: str,
        group_id: str,
        model: str = "embo-01",
        dimensions: int = 1536,
    ) -> None:
        if not group_id:
            raise ValueError(
                "MiniMax embedding requires MINIMAX_GROUP_ID "
                "(get it from https://www.minimaxi.com/user-center/basic-information)"
            )
        self._api_key = api_key
        self._group_id = group_id
        self._model = model
        self._dimensions = dimensions

    @property
    def dimensions(self) -> int:
        return self._dimensions

    async def embed(
        self, texts: list[str], *, query: bool = False
    ) -> list[list[float]]:
        """Embed *texts*.

        Pass ``query=True`` when embedding a search query (uses MiniMax's
        ``type: "query"``); default ``query=False`` uses ``type: "db"`` for
        documents being stored. MiniMax's ``db`` and ``query`` embeddings live
        in different vector spaces and must be paired at retrieval time.
        """
        payload = {
            "model": self._model,
            "texts": texts,
            "type": "query" if query else "db",
        }
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        backoff = self._INITIAL_BACKOFF
        async with httpx.AsyncClient(timeout=30.0) as client:
            for attempt in range(self._MAX_RETRIES):
                response = await client.post(
                    self._ENDPOINT,
                    params={"GroupId": self._group_id},
                    headers=headers,
                    json=payload,
                )
                response.raise_for_status()
                body = response.json()

                base_resp = body.get("base_resp", {})
                status_code = base_resp.get("status_code", -1)

                if (
                    status_code == self._RATE_LIMIT_STATUS
                    and attempt < self._MAX_RETRIES - 1
                ):
                    await asyncio.sleep(backoff)
                    backoff *= 2
                    continue

                if status_code != 0:
                    raise RuntimeError(
                        f"MiniMax embedding API error: {base_resp.get('status_msg')} "
                        f"(status_code={status_code})"
                    )
                vectors = body.get("vectors")
                if not vectors:
                    raise RuntimeError("MiniMax embedding API returned no vectors")
                return vectors

        raise RuntimeError("MiniMax embedding: unreachable retry loop exit")
