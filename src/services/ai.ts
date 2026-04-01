const AI_BASE_URL = import.meta.env.VITE_AI_BACKEND_URL || 'http://localhost:8000'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
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

export async function* streamChat(
  message: string,
  token: string
): AsyncGenerator<{ content: string; done: boolean }> {
  const response = await fetch(`${AI_BASE_URL}/api/ai/chat`, {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify({ message, stream: true }),
  })

  if (!response.ok) {
    throw new Error(`AI chat request failed: ${response.status}`)
  }

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6))
        yield data
        if (data.done) return
      }
    }
  }
}

export async function* streamSearch(
  query: string,
  token: string
): AsyncGenerator<{ type: string; content?: string; done?: boolean; items?: RecommendationItem[] }> {
  const response = await fetch(`${AI_BASE_URL}/api/ai/search`, {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify({ query, stream: true }),
  })

  if (!response.ok) {
    throw new Error(`AI search request failed: ${response.status}`)
  }

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6))
        yield data
      }
    }
  }
}
