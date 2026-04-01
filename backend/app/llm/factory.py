"""Factory functions for creating LLM providers from configuration."""

from __future__ import annotations

from app.config import Settings
from app.llm.embedding import MiniMaxEmbeddingProvider, OpenAIEmbeddingProvider
from app.llm.protocols import ChatProvider, EmbeddingProvider
from app.llm.providers.claude import ClaudeChatProvider
from app.llm.providers.deepseek import DeepSeekChatProvider
from app.llm.providers.kimi import KimiChatProvider
from app.llm.providers.minimax import MiniMaxChatProvider
from app.llm.providers.openai_provider import OpenAIChatProvider

_CHAT_PROVIDERS = {
    "claude": lambda s: ClaudeChatProvider(api_key=s.CLAUDE_API_KEY),
    "openai": lambda s: OpenAIChatProvider(api_key=s.OPENAI_API_KEY),
    "deepseek": lambda s: DeepSeekChatProvider(api_key=s.DEEPSEEK_API_KEY),
    "kimi": lambda s: KimiChatProvider(api_key=s.KIMI_API_KEY),
    "minimax": lambda s: MiniMaxChatProvider(api_key=s.MINIMAX_API_KEY),
}

_EMBEDDING_PROVIDERS = {
    "openai": lambda s: OpenAIEmbeddingProvider(api_key=s.OPENAI_API_KEY),
    "minimax": lambda s: MiniMaxEmbeddingProvider(api_key=s.MINIMAX_API_KEY),
}


def create_chat_provider(provider_name: str, settings: Settings) -> ChatProvider:
    """Instantiate a chat provider by name.

    Raises ``ValueError`` if *provider_name* is not recognised.
    """
    builder = _CHAT_PROVIDERS.get(provider_name)
    if builder is None:
        supported = ", ".join(sorted(_CHAT_PROVIDERS))
        raise ValueError(
            f"Unknown chat provider '{provider_name}'. "
            f"Supported providers: {supported}"
        )
    return builder(settings)


def create_embedding_provider(provider_name: str, settings: Settings) -> EmbeddingProvider:
    """Instantiate an embedding provider by name.

    Raises ``ValueError`` if *provider_name* is not recognised.
    """
    builder = _EMBEDDING_PROVIDERS.get(provider_name)
    if builder is None:
        supported = ", ".join(sorted(_EMBEDDING_PROVIDERS))
        raise ValueError(
            f"Unknown embedding provider '{provider_name}'. "
            f"Supported providers: {supported}"
        )
    return builder(settings)
