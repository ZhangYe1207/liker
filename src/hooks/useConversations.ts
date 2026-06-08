import { useCallback, useEffect, useRef, useState } from 'react'
import type { DataLayer } from '../data'
import type { Conversation } from '../types'
import {
  streamChat,
  streamSearch,
  type ChatMessage,
  type RecommendationItem,
} from '../services/ai'

interface UseConversationsResult {
  conversations: Conversation[]
  activeId: string | null
  messages: ChatMessage[]
  loading: boolean
  streaming: boolean
  error: string | null
  /** Load a conversation's messages and make it active. */
  selectConversation: (id: string) => Promise<void>
  /** Clear the active conversation and show the welcome state. */
  newConversation: () => void
  /** Send a user message (streams through /api/ai/chat or /api/ai/search). */
  sendMessage: (text: string) => Promise<void>
  /** Rename a conversation on the server + in local state. */
  renameConversation: (id: string, title: string) => Promise<void>
  /** Delete a conversation. If it was active, resets to the welcome state or
   *  the next most recent conversation. */
  deleteConversation: (id: string) => Promise<void>
}

function isSearchIntent(message: string): boolean {
  return (
    message.includes('推荐') ||
    message.includes('找') ||
    message.includes('搜索')
  )
}

export function useConversations(
  dataLayer: DataLayer,
  accessToken: string | null,
): UseConversationsResult {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Guard against concurrent sends / stale fetches when the user
  // switches conversations mid-stream.
  const streamingRef = useRef(false)

  const selectConversation = useCallback(
    async (id: string) => {
      setActiveId(id)
      setError(null)
      setLoading(true)
      try {
        const rows = await dataLayer.listMessages(id)
        setMessages(rows)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : '加载消息失败')
        setMessages([])
      } finally {
        setLoading(false)
      }
    },
    [dataLayer],
  )

  // Initial load: list conversations; select the most recent if any.
  useEffect(() => {
    if (!accessToken) {
      setConversations([])
      setActiveId(null)
      setMessages([])
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const list = await dataLayer.listConversations()
        if (cancelled) return
        setConversations(list)
        if (list.length > 0) {
          await selectConversation(list[0].id)
        } else {
          setActiveId(null)
          setMessages([])
        }
      } catch (err: unknown) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : '加载对话失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken, dataLayer, selectConversation])

  const newConversation = useCallback(() => {
    setActiveId(null)
    setMessages([])
    setError(null)
  }, [])

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || streamingRef.current) return
      if (!accessToken) {
        setError('请先登录后使用 AI 功能')
        return
      }
      streamingRef.current = true
      setStreaming(true)
      setError(null)

      // Optimistic user message + placeholder assistant message.
      setMessages(prev => [
        ...prev,
        { role: 'user', content: trimmed },
        { role: 'assistant', content: '' },
      ])

      const intentIsSearch = isSearchIntent(trimmed)
      const startingId = activeId
      let liveId = startingId
      let assistantContent = ''
      let assistantRecs: RecommendationItem[] | undefined

      try {
        const stream = intentIsSearch
          ? streamSearch(trimmed, accessToken, startingId)
          : streamChat(trimmed, accessToken, startingId)

        for await (const event of stream) {
          if (event.type === 'conversation') {
            liveId = event.id
            setActiveId(event.id)
            // Prepend an optimistic conversation row; the real title/timestamps
            // will be corrected on the next listConversations refresh.
            setConversations(prev => [
              {
                id: event.id,
                title: trimmed.slice(0, 20) || '新对话',
                createdAt: Date.now(),
                updatedAt: Date.now(),
              },
              ...prev,
            ])
          } else if (event.type === 'recommendations') {
            assistantRecs = event.items
            setMessages(prev => {
              const updated = [...prev]
              const last = updated[updated.length - 1]
              if (last && last.role === 'assistant') {
                updated[updated.length - 1] = {
                  ...last,
                  recommendations: event.items,
                }
              }
              return updated
            })
          } else if (event.type === 'content') {
            assistantContent += event.content || ''
            setMessages(prev => {
              const updated = [...prev]
              updated[updated.length - 1] = {
                role: 'assistant',
                content: assistantContent,
                recommendations: assistantRecs,
              }
              return updated
            })
            if (event.done) break
          }
        }

        // Bump the active conversation's updatedAt and re-sort so the just-used
        // one floats to the top.
        if (liveId) {
          setConversations(prev => {
            const idx = prev.findIndex(c => c.id === liveId)
            if (idx < 0) return prev
            const bumped = { ...prev[idx], updatedAt: Date.now() }
            const next = [bumped, ...prev.filter((_, i) => i !== idx)]
            return next
          })
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'AI 请求失败')
        // Drop the empty assistant placeholder on failure.
        setMessages(prev => prev.filter(m => !(m.role === 'assistant' && !m.content)))
      } finally {
        streamingRef.current = false
        setStreaming(false)
      }
    },
    [accessToken, activeId],
  )

  const renameConversation = useCallback(
    async (id: string, title: string) => {
      const cleaned = title.trim()
      if (!cleaned) return
      const updated = await dataLayer.renameConversation(id, cleaned)
      setConversations(prev =>
        prev.map(c => (c.id === id ? { ...c, title: updated.title } : c)),
      )
    },
    [dataLayer],
  )

  const deleteConversation = useCallback(
    async (id: string) => {
      await dataLayer.deleteConversation(id)
      setConversations(prev => {
        const next = prev.filter(c => c.id !== id)
        if (id === activeId) {
          // Active one was removed — pick the next most recent or reset.
          if (next.length > 0) {
            void selectConversation(next[0].id)
          } else {
            setActiveId(null)
            setMessages([])
          }
        }
        return next
      })
    },
    [activeId, dataLayer, selectConversation],
  )

  return {
    conversations,
    activeId,
    messages,
    loading,
    streaming,
    error,
    selectConversation,
    newConversation,
    sendMessage,
    renameConversation,
    deleteConversation,
  }
}
