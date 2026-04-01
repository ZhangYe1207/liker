"""Multi-provider LLM abstraction layer.

Re-exports the factory functions and protocol types for convenient access::

    from app.llm import create_chat_provider, create_embedding_provider
"""

from app.llm.factory import create_chat_provider, create_embedding_provider
from app.llm.protocols import ChatProvider, EmbeddingProvider

__all__ = [
    "ChatProvider",
    "EmbeddingProvider",
    "create_chat_provider",
    "create_embedding_provider",
]
