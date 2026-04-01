"""Embedding provider adapters."""

from __future__ import annotations

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

    async def embed(self, texts: list[str]) -> list[list[float]]:
        response = await self._client.embeddings.create(
            model=self._model,
            input=texts,
        )
        return [item.embedding for item in response.data]


class MiniMaxEmbeddingProvider(OpenAIEmbeddingProvider):
    """Embedding provider backed by the MiniMax API (OpenAI-compatible)."""

    def __init__(
        self,
        api_key: str,
        model: str = "embo-01",
        dimensions: int = 1024,
    ) -> None:
        super().__init__(
            api_key=api_key,
            model=model,
            dimensions=dimensions,
            base_url="https://api.minimax.chat/v1",
        )
