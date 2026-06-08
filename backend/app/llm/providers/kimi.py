"""Kimi / Moonshot chat provider — OpenAI-compatible API."""

from __future__ import annotations

from app.llm.providers.openai_provider import OpenAIChatProvider


class KimiChatProvider(OpenAIChatProvider):
    """Chat provider backed by the Moonshot (Kimi) API (OpenAI-compatible)."""

    def __init__(self, api_key: str, model: str = "moonshot-v1-8k") -> None:
        super().__init__(
            api_key=api_key,
            model=model,
            base_url="https://api.moonshot.cn/v1",
        )
