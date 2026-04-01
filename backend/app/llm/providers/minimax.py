"""MiniMax chat provider — OpenAI-compatible API."""

from __future__ import annotations

from app.llm.providers.openai_provider import OpenAIChatProvider


class MiniMaxChatProvider(OpenAIChatProvider):
    """Chat provider backed by the MiniMax API (OpenAI-compatible)."""

    def __init__(self, api_key: str, model: str = "MiniMax-Text-01") -> None:
        super().__init__(
            api_key=api_key,
            model=model,
            base_url="https://api.minimax.chat/v1",
        )
