import { createContext, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { syncEmbeddings } from '../services/ai'

async function maybeAutoSyncEmbeddings(session: Session) {
  const flagKey = `embeddings_synced_${session.user.id}`
  if (sessionStorage.getItem(flagKey)) return
  sessionStorage.setItem(flagKey, '1')
  try {
    const stats = await syncEmbeddings(session.access_token)
    console.log('[embeddings] auto-sync done:', stats)
  } catch (err) {
    console.warn('[embeddings] auto-sync failed:', err)
    sessionStorage.removeItem(flagKey)
  }
}

interface AuthState {
  session: Session | null
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signUp: (email: string, password: string) => Promise<{ error?: string }>
  signInWithOAuth: (provider: 'github' | 'google') => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  loading: true,
  signIn: async () => ({}),
  signUp: async () => ({}),
  signInWithOAuth: async () => {},
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
      if (session) void maybeAutoSyncEmbeddings(session)
    }).catch(() => {
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      if (event === 'SIGNED_IN' && session) void maybeAutoSyncEmbeddings(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string) {
    if (!supabase) return { error: 'Supabase 未配置' }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? { error: error.message } : {}
  }

  async function signUp(email: string, password: string) {
    if (!supabase) return { error: 'Supabase 未配置' }
    const { error } = await supabase.auth.signUp({ email, password })
    return error ? { error: error.message } : {}
  }

  async function signInWithOAuth(provider: 'github' | 'google') {
    if (!supabase) return
    await supabase.auth.signInWithOAuth({ provider })
  }

  async function signOut() {
    if (!supabase) return
    await supabase.auth.signOut()
    setSession(null)
  }

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      loading,
      signIn,
      signUp,
      signInWithOAuth,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}
