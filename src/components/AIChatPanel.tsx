import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useConversations } from '../hooks/useConversations'
import { createDataLayer } from '../data'

interface Props {
  onClose: () => void
  onAddItem?: (prefill: { title: string; description?: string; categoryId?: string }) => void
}

function formatRelativeTime(ts: number): string {
  const delta = Date.now() - ts
  if (delta < 60_000) return '刚刚'
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} 分钟前`
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} 小时前`
  if (delta < 7 * 86_400_000) return `${Math.floor(delta / 86_400_000)} 天前`
  const d = new Date(ts)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function AIChatPanel({ onClose, onAddItem }: Props) {
  const { session } = useAuth()
  const dataLayer = useMemo(() => createDataLayer(session), [session])
  const accessToken = session?.access_token ?? null

  const {
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
  } = useConversations(dataLayer, accessToken)

  const [input, setInput] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const dropdownWrapRef = useRef<HTMLDivElement>(null)

  const activeConversation = conversations.find(c => c.id === activeId) ?? null
  const titleText = activeConversation?.title ?? 'AI 助手'

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!dropdownOpen) return
    function onDocClick(e: MouseEvent) {
      if (!dropdownWrapRef.current) return
      if (!dropdownWrapRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
        setEditingId(null)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [dropdownOpen])

  async function handleSend(text?: string) {
    const message = text ?? input
    if (!message.trim() || streaming) return
    setInput('')
    await sendMessage(message)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  function handleNewConversation() {
    newConversation()
    setDropdownOpen(false)
    setEditingId(null)
  }

  function handleSelect(id: string) {
    if (id === activeId) {
      setDropdownOpen(false)
      return
    }
    void selectConversation(id)
    setDropdownOpen(false)
    setEditingId(null)
  }

  function startEdit(id: string, currentTitle: string) {
    setEditingId(id)
    setEditValue(currentTitle)
  }

  async function commitEdit(id: string) {
    const trimmed = editValue.trim()
    setEditingId(null)
    if (!trimmed) return
    const existing = conversations.find(c => c.id === id)
    if (!existing || existing.title === trimmed) return
    try {
      await renameConversation(id, trimmed)
    } catch {
      // Hook surfaces errors via console — keep UI quiet; user can retry
    }
  }

  async function handleDelete(id: string, title: string) {
    if (!window.confirm(`确认删除对话「${title}」？`)) return
    try {
      await deleteConversation(id)
    } catch {
      // ignore — Supabase errors propagate via hook
    }
  }

  const quickActions = [
    { label: '分析我的口味', query: '分析一下我的品味偏好' },
    { label: '推荐一部电影', query: '根据我的喜好推荐一部电影' },
    { label: '推荐一本书', query: '根据我的喜好推荐一本书' },
  ]

  const showWelcome = !activeId && messages.length === 0

  return (
    <div className="ai-chat-panel">
      <div className="ai-chat-header">
        <div className="ai-chat-title-wrap" ref={dropdownWrapRef}>
          <button
            className="ai-chat-title-btn"
            onClick={() => setDropdownOpen(v => !v)}
            disabled={!accessToken}
            aria-haspopup="listbox"
            aria-expanded={dropdownOpen}
          >
            <span className="ai-chat-title">{titleText}</span>
            <span className="ai-chat-title-caret">▾</span>
          </button>

          {dropdownOpen && (
            <div className="ai-chat-dropdown" role="listbox">
              <button
                className="ai-chat-dropdown-new"
                onClick={handleNewConversation}
              >
                + 新建会话
              </button>
              {conversations.length === 0 ? (
                <div className="ai-chat-dropdown-empty">暂无历史对话</div>
              ) : (
                <ul className="ai-chat-dropdown-list">
                  {conversations.map(c => (
                    <li
                      key={c.id}
                      className={`ai-chat-dropdown-item${c.id === activeId ? ' is-active' : ''}`}
                    >
                      {editingId === c.id ? (
                        <input
                          className="ai-chat-dropdown-edit"
                          autoFocus
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onBlur={() => void commitEdit(c.id)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              void commitEdit(c.id)
                            } else if (e.key === 'Escape') {
                              e.preventDefault()
                              setEditingId(null)
                            }
                          }}
                        />
                      ) : (
                        <button
                          className="ai-chat-dropdown-pick"
                          onClick={() => handleSelect(c.id)}
                        >
                          <span className="ai-chat-dropdown-title">{c.title}</span>
                          <span className="ai-chat-dropdown-time">
                            {formatRelativeTime(c.updatedAt)}
                          </span>
                        </button>
                      )}
                      {editingId !== c.id && (
                        <div className="ai-chat-dropdown-actions">
                          <button
                            className="ai-chat-dropdown-action"
                            title="重命名"
                            onClick={e => {
                              e.stopPropagation()
                              startEdit(c.id, c.title)
                            }}
                          >
                            ✎
                          </button>
                          <button
                            className="ai-chat-dropdown-action"
                            title="删除"
                            onClick={e => {
                              e.stopPropagation()
                              void handleDelete(c.id, c.title)
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <button className="ai-chat-close" onClick={onClose} aria-label="关闭">
          ×
        </button>
      </div>

      <div className="ai-chat-messages">
        {showWelcome && (
          <div className="ai-chat-welcome">
            <span className="ai-chat-welcome-icon">✦</span>
            <p>你好！我是你的 AI 品味助手。</p>
            <p>我可以分析你的收藏偏好、推荐新内容，或者聊聊你的品味。</p>
            <div className="ai-chat-quick-actions">
              {quickActions.map(action => (
                <button
                  key={action.query}
                  className="ai-chat-quick-btn"
                  onClick={() => void handleSend(action.query)}
                  disabled={!accessToken || streaming}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading && messages.length === 0 && !showWelcome && (
          <div className="ai-chat-welcome">加载中…</div>
        )}

        {messages.map((msg, i) => {
          const isLast = i === messages.length - 1
          const placeholder =
            streaming && isLast && msg.role === 'assistant' && !msg.content
              ? '思考中…'
              : ''
          return (
            <div key={i} className={`ai-chat-msg ai-chat-msg-${msg.role}`}>
              <div className="ai-chat-msg-content">{msg.content || placeholder}</div>
              {msg.role === 'assistant' &&
                msg.recommendations &&
                msg.recommendations.length > 0 && (
                  <div className="ai-chat-recs">
                    {msg.recommendations.map((rec, ri) => (
                      <div key={ri} className="ai-chat-rec-card">
                        {rec.coverUrl ? (
                          <img
                            className="ai-chat-rec-cover"
                            src={rec.coverUrl}
                            alt={rec.title}
                          />
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
                            onClick={() =>
                              onAddItem?.({
                                title: rec.title,
                                description: rec.description || '',
                              })
                            }
                          >
                            + 收藏
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          )
        })}

        {error && <div className="ai-chat-error">{error}</div>}

        <div ref={messagesEndRef} />
      </div>

      <div className="ai-chat-input-area">
        {!showWelcome && messages.length > 0 && (
          <div className="ai-chat-quick-actions ai-chat-quick-inline">
            {quickActions.map(action => (
              <button
                key={action.query}
                className="ai-chat-quick-btn"
                onClick={() => void handleSend(action.query)}
                disabled={streaming || !accessToken}
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
            placeholder={accessToken ? '输入你的问题…' : '请先登录后使用 AI 功能'}
            disabled={streaming || !accessToken}
          />
          <button
            className="ai-chat-send"
            onClick={() => void handleSend()}
            disabled={streaming || !input.trim() || !accessToken}
          >
            {streaming ? '···' : '→'}
          </button>
        </div>
      </div>
    </div>
  )
}
