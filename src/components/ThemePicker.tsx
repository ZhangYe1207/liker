import { useEffect, useRef } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import type { ThemePreference } from '../lib/themes'

interface Props {
  onClose: () => void
}

export default function ThemePicker({ onClose }: Props) {
  const { theme, resolvedTheme, setTheme, themes } = useTheme()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  function handleSelect(id: ThemePreference) {
    setTheme(id)
    onClose()
  }

  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches

  return (
    <div className="theme-picker" ref={ref}>
      <div className="theme-picker-title">主题</div>
      <div className="theme-picker-list">
        {/* System option */}
        <button
          className={`theme-picker-item${theme === 'system' ? ' active' : ''}`}
          onClick={() => handleSelect('system')}
        >
          <span className="theme-picker-previews">
            <span className="theme-preview-dot" style={{ background: '#f3f1ed' }} />
            <span className="theme-preview-dot" style={{ background: '#16141f' }} />
          </span>
          <span className="theme-picker-name">跟随系统</span>
          <span className="theme-picker-hint">
            {systemDark ? '当前：深色' : '当前：浅色'}
          </span>
        </button>

        {themes.map(t => (
          <button
            key={t.id}
            className={`theme-picker-item${theme === t.id ? ' active' : ''}`}
            onClick={() => handleSelect(t.id)}
          >
            <span className="theme-picker-previews">
              {t.previewColors.map((c, i) => (
                <span key={i} className="theme-preview-dot" style={{ background: c }} />
              ))}
            </span>
            <span className="theme-picker-name">{t.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
