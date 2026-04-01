import { createContext, useContext, useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { themes, resolveTheme, getThemeById } from '../lib/themes'
import type { ThemeId, ThemePreference, ChartColors } from '../lib/themes'

const STORAGE_KEY = 'liker_theme'

interface ThemeState {
  theme: ThemePreference
  resolvedTheme: ThemeId
  setTheme: (t: ThemePreference) => void
  chartColors: ChartColors
  themes: typeof themes
}

const ThemeContext = createContext<ThemeState>({
  theme: 'system',
  resolvedTheme: 'warm',
  setTheme: () => {},
  chartColors: themes[0].chartColors,
  themes,
})

export function useTheme() {
  return useContext(ThemeContext)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [theme, setThemeState] = useState<ThemePreference>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && (stored === 'system' || themes.some(t => t.id === stored))) {
      return stored as ThemePreference
    }
    return 'system'
  })
  const [systemDark, setSystemDark] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )

  // Listen for system dark mode changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Load theme from Supabase when logged in (cloud preference overrides local)
  useEffect(() => {
    if (!user || !supabase) return
    supabase
      .from('profiles')
      .select('preferences')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        const cloudTheme = data?.preferences?.theme
        if (cloudTheme && (cloudTheme === 'system' || themes.some(t => t.id === cloudTheme))) {
          setThemeState(cloudTheme as ThemePreference)
          localStorage.setItem(STORAGE_KEY, cloudTheme)
        }
      })
  }, [user])

  // Apply data-theme attribute to <html>
  const resolved = resolveTheme(theme, systemDark)
  useEffect(() => {
    if (resolved === 'warm') {
      delete document.documentElement.dataset.theme
    } else {
      document.documentElement.dataset.theme = resolved
    }
  }, [resolved])

  function setTheme(t: ThemePreference) {
    setThemeState(t)
    localStorage.setItem(STORAGE_KEY, t)

    // Persist to Supabase if logged in
    if (user && supabase) {
      supabase
        .from('profiles')
        .update({ preferences: { theme: t } })
        .eq('id', user.id)
        .then(() => {})
    }
  }

  const chartColors = useMemo(() => getThemeById(resolved).chartColors, [resolved])

  return (
    <ThemeContext.Provider value={{
      theme,
      resolvedTheme: resolved,
      setTheme,
      chartColors,
      themes,
    }}>
      {children}
    </ThemeContext.Provider>
  )
}
