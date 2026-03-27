// Unified metadata search: NeoDB (primary), Bangumi (anime/manga fallback)
// IGDB via Edge Function (games fallback, Unit 7)

export interface MetadataResult {
  externalId: string
  title: string
  description?: string
  coverUrl?: string
  year?: string
  genre?: string
  source: 'neodb' | 'bangumi' | 'igdb' | 'tmdb' | 'manual'
}

// ── Category detection (reused from recommend.ts pattern) ──

type MediaCategory = 'book' | 'movie' | 'tv' | 'music' | 'game' | 'anime' | 'podcast' | 'unknown'

const NEODB_CATEGORY_MAP: Record<string, string> = {
  book: 'book',
  movie: 'movie',
  tv: 'tv',
  music: 'music',
  game: 'game',
  anime: 'movie',
  podcast: 'podcast',
}

function detectCategory(name: string, icon: string): MediaCategory {
  const s = (name + icon).toLowerCase()
  if (/📖|📚|书|book|小说|novel|阅读|读/.test(s)) return 'book'
  if (/🎬|🎥|🍿|电影|movie|film/.test(s)) return 'movie'
  if (/📺|🎭|剧|tv|drama|series|动漫|番/.test(s)) return 'anime'
  if (/🎵|🎶|🎸|🎹|音乐|music|歌|专辑/.test(s)) return 'music'
  if (/🎮|🕹|游戏|game/.test(s)) return 'game'
  if (/🎙|podcast|播客/.test(s)) return 'podcast'
  return 'unknown'
}

// ── NeoDB search (no auth required) ──

async function searchNeoDB(query: string, category?: string): Promise<MetadataResult[]> {
  const params = new URLSearchParams({ query })
  if (category) params.set('category', category)

  const res = await fetch(`https://neodb.social/api/catalog/search?${params}`)
  if (!res.ok) return []

  const data = await res.json()
  const items: any[] = data.data ?? []

  return items.slice(0, 10).map((item: any) => ({
    externalId: item.id ?? item.uuid ?? '',
    title: item.display_title ?? item.title ?? '',
    description: item.brief ?? item.description ?? '',
    coverUrl: item.cover_image_url ?? undefined,
    year: extractYear(item.date ?? item.pub_date ?? item.air_date ?? ''),
    genre: Array.isArray(item.genre) ? item.genre.slice(0, 3).join(', ') : undefined,
    source: 'neodb' as const,
  }))
}

// ── Bangumi search (anime/manga fallback) ──

const BANGUMI_TYPE_MAP: Record<string, number> = {
  anime: 2,  // 动画
  book: 1,   // 书籍
  game: 4,   // 游戏
  music: 3,  // 音乐
}

async function searchBangumi(query: string, mediaCategory: MediaCategory): Promise<MetadataResult[]> {
  const subjectType = BANGUMI_TYPE_MAP[mediaCategory]
  if (subjectType === undefined) return []

  const res = await fetch('https://api.bgm.tv/v0/search/subjects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Liker/1.0 (https://github.com/liker-app)',
    },
    body: JSON.stringify({
      keyword: query,
      filter: { type: [subjectType] },
    }),
  })

  if (!res.ok) return []

  const data = await res.json()
  const items: any[] = data.data ?? []

  return items.slice(0, 10).map((item: any) => ({
    externalId: String(item.id),
    title: item.name_cn || item.name || '',
    description: item.summary ?? '',
    coverUrl: item.images?.common ?? item.images?.medium ?? undefined,
    year: extractYear(item.date ?? ''),
    genre: Array.isArray(item.tags) ? item.tags.slice(0, 3).map((t: any) => t.name).join(', ') : undefined,
    source: 'bangumi' as const,
  }))
}

// ── Helpers ──

function extractYear(dateStr: string): string | undefined {
  const match = dateStr.match(/(\d{4})/)
  return match?.[1]
}

// ── Unified search dispatcher ──

export async function searchMetadata(
  query: string,
  categoryName: string,
  categoryIcon: string,
): Promise<MetadataResult[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const mediaCategory = detectCategory(categoryName, categoryIcon)
  const neodbCategory = NEODB_CATEGORY_MAP[mediaCategory]

  // Primary: NeoDB
  let results = await searchNeoDB(trimmed, neodbCategory).catch(() => [] as MetadataResult[])

  // Fallback: Bangumi for anime/manga/game if NeoDB results are sparse
  if (results.length < 3 && (mediaCategory === 'anime' || mediaCategory === 'game')) {
    const bangumiResults = await searchBangumi(trimmed, mediaCategory).catch(() => [] as MetadataResult[])
    // Merge, dedup by title
    const seen = new Set(results.map(r => r.title.toLowerCase()))
    for (const r of bangumiResults) {
      if (!seen.has(r.title.toLowerCase())) {
        results.push(r)
        seen.add(r.title.toLowerCase())
      }
    }
  }

  return results.slice(0, 10)
}
