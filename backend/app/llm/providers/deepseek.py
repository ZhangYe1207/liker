"""DeepSeek chat provider — OpenAI-compatible API."""

from __future__ import annotations

from app.llm.providers.openai_provider import OpenAIChatProvider


class DeepSeekChatProvider(OpenAIChatProvider):
    """Chat provider backed by the DeepSeek API (OpenAI-compatible)."""

    def __init__(self, api_key: str, model: str = "deepseek-chat") -> None:
        super().__init__(
            api_key=api_key,
            model=model,
            base_url="https://api.deepseek.com",
        )
