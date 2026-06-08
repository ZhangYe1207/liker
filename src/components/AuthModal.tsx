import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

interface Props {
  onClose: () => void
}

export default function AuthModal({ onClose }: Props) {
  const { signIn, signUp, signInWithOAuth } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return

    setError('')
    setSuccess('')
    setLoading(true)

    const result = mode === 'login'
      ? await signIn(email.trim(), password)
      : await signUp(email.trim(), password)

    setLoading(false)

    if (result.error) {
      setError(result.error)
    } else if (mode === 'signup') {
      setSuccess('注册成功！请检查邮箱确认链接。')
    } else {
      onClose()
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal auth-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{mode === 'login' ? '登录' : '注册'}</h2>

        <div className="auth-tabs">
          <button
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => { setMode('login'); setError(''); setSuccess('') }}
          >
            登录
          </button>
          <button
            className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => { setMode('signup'); setError(''); setSuccess('') }}
          >
            注册
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="form-label">邮箱</label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoFocus
            required
          />

          <label className="form-label">密码</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'signup' ? '至少 6 位' : '请输入密码'}
            minLength={6}
            required
          />

          {error && <p className="auth-error">{error}</p>}
          {success && <p className="auth-success">{success}</p>}

          <div className="modal-actions">
            <button className="btn-secondary" type="button" onClick={onClose}>取消</button>
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? '处理中…' : mode === 'login' ? '登录' : '注册'}
            </button>
          </div>
        </form>

        <div className="auth-divider">
          <span>或</span>
        </div>

        <div className="auth-oauth">
          <button className="btn-oauth" onClick={() => signInWithOAuth('github')}>
            GitHub 登录
          </button>
          <button className="btn-oauth" onClick={() => signInWithOAuth('google')}>
            Google 登录
          </button>
        </div>
      </div>
    </div>
  )
}
