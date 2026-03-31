export type ThemeId = 'warm' | 'midnight' | 'frost' | 'sakura' | 'forest'
export type ThemePreference = ThemeId | 'system'

export interface ChartColors {
  tooltipBg: string
  tooltipBorder: string
  axisText: string
  gradientStart: string
  gradientEnd: string
  gradientStartAlpha: string
  gradientEndAlpha: string
}

export interface ThemeDefinition {
  id: ThemeId
  name: string
  previewColors: [string, string, string]
  chartColors: ChartColors
}

export const themes: ThemeDefinition[] = [
  {
    id: 'warm',
    name: '暖光',
    previewColors: ['#f3f1ed', '#ff6b6b', '#a855f7'],
    chartColors: {
      tooltipBg: '#fff',
      tooltipBorder: 'rgba(0,0,0,0.08)',
      axisText: '#9993a8',
      gradientStart: '#ff6b6b',
      gradientEnd: '#a855f7',
      gradientStartAlpha: 'rgba(255,107,107,0.3)',
      gradientEndAlpha: 'rgba(168,85,247,0.3)',
    },
  },
  {
    id: 'midnight',
    name: '深空',
    previewColors: ['#16141f', '#c084fc', '#818cf8'],
    chartColors: {
      tooltipBg: '#1e1b2e',
      tooltipBorder: 'rgba(255,255,255,0.1)',
      axisText: '#7c7891',
      gradientStart: '#c084fc',
      gradientEnd: '#818cf8',
      gradientStartAlpha: 'rgba(192,132,252,0.25)',
      gradientEndAlpha: 'rgba(129,140,248,0.25)',
    },
  },
  {
    id: 'frost',
    name: '淡雅',
    previewColors: ['#f0f4f8', '#64748b', '#6366f1'],
    chartColors: {
      tooltipBg: '#fff',
      tooltipBorder: 'rgba(0,0,0,0.06)',
      axisText: '#94a3b8',
      gradientStart: '#6366f1',
      gradientEnd: '#8b5cf6',
      gradientStartAlpha: 'rgba(99,102,241,0.25)',
      gradientEndAlpha: 'rgba(139,92,246,0.25)',
    },
  },
  {
    id: 'sakura',
    name: '樱花',
    previewColors: ['#fdf2f8', '#ec4899', '#f472b6'],
    chartColors: {
      tooltipBg: '#fff',
      tooltipBorder: 'rgba(0,0,0,0.06)',
      axisText: '#a8899e',
      gradientStart: '#ec4899',
      gradientEnd: '#f472b6',
      gradientStartAlpha: 'rgba(236,72,153,0.25)',
      gradientEndAlpha: 'rgba(244,114,182,0.25)',
    },
  },
  {
    id: 'forest',
    name: '森林',
    previewColors: ['#f0f5f0', '#059669', '#10b981'],
    chartColors: {
      tooltipBg: '#fff',
      tooltipBorder: 'rgba(0,0,0,0.06)',
      axisText: '#8a9a8e',
      gradientStart: '#059669',
      gradientEnd: '#10b981',
      gradientStartAlpha: 'rgba(5,150,105,0.25)',
      gradientEndAlpha: 'rgba(16,185,129,0.25)',
    },
  },
]

export function getThemeById(id: ThemeId): ThemeDefinition {
  return themes.find(t => t.id === id) ?? themes[0]
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ThemeId {
  if (preference === 'system') return systemDark ? 'midnight' : 'warm'
  return preference
}
