"""Anthropic Claude chat provider adapter."""

from __future__ import annotations

import json
from typing import AsyncIterator

from anthropic import AsyncAnthropic


class ClaudeChatProvider:
    """Chat provider backed by the Anthropic messages API."""

    def __init__(self, api_key: str, model: str = "claude-sonnet-4-20250514") -> None:
        self._client = AsyncAnthropic(api_key=api_key)
        self._model = model

    @property
    def model_name(self) -> str:
        return self._model

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _convert_messages(messages: list[dict[str, str]]) -> tuple[str | None, list[dict]]:
        """Split a flat message list into (system, messages) for Anthropic.

        The Anthropic API expects the system prompt as a separate parameter,
        not embedded in the messages list.
        """
        system: str | None = None
        converted: list[dict] = []
        for msg in messages:
            if msg["role"] == "system":
                system = msg["content"]
            else:
                converted.append({"role": msg["role"], "content": msg["content"]})
        return system, converted

    @staticmethod
    def _convert_tools(tools: list[dict] | None) -> list[dict] | None:
        """Convert generic tool specs to Anthropic tool format."""
        if not tools:
            return None
        anthropic_tools: list[dict] = []
        for tool in tools:
            # Support both {"name", "description", "parameters"} and
            # {"type": "function", "function": {...}} (OpenAI-style).
            if "type" in tool and tool["type"] == "function":
                func = tool["function"]
            else:
                func = tool
            anthropic_tools.append({
                "name": func.get("name", ""),
                "description": func.get("description", ""),
                "input_schema": func.get("parameters", func.get("input_schema", {})),
            })
        return anthropic_tools

    @staticmethod
    def _normalize_tool_calls(content_blocks: list) -> list[dict] | None:
        """Extract tool_use blocks into ``{"name", "arguments"}`` format."""
        calls: list[dict] = []
        for block in content_blocks:
            block_type = block.type if hasattr(block, "type") else block.get("type")
            if block_type == "tool_use":
                name = block.name if hasattr(block, "name") else block.get("name", "")
                raw_input = block.input if hasattr(block, "input") else block.get("input", {})
                if isinstance(raw_input, str):
                    try:
                        raw_input = json.loads(raw_input)
                    except (json.JSONDecodeError, TypeError):
                        raw_input = {}
                calls.append({"name": name, "arguments": raw_input})
        return calls or None

    @staticmethod
    def _extract_text(content_blocks: list) -> str:
        """Extract text from content blocks."""
        parts: list[str] = []
        for block in content_blocks:
            block_type = block.type if hasattr(block, "type") else block.get("type")
            if block_type == "text":
                text = block.text if hasattr(block, "text") else block.get("text", "")
                parts.append(text)
        return "".join(parts)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def chat(
        self,
        messages: list[dict[str, str]],
        tools: list[dict] | None = None,
        stream: bool = False,
    ) -> dict | AsyncIterator[dict]:
        system, converted_messages = self._convert_messages(messages)
        anthropic_tools = self._convert_tools(tools)

        kwargs: dict = {
            "model": self._model,
            "messages": converted_messages,
            "max_tokens": 4096,
        }
        if system:
            kwargs["system"] = system
        if anthropic_tools:
            kwargs["tools"] = anthropic_tools

        if stream:
            return self._stream(kwargs)

        response = await self._client.messages.create(**kwargs)
        return {
            "content": self._extract_text(response.content),
            "tool_calls": self._normalize_tool_calls(response.content),
        }

    async def _stream(self, kwargs: dict) -> AsyncIterator[dict]:
        async with self._client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield {"content": text, "done": False}
        yield {"content": "", "done": True}
