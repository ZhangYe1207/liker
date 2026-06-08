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
  // Holds the in-flight stream's AbortController. Aborted on
  // selectConversation / newConversation / deleteConversation / unmount
  // so the SSE reader stops yielding into a now-stale view.
  const streamControllerRef = useRef<AbortController | null>(null)
  // Mirrors activeId so SSE event handlers can compare *liveId* against the
  // currently-rendered conversation without going through React state.
  const activeIdRef = useRef<string | null>(null)
  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  const abortInFlightStream = useCallback(() => {
    const controller = streamControllerRef.current
    if (controller && !controller.signal.aborted) {
      controller.abort()
    }
    streamControllerRef.current = null
  }, [])

  const selectConversation = useCallback(
    async (id: string) => {
      // Switching conversations cancels any in-flight stream so its tokens
      // don't bleed into the newly-loaded message list.
      abortInFlightStream()
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
    [abortInFlightStream, dataLayer],
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
      // Tear down any in-flight stream when the panel unmounts or the
      // accessToken/dataLayer changes (e.g. user signs out).
      abortInFlightStream()
    }
  }, [abortInFlightStream, accessToken, dataLayer, selectConversation])

  const newConversation = useCallback(() => {
    abortInFlightStream()
    setActiveId(null)
    setMessages([])
    setError(null)
  }, [abortInFlightStream])

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

      const controller = new AbortController()
      streamControllerRef.current = controller
      const { signal } = controller

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
      let streamErrorMessage: string | null = null

      // Guard SSE-driven setMessages so a late chunk after the user switched
      // conversations doesn't corrupt the now-active view. liveId tracks the
      // conversation this stream is bound to; activeIdRef tracks the UI's
      // currently-displayed one.
      const isStreamStillActive = () =>
        !signal.aborted && liveId === activeIdRef.current

      try {
        const stream = intentIsSearch
          ? streamSearch(trimmed, accessToken, startingId, signal)
          : streamChat(trimmed, accessToken, startingId, signal)

        for await (const event of stream) {
          if (signal.aborted) break

          if (event.type === 'conversation') {
            liveId = event.id
            activeIdRef.current = event.id
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
            if (!isStreamStillActive()) continue
            setMessages(prev => {
              if (liveId !== activeIdRef.current) return prev
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
            if (isStreamStillActive()) {
              setMessages(prev => {
                if (liveId !== activeIdRef.current) return prev
                const updated = [...prev]
                updated[updated.length - 1] = {
                  role: 'assistant',
                  content: assistantContent,
                  recommendations: assistantRecs,
                }
                return updated
              })
            }
            if (event.done) break
          } else if (event.type === 'error') {
            // Backend signaled mid-stream failure. Surface the message and
            // stop processing — backend has already persisted whatever it
            // could (user message + sentinel assistant turn).
            streamErrorMessage = event.message || 'AI 请求失败'
            break
          }
        }

        // Bump the active conversation's updatedAt and re-sort so the just-used
        // one floats to the top. Skip if the user switched away (liveId no
        // longer matches what's on screen) — listConversations will reconcile.
        if (liveId && !signal.aborted) {
          setConversations(prev => {
            const idx = prev.findIndex(c => c.id === liveId)
            if (idx < 0) return prev
            const bumped = { ...prev[idx], updatedAt: Date.now() }
            const next = [bumped, ...prev.filter((_, i) => i !== idx)]
            return next
          })
        }

        if (streamErrorMessage && isStreamStillActive()) {
          setError(streamErrorMessage)
          // Drop only the trailing placeholder (avoid touching empty
          // assistant turns deeper in history).
          setMessages(prev => {
            if (liveId !== activeIdRef.current) return prev
            const last = prev[prev.length - 1]
            if (last && last.role === 'assistant' && !last.content) {
              return prev.slice(0, -1)
            }
            return prev
          })
        }
      } catch (err: unknown) {
        // Aborted by selectConversation/newConversation/deleteConversation/unmount —
        // intentional, user has already moved on. Don't pollute their view.
        if (signal.aborted) return
        if (!isStreamStillActive()) return
        setError(err instanceof Error ? err.message : 'AI 请求失败')
        setMessages(prev => {
          if (liveId !== activeIdRef.current) return prev
          const last = prev[prev.length - 1]
          if (last && last.role === 'assistant' && !last.content) {
            return prev.slice(0, -1)
          }
          return prev
        })
      } finally {
        streamingRef.current = false
        setStreaming(false)
        if (streamControllerRef.current === controller) {
          streamControllerRef.current = null
        }
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
      // Abort any in-flight stream first — without this, a stream that was
      // writing to the row we're about to delete will trip the FK and 500.
      if (id === activeIdRef.current) {
        abortInFlightStream()
      }
      await dataLayer.deleteConversation(id)
      setConversations(prev => prev.filter(c => c.id !== id))
      if (id === activeIdRef.current) {
        // Active one was removed — pick the next most recent (post-delete)
        // or reset to the welcome state.
        const remaining = conversations.filter(c => c.id !== id)
        if (remaining.length > 0) {
          void selectConversation(remaining[0].id)
        } else {
          setActiveId(null)
          setMessages([])
        }
      }
    },
    [abortInFlightStream, conversations, dataLayer, selectConversation],
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
