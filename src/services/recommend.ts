// 书籍：Open Library（免费，无需 Key）
// 电影：TMDB（免费，需要 Key → https://www.themoviedb.org/settings/api）
// 音乐：iTunes Search API（免费，无需 Key）

export const TMDB_API_KEY = '' // ← 填入你的 TMDB API Key

export interface ExternalItem {
  externalId: string
  title: string
  subtitle?: string   // 作者 / 导演 / 艺术家
  description?: string
  coverUrl?: string
  year?: number
  source: string
}

function detectType(name: string, icon: string) {
  const s = (name + icon).toLowerCase()
  if (/📖|📚|书|book|小说|novel/.test(s)) return 'book'
  if (/🎬|🎥|🍿|电影|movie|film|剧/.test(s)) return 'movie'
  if (/🎵|🎶|🎸|🎹|音乐|music|歌|专辑/.test(s)) return 'music'
  return 'unknown'
}

async function searchBooks(query: string): Promise<ExternalItem[]> {
  const res = await fetch(
    `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&fields=key,title,author_name,first_publish_year,cover_i&limit=12`
  )
  const data = await res.json()
  return (data.docs ?? []).slice(0, 8).map((d: any) => ({
    externalId: d.key,
    title: d.title,
    subtitle: d.author_name?.[0],
    year: d.first_publish_year,
    coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : undefined,
    source: 'Open Library',
  }))
}

async function searchMovies(query: string): Promise<ExternalItem[]> {
  if (!TMDB_API_KEY) return []
  const res = await fetch(
    `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=zh-CN&include_adult=false`
  )
  const data = await res.json()
  return (data.results ?? []).slice(0, 8).map((m: any) => ({
    externalId: String(m.id),
    title: m.title,
    subtitle: m.original_title !== m.title ? m.original_title : undefined,
    description: m.overview,
    coverUrl: m.poster_path ? `https://image.tmdb.org/t/p/w200${m.poster_path}` : undefined,
    year: m.release_date ? +m.release_date.slice(0, 4) : undefined,
    source: 'TMDB',
  }))
}

async function searchMusic(query: string): Promise<ExternalItem[]> {
  const res = await fetch(
    `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=album&limit=12`
  )
  const data = await res.json()
  return (data.results ?? []).slice(0, 8).map((a: any) => ({
    externalId: String(a.collectionId),
    title: a.collectionName,
    subtitle: a.artistName,
    year: a.releaseDate ? +a.releaseDate.slice(0, 4) : undefined,
    coverUrl: a.artworkUrl100?.replace('100x100bb', '300x300bb'),
    source: 'iTunes',
  }))
}

export function needsTmdbKey(name: string, icon: string): boolean {
  return detectType(name, icon) === 'movie' && !TMDB_API_KEY
}

export async function fetchRecs(
  categoryName: string,
  categoryIcon: string,
  seedTitles: string[],
): Promise<ExternalItem[]> {
  const type = detectType(categoryName, categoryIcon)
  const query = seedTitles[0] ?? categoryName
  switch (type) {
    case 'book':  return searchBooks(query)
    case 'movie': return searchMovies(query)
    case 'music': return searchMusic(query)
    default:      return []
  }
}
