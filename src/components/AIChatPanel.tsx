import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { streamChat, streamSearch, type ChatMessage, type RecommendationItem } from '../services/ai'

interface Props {
  onClose: () => void
  onAddItem?: (prefill: { title: string; description?: string; categoryId?: string }) => void
}

export default function AIChatPanel({ onClose, onAddItem }: Props) {
  const { session } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend(text?: string) {
    const message = text || input.trim()
    if (!message || loading) return
    if (!session?.access_token) {
      setError('请先登录后使用 AI 功能')
      return
    }

    setInput('')
    setError(null)
    setRecommendations([])
    setMessages(prev => [...prev, { role: 'user', content: message }])
    setLoading(true)

    // Determine if this is a search/recommendation or a chat query
    const isSearch = message.includes('推荐') || message.includes('找') || message.includes('搜索')

    try {
      let assistantContent = ''
      setMessages(prev => [...prev, { role: 'assistant', content: '' }])

      if (isSearch) {
        for await (const chunk of streamSearch(message, session.access_token)) {
          if (chunk.type === 'recommendations' && chunk.items) {
            setRecommendations(chunk.items)
          } else if (chunk.type === 'content') {
            assistantContent += chunk.content || ''
            setMessages(prev => {
              const updated = [...prev]
              updated[updated.length - 1] = { role: 'assistant', content: assistantContent }
              return updated
            })
          }
        }
      } else {
        for await (const chunk of streamChat(message, session.access_token)) {
          assistantContent += chunk.content || ''
          setMessages(prev => {
            const updated = [...prev]
            updated[updated.length - 1] = { role: 'assistant', content: assistantContent }
            return updated
          })
          if (chunk.done) break
        }
      }
    } catch (err: any) {
      setError(err.message || 'AI 请求失败，请稍后重试')
      // Remove the empty assistant message on error
      setMessages(prev => prev.filter(m => m.content !== ''))
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const quickActions = [
    { label: '分析我的口味', query: '分析一下我的品味偏好' },
    { label: '推荐一部电影', query: '根据我的喜好推荐一部电影' },
    { label: '推荐一本书', query: '根据我的喜好推荐一本书' },
  ]

  return (
    <div className="ai-chat-panel">
      <div className="ai-chat-header">
        <h2 className="ai-chat-title">AI 助手</h2>
        <button className="ai-chat-close" onClick={onClose}>×</button>
      </div>

      <div className="ai-chat-messages">
        {messages.length === 0 && (
          <div className="ai-chat-welcome">
            <span className="ai-chat-welcome-icon">✦</span>
            <p>你好！我是你的 AI 品味助手。</p>
            <p>我可以分析你的收藏偏好、推荐新内容，或者聊聊你的品味。</p>
            <div className="ai-chat-quick-actions">
              {quickActions.map(action => (
                <button
                  key={action.query}
                  className="ai-chat-quick-btn"
                  onClick={() => handleSend(action.query)}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`ai-chat-msg ai-chat-msg-${msg.role}`}>
            <div className="ai-chat-msg-content">
              {msg.content || (loading && i === messages.length - 1 ? '思考中…' : '')}
            </div>
          </div>
        ))}

        {recommendations.length > 0 && (
          <div className="ai-chat-recs">
            {recommendations.map((rec, i) => (
              <div key={i} className="ai-chat-rec-card">
                {rec.coverUrl ? (
                  <img className="ai-chat-rec-cover" src={rec.coverUrl} alt={rec.title} />
                ) : (
                  <div className="ai-chat-rec-cover ai-chat-rec-cover-empty">?</div>
                )}
                <div className="ai-chat-rec-info">
                  <div className="ai-chat-rec-title">{rec.title}</div>
                  {rec.year && <span className="ai-chat-rec-year">{rec.year}</span>}
                  {rec.description && (
                    <div className="ai-chat-rec-desc">{rec.description}</div>
                  )}
                  <button
                    className="ai-chat-rec-add"
                    onClick={() => onAddItem?.({
                      title: rec.title,
                      description: rec.description || '',
                    })}
                  >
                    + 收藏
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="ai-chat-error">{error}</div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="ai-chat-input-area">
        {messages.length > 0 && (
          <div className="ai-chat-quick-actions ai-chat-quick-inline">
            {quickActions.map(action => (
              <button
                key={action.query}
                className="ai-chat-quick-btn"
                onClick={() => handleSend(action.query)}
                disabled={loading}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
        <div className="ai-chat-input-row">
          <input
            className="ai-chat-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的问题…"
            disabled={loading}
          />
          <button
            className="ai-chat-send"
            onClick={() => handleSend()}
            disabled={loading || !input.trim()}
          >
            {loading ? '···' : '→'}
          </button>
        </div>
      </div>
    </div>
  )
}
