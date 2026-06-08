"""OpenAI-compatible chat provider adapter.

Used directly for OpenAI and subclassed by DeepSeek / Kimi / MiniMax which
share the same wire format but use different base URLs and models.
"""

from __future__ import annotations

import json
from typing import AsyncIterator

from openai import AsyncOpenAI


class OpenAIChatProvider:
    """Chat provider backed by the OpenAI chat completions API."""

    def __init__(
        self,
        api_key: str,
        model: str = "gpt-4o-mini",
        base_url: str | None = None,
    ) -> None:
        kwargs: dict = {"api_key": api_key}
        if base_url is not None:
            kwargs["base_url"] = base_url
        self._client = AsyncOpenAI(**kwargs)
        self._model = model

    @property
    def model_name(self) -> str:
        return self._model

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _convert_tools(tools: list[dict] | None) -> list[dict] | None:
        """Ensure tools are in OpenAI function-calling format."""
        if not tools:
            return None
        openai_tools: list[dict] = []
        for tool in tools:
            if "type" in tool and tool["type"] == "function":
                openai_tools.append(tool)
            else:
                # Assume bare function spec — wrap it.
                openai_tools.append({"type": "function", "function": tool})
        return openai_tools

    @staticmethod
    def _normalize_tool_calls(raw_tool_calls: list | None) -> list[dict] | None:
        """Normalize OpenAI tool call objects to ``{"name", "arguments"}``."""
        if not raw_tool_calls:
            return None
        result: list[dict] = []
        for tc in raw_tool_calls:
            func = tc.function if hasattr(tc, "function") else tc.get("function", tc)
            name = func.name if hasattr(func, "name") else func.get("name", "")
            args_raw = func.arguments if hasattr(func, "arguments") else func.get("arguments", "{}")
            try:
                arguments = json.loads(args_raw) if isinstance(args_raw, str) else args_raw
            except (json.JSONDecodeError, TypeError):
                arguments = {}
            result.append({"name": name, "arguments": arguments})
        return result

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def chat(
        self,
        messages: list[dict[str, str]],
        tools: list[dict] | None = None,
        stream: bool = False,
    ) -> dict | AsyncIterator[dict]:
        openai_tools = self._convert_tools(tools)

        kwargs: dict = {
            "model": self._model,
            "messages": messages,
            "stream": stream,
        }
        if openai_tools:
            kwargs["tools"] = openai_tools

        if stream:
            return self._stream(kwargs)

        response = await self._client.chat.completions.create(**kwargs)
        choice = response.choices[0]
        message = choice.message
        return {
            "content": message.content or "",
            "tool_calls": self._normalize_tool_calls(
                message.tool_calls  # type: ignore[arg-type]
            ),
        }

    async def _stream(self, kwargs: dict) -> AsyncIterator[dict]:
        response = await self._client.chat.completions.create(**kwargs)
        async for chunk in response:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta and delta.content:
                yield {"content": delta.content, "done": False}
        yield {"content": "", "done": True}
