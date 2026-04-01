"""Tests for the multi-provider LLM abstraction layer."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.config import Settings
from app.llm import create_chat_provider, create_embedding_provider
from app.llm.embedding import MiniMaxEmbeddingProvider, OpenAIEmbeddingProvider
from app.llm.protocols import ChatProvider, EmbeddingProvider
from app.llm.providers.claude import ClaudeChatProvider
from app.llm.providers.deepseek import DeepSeekChatProvider
from app.llm.providers.kimi import KimiChatProvider
from app.llm.providers.minimax import MiniMaxChatProvider
from app.llm.providers.openai_provider import OpenAIChatProvider


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_settings(**overrides: str) -> Settings:
    """Create a Settings instance with dummy API keys."""
    defaults = {
        "CLAUDE_API_KEY": "sk-test-claude",
        "OPENAI_API_KEY": "sk-test-openai",
        "DEEPSEEK_API_KEY": "sk-test-deepseek",
        "KIMI_API_KEY": "sk-test-kimi",
        "MINIMAX_API_KEY": "sk-test-minimax",
        "SUPABASE_URL": "https://fake.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "fake",
        "SUPABASE_JWT_SECRET": "fake",
    }
    defaults.update(overrides)
    return Settings(**defaults)  # type: ignore[arg-type]


# =====================================================================
# 1. Factory creates correct provider
# =====================================================================

class TestFactoryCreatesCorrectProvider:
    def test_claude(self):
        provider = create_chat_provider("claude", _make_settings())
        assert isinstance(provider, ClaudeChatProvider)
        assert provider.model_name == "claude-sonnet-4-20250514"

    def test_openai(self):
        provider = create_chat_provider("openai", _make_settings())
        assert isinstance(provider, OpenAIChatProvider)
        assert provider.model_name == "gpt-4o-mini"

    def test_deepseek(self):
        provider = create_chat_provider("deepseek", _make_settings())
        assert isinstance(provider, DeepSeekChatProvider)
        assert provider.model_name == "deepseek-chat"

    def test_kimi(self):
        provider = create_chat_provider("kimi", _make_settings())
        assert isinstance(provider, KimiChatProvider)
        assert provider.model_name == "moonshot-v1-8k"

    def test_minimax(self):
        provider = create_chat_provider("minimax", _make_settings())
        assert isinstance(provider, MiniMaxChatProvider)
        assert provider.model_name == "MiniMax-Text-01"

    def test_openai_embedding(self):
        provider = create_embedding_provider("openai", _make_settings())
        assert isinstance(provider, OpenAIEmbeddingProvider)
        assert provider.dimensions == 1536

    def test_minimax_embedding(self):
        provider = create_embedding_provider("minimax", _make_settings())
        assert isinstance(provider, MiniMaxEmbeddingProvider)
        assert provider.dimensions == 1024


# =====================================================================
# 2. Invalid provider name raises ValueError
# =====================================================================

class TestInvalidProviderRaises:
    def test_invalid_chat_provider(self):
        with pytest.raises(ValueError, match="Unknown chat provider 'nonexistent'"):
            create_chat_provider("nonexistent", _make_settings())

    def test_invalid_embedding_provider(self):
        with pytest.raises(ValueError, match="Unknown embedding provider 'nonexistent'"):
            create_embedding_provider("nonexistent", _make_settings())

    def test_error_lists_supported_providers(self):
        with pytest.raises(ValueError, match="Supported providers:"):
            create_chat_provider("bad", _make_settings())


# =====================================================================
# 3. Each provider adapter can be instantiated
# =====================================================================

class TestProviderInstantiation:
    def test_claude_instantiation(self):
        provider = ClaudeChatProvider(api_key="test-key")
        assert provider.model_name == "claude-sonnet-4-20250514"

    def test_openai_instantiation(self):
        provider = OpenAIChatProvider(api_key="test-key")
        assert provider.model_name == "gpt-4o-mini"

    def test_deepseek_instantiation(self):
        provider = DeepSeekChatProvider(api_key="test-key")
        assert provider.model_name == "deepseek-chat"

    def test_kimi_instantiation(self):
        provider = KimiChatProvider(api_key="test-key")
        assert provider.model_name == "moonshot-v1-8k"

    def test_minimax_instantiation(self):
        provider = MiniMaxChatProvider(api_key="test-key")
        assert provider.model_name == "MiniMax-Text-01"

    def test_openai_embedding_instantiation(self):
        provider = OpenAIEmbeddingProvider(api_key="test-key")
        assert provider.dimensions == 1536

    def test_minimax_embedding_instantiation(self):
        provider = MiniMaxEmbeddingProvider(api_key="test-key")
        assert provider.dimensions == 1024

    def test_deepseek_inherits_openai(self):
        assert issubclass(DeepSeekChatProvider, OpenAIChatProvider)

    def test_kimi_inherits_openai(self):
        assert issubclass(KimiChatProvider, OpenAIChatProvider)

    def test_minimax_chat_inherits_openai(self):
        assert issubclass(MiniMaxChatProvider, OpenAIChatProvider)


# =====================================================================
# 4. Mock SDK calls — OpenAI-compatible chat response
# =====================================================================

class TestOpenAIChatResponse:
    @pytest.mark.asyncio
    async def test_basic_chat_response(self):
        provider = OpenAIChatProvider(api_key="test-key")

        mock_message = SimpleNamespace(
            content="Hello, world!",
            tool_calls=None,
        )
        mock_choice = SimpleNamespace(message=mock_message)
        mock_response = SimpleNamespace(choices=[mock_choice])

        provider._client.chat.completions.create = AsyncMock(return_value=mock_response)

        result = await provider.chat(
            messages=[{"role": "user", "content": "Hi"}],
        )

        assert result["content"] == "Hello, world!"
        assert result["tool_calls"] is None

    @pytest.mark.asyncio
    async def test_chat_with_tool_calls(self):
        provider = OpenAIChatProvider(api_key="test-key")

        mock_func = SimpleNamespace(
            name="get_weather",
            arguments='{"location": "Tokyo"}',
        )
        mock_tool_call = SimpleNamespace(
            id="call_1",
            type="function",
            function=mock_func,
        )
        mock_message = SimpleNamespace(
            content="",
            tool_calls=[mock_tool_call],
        )
        mock_choice = SimpleNamespace(message=mock_message)
        mock_response = SimpleNamespace(choices=[mock_choice])

        provider._client.chat.completions.create = AsyncMock(return_value=mock_response)

        result = await provider.chat(
            messages=[{"role": "user", "content": "What's the weather?"}],
            tools=[{"name": "get_weather", "description": "Get weather", "parameters": {}}],
        )

        assert result["tool_calls"] is not None
        assert len(result["tool_calls"]) == 1
        assert result["tool_calls"][0]["name"] == "get_weather"
        assert result["tool_calls"][0]["arguments"] == {"location": "Tokyo"}


# =====================================================================
# 5. Mock SDK calls — Claude chat response
# =====================================================================

class TestClaudeChatResponse:
    @pytest.mark.asyncio
    async def test_basic_chat_response(self):
        provider = ClaudeChatProvider(api_key="test-key")

        text_block = SimpleNamespace(type="text", text="Hello from Claude!")
        mock_response = SimpleNamespace(content=[text_block])

        provider._client.messages.create = AsyncMock(return_value=mock_response)

        result = await provider.chat(
            messages=[{"role": "user", "content": "Hi"}],
        )

        assert result["content"] == "Hello from Claude!"
        assert result["tool_calls"] is None

    @pytest.mark.asyncio
    async def test_system_message_extraction(self):
        provider = ClaudeChatProvider(api_key="test-key")

        text_block = SimpleNamespace(type="text", text="Response")
        mock_response = SimpleNamespace(content=[text_block])

        provider._client.messages.create = AsyncMock(return_value=mock_response)

        await provider.chat(
            messages=[
                {"role": "system", "content": "You are helpful."},
                {"role": "user", "content": "Hi"},
            ],
        )

        call_kwargs = provider._client.messages.create.call_args[1]
        assert call_kwargs["system"] == "You are helpful."
        # System message should NOT appear in messages list.
        assert all(m["role"] != "system" for m in call_kwargs["messages"])

    @pytest.mark.asyncio
    async def test_tool_use_response(self):
        provider = ClaudeChatProvider(api_key="test-key")

        tool_block = SimpleNamespace(
            type="tool_use",
            name="search",
            input={"query": "test"},
        )
        text_block = SimpleNamespace(type="text", text="I'll search for that.")
        mock_response = SimpleNamespace(content=[text_block, tool_block])

        provider._client.messages.create = AsyncMock(return_value=mock_response)

        result = await provider.chat(
            messages=[{"role": "user", "content": "Search for test"}],
            tools=[{"name": "search", "description": "Search", "parameters": {"type": "object"}}],
        )

        assert result["content"] == "I'll search for that."
        assert result["tool_calls"] is not None
        assert len(result["tool_calls"]) == 1
        assert result["tool_calls"][0]["name"] == "search"
        assert result["tool_calls"][0]["arguments"] == {"query": "test"}


# =====================================================================
# 6. Mock SDK calls — streaming
# =====================================================================

class _FakeAsyncStream:
    """Mimics the OpenAI AsyncStream which is both awaitable and async-iterable."""

    def __init__(self, items: list) -> None:
        self._items = items

    def __await__(self):
        # When awaited, returns self (like the real AsyncStream).
        return self._resolve().__await__()

    async def _resolve(self):
        return self

    def __aiter__(self):
        return self._iter_items()

    async def _iter_items(self):
        for item in self._items:
            yield item


class TestOpenAIStreaming:
    @pytest.mark.asyncio
    async def test_streaming_yields_chunks(self):
        provider = OpenAIChatProvider(api_key="test-key")

        # Build fake chunks matching the OpenAI SDK shape.
        chunk1 = SimpleNamespace(
            choices=[SimpleNamespace(delta=SimpleNamespace(content="Hello"))]
        )
        chunk2 = SimpleNamespace(
            choices=[SimpleNamespace(delta=SimpleNamespace(content=" world"))]
        )
        chunk3 = SimpleNamespace(
            choices=[SimpleNamespace(delta=SimpleNamespace(content=None))]
        )

        fake_stream = _FakeAsyncStream([chunk1, chunk2, chunk3])

        async def fake_create(**kwargs):
            return fake_stream

        provider._client.chat.completions.create = fake_create

        stream = await provider.chat(
            messages=[{"role": "user", "content": "Hi"}],
            stream=True,
        )

        chunks: list[dict] = []
        async for chunk in stream:
            chunks.append(chunk)

        # Should have content chunks + final done chunk.
        assert any(c["content"] == "Hello" for c in chunks)
        assert any(c["content"] == " world" for c in chunks)
        assert chunks[-1]["done"] is True


class TestClaudeStreaming:
    @pytest.mark.asyncio
    async def test_streaming_yields_chunks(self):
        provider = ClaudeChatProvider(api_key="test-key")

        # Mock the streaming context manager.
        async def fake_text_stream():
            for text in ["Hello", " from", " Claude"]:
                yield text

        mock_stream_ctx = AsyncMock()
        mock_stream_obj = MagicMock()
        mock_stream_obj.text_stream = fake_text_stream()
        mock_stream_ctx.__aenter__ = AsyncMock(return_value=mock_stream_obj)
        mock_stream_ctx.__aexit__ = AsyncMock(return_value=False)

        provider._client.messages.stream = MagicMock(return_value=mock_stream_ctx)

        stream = await provider.chat(
            messages=[{"role": "user", "content": "Hi"}],
            stream=True,
        )

        chunks: list[dict] = []
        async for chunk in stream:
            chunks.append(chunk)

        contents = [c["content"] for c in chunks if c["content"]]
        assert "Hello" in contents
        assert " from" in contents
        assert " Claude" in contents
        assert chunks[-1]["done"] is True


# =====================================================================
# 7. Mock embedding returns vectors of correct dimensionality
# =====================================================================

class TestEmbedding:
    @pytest.mark.asyncio
    async def test_openai_embedding_dimensions(self):
        provider = OpenAIEmbeddingProvider(api_key="test-key")

        fake_vectors = [[0.1] * 1536, [0.2] * 1536]
        mock_data = [
            SimpleNamespace(embedding=v) for v in fake_vectors
        ]
        mock_response = SimpleNamespace(data=mock_data)

        provider._client.embeddings.create = AsyncMock(return_value=mock_response)

        result = await provider.embed(["hello", "world"])

        assert len(result) == 2
        assert len(result[0]) == 1536
        assert len(result[1]) == 1536

    @pytest.mark.asyncio
    async def test_minimax_embedding_dimensions(self):
        provider = MiniMaxEmbeddingProvider(api_key="test-key")

        fake_vectors = [[0.5] * 1024]
        mock_data = [SimpleNamespace(embedding=v) for v in fake_vectors]
        mock_response = SimpleNamespace(data=mock_data)

        provider._client.embeddings.create = AsyncMock(return_value=mock_response)

        result = await provider.embed(["test"])

        assert len(result) == 1
        assert len(result[0]) == 1024


# =====================================================================
# 8. Tool call normalization across providers
# =====================================================================

class TestToolCallNormalization:
    """Verify that both Claude and OpenAI providers normalize tool calls to
    the same ``{"name": str, "arguments": dict}`` format."""

    def test_openai_normalize_tool_calls(self):
        raw = [
            SimpleNamespace(
                function=SimpleNamespace(
                    name="fn_a",
                    arguments='{"x": 1}',
                ),
            ),
        ]
        result = OpenAIChatProvider._normalize_tool_calls(raw)
        assert result == [{"name": "fn_a", "arguments": {"x": 1}}]

    def test_openai_normalize_with_dict_input(self):
        raw = [
            {
                "function": {
                    "name": "fn_b",
                    "arguments": '{"y": 2}',
                },
            },
        ]
        result = OpenAIChatProvider._normalize_tool_calls(raw)
        assert result == [{"name": "fn_b", "arguments": {"y": 2}}]

    def test_openai_normalize_none(self):
        assert OpenAIChatProvider._normalize_tool_calls(None) is None
        assert OpenAIChatProvider._normalize_tool_calls([]) is None

    def test_claude_normalize_tool_calls(self):
        blocks = [
            SimpleNamespace(type="tool_use", name="fn_c", input={"z": 3}),
            SimpleNamespace(type="text", text="ignore me"),
        ]
        result = ClaudeChatProvider._normalize_tool_calls(blocks)
        assert result == [{"name": "fn_c", "arguments": {"z": 3}}]

    def test_claude_normalize_no_tool_use(self):
        blocks = [SimpleNamespace(type="text", text="just text")]
        result = ClaudeChatProvider._normalize_tool_calls(blocks)
        assert result is None

    def test_claude_normalize_string_input(self):
        blocks = [
            SimpleNamespace(type="tool_use", name="fn_d", input='{"a": 1}'),
        ]
        result = ClaudeChatProvider._normalize_tool_calls(blocks)
        assert result == [{"name": "fn_d", "arguments": {"a": 1}}]

    def test_openai_convert_tools_wraps_bare_spec(self):
        tools = [{"name": "fn_e", "description": "test", "parameters": {}}]
        result = OpenAIChatProvider._convert_tools(tools)
        assert result == [{"type": "function", "function": tools[0]}]

    def test_openai_convert_tools_passes_through_function_type(self):
        tools = [{"type": "function", "function": {"name": "fn_f"}}]
        result = OpenAIChatProvider._convert_tools(tools)
        assert result == tools

    def test_claude_convert_tools_from_openai_format(self):
        tools = [{"type": "function", "function": {"name": "fn_g", "description": "test", "parameters": {"type": "object"}}}]
        result = ClaudeChatProvider._convert_tools(tools)
        assert result == [{"name": "fn_g", "description": "test", "input_schema": {"type": "object"}}]

    def test_claude_convert_tools_native_format(self):
        tools = [{"name": "fn_h", "description": "test", "parameters": {"type": "object"}}]
        result = ClaudeChatProvider._convert_tools(tools)
        assert result == [{"name": "fn_h", "description": "test", "input_schema": {"type": "object"}}]
