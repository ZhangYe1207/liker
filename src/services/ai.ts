const AI_BASE_URL = import.meta.env.VITE_AI_BACKEND_URL || 'http://localhost:8000'

interface ChatMessage {
  /** Stable id when the message has been persisted to the backend. */
  id?: string
  role: 'user' | 'assistant'
  content: string
  /** Only ever present on assistant messages from /api/ai/search. */
  recommendations?: RecommendationItem[]
}

interface RecommendationItem {
  title: string
  description: string
  year?: string
  coverUrl?: string
  genre?: string
  source: string
  externalId: string
}

interface SearchResult {
  response: { content: string }
  recommendations: RecommendationItem[]
}

export type { ChatMessage, RecommendationItem, SearchResult }

function getAuthHeaders(token: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

export type AIStreamEvent =
  | { type: 'conversation'; id: string }
  | { type: 'recommendations'; items: RecommendationItem[] }
  | { type: 'content'; content: string; done: boolean }
  | { type: 'error'; code?: string; message: string }

export async function* streamChat(
  message: string,
  token: string,
  conversationId: string | null = null,
  signal?: AbortSignal,
): AsyncGenerator<AIStreamEvent> {
  const response = await fetch(`${AI_BASE_URL}/api/ai/chat`, {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify({
      message,
      stream: true,
      conversation_id: conversationId,
    }),
    signal,
  })

  if (!response.ok) {
    throw new Error(`AI chat request failed: ${response.status}`)
  }

  for await (const event of parseSSE<AIStreamEvent>(response, signal)) {
    yield event
    if (event.type === 'content' && event.done) return
    if (event.type === 'error') return
  }
}

export interface EmbeddingSyncStats {
  total: number
  updated: number
  skipped: number
}

export async function syncEmbeddings(token: string): Promise<EmbeddingSyncStats> {
  const response = await fetch(`${AI_BASE_URL}/api/embeddings/sync`, {
    method: 'POST',
    headers: getAuthHeaders(token),
  })
  if (!response.ok) {
    throw new Error(`Embedding sync failed: ${response.status}`)
  }
  const json = await response.json()
  return json.data as EmbeddingSyncStats
}

export async function* streamSearch(
  query: string,
  token: string,
  conversationId: string | null = null,
  signal?: AbortSignal,
): AsyncGenerator<AIStreamEvent> {
  const response = await fetch(`${AI_BASE_URL}/api/ai/search`, {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify({
      query,
      stream: true,
      conversation_id: conversationId,
    }),
    signal,
  })

  if (!response.ok) {
    throw new Error(`AI search request failed: ${response.status}`)
  }

  for await (const event of parseSSE<AIStreamEvent>(response, signal)) {
    yield event
    if (event.type === 'content' && event.done) return
    if (event.type === 'error') return
  }
}

async function* parseSSE<T>(
  response: Response,
  signal?: AbortSignal,
): AsyncGenerator<T> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      if (signal?.aborted) return
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          yield JSON.parse(line.slice(6)) as T
        }
      }
    }
  } finally {
    // Best-effort cancel so the underlying network stream releases promptly
    // when the consumer aborts (or throws).
    void reader.cancel().catch(() => {})
  }
}
