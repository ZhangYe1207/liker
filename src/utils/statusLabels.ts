import type { ItemStatus } from '../types'

// ── Media type detection (shared across metadata, recommend, status labels) ──

export type MediaType = 'book' | 'movie' | 'tv' | 'music' | 'game' | 'anime' | 'podcast' | 'unknown'

export function detectMediaType(name: string, icon: string): MediaType {
  const s = (name + icon).toLowerCase()
  if (/📖|📚|书|book|小说|novel|阅读|读/.test(s)) return 'book'
  if (/🎬|🎥|🍿|电影|movie|film/.test(s)) return 'movie'
  if (/📺|🎭|剧|tv|drama|series|动漫|番/.test(s)) return 'anime'
  if (/🎵|🎶|🎸|🎹|音乐|music|歌|专辑/.test(s)) return 'music'
  if (/🎮|🕹|游戏|game/.test(s)) return 'game'
  if (/🎙|podcast|播客/.test(s)) return 'podcast'
  return 'unknown'
}

// ── Status labels per media type ──

interface StatusLabel {
  label: string
  icon: string
  className: string
}

type StatusLabelMap = Record<ItemStatus, StatusLabel>

const ICONS: Record<ItemStatus, { icon: string; className: string }> = {
  want:        { icon: '🔖', className: 'status-want' },
  in_progress: { icon: '▶',  className: 'status-progress' },
  completed:   { icon: '✓',  className: 'status-completed' },
  dropped:     { icon: '✗',  className: 'status-dropped' },
}

const VERB_MAP: Record<string, Record<ItemStatus, string>> = {
  book:    { want: '想读', in_progress: '在读', completed: '读过', dropped: '搁置' },
  movie:   { want: '想看', in_progress: '在看', completed: '看过', dropped: '搁置' },
  tv:      { want: '想看', in_progress: '在看', completed: '看过', dropped: '搁置' },
  anime:   { want: '想看', in_progress: '在看', completed: '看过', dropped: '搁置' },
  music:   { want: '想听', in_progress: '在听', completed: '听过', dropped: '搁置' },
  game:    { want: '想玩', in_progress: '在玩', completed: '玩过', dropped: '搁置' },
  podcast: { want: '想听', in_progress: '在听', completed: '听过', dropped: '搁置' },
}

const DEFAULT_VERBS: Record<ItemStatus, string> = {
  want: '想要', in_progress: '进行中', completed: '完成', dropped: '搁置',
}

export function getStatusConfig(status: ItemStatus, mediaType?: MediaType): StatusLabel {
  const verbs = mediaType && VERB_MAP[mediaType] ? VERB_MAP[mediaType] : DEFAULT_VERBS
  const { icon, className } = ICONS[status]
  return { label: verbs[status], icon, className }
}

export function getStatusLabel(status: ItemStatus, mediaType?: MediaType): string {
  const config = getStatusConfig(status, mediaType)
  return config.label
}

/** All statuses with their labels for a given media type, useful for filter bars and selectors */
export function getStatusOptions(mediaType?: MediaType): { value: ItemStatus; label: string; icon: string }[] {
  const statuses: ItemStatus[] = ['completed', 'in_progress', 'want', 'dropped']
  return statuses.map(s => {
    const config = getStatusConfig(s, mediaType)
    return { value: s, label: config.label, icon: config.icon }
  })
}
