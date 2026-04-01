"""Protocol definitions for LLM chat and embedding providers."""

from __future__ import annotations

from typing import AsyncIterator, Protocol, runtime_checkable


@runtime_checkable
class ChatProvider(Protocol):
    """Contract for chat completion providers.

    Chat response format:
        {"content": str, "tool_calls": list[dict] | None}

    Streaming yields:
        {"content": str, "done": bool}

    Tool call format:
        {"name": str, "arguments": dict}
    """

    @property
    def model_name(self) -> str: ...

    async def chat(
        self,
        messages: list[dict[str, str]],
        tools: list[dict] | None = None,
        stream: bool = False,
    ) -> dict | AsyncIterator[dict]: ...


@runtime_checkable
class EmbeddingProvider(Protocol):
    """Contract for text embedding providers."""

    @property
    def dimensions(self) -> int: ...

    async def embed(self, texts: list[str]) -> list[list[float]]: ...
