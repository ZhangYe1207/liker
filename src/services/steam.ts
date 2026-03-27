const CORS_PROXY = 'https://api.allorigins.win/raw?url='

export interface SteamGame {
  appid: number
  name: string
  playtime_forever: number // minutes
  img_icon_url: string
}

export interface SteamConfig {
  apiKey: string
  steamId: string
  proxyUrl?: string
}

const STORAGE_KEY = 'liker_steam_config'

export function loadSteamConfig(): SteamConfig | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function saveSteamConfig(config: SteamConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export async function fetchOwnedGames(config: SteamConfig): Promise<SteamGame[]> {
  const proxy = config.proxyUrl?.trim() || CORS_PROXY
  const apiUrl = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${config.apiKey}&steamid=${config.steamId}&include_appinfo=true&include_played_free_games=true&format=json`
  const url = proxy + encodeURIComponent(apiUrl)

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Steam API 请求失败 (${res.status})`)

  const data = await res.json()
  const games: SteamGame[] = data?.response?.games ?? []
  return games.sort((a, b) => b.playtime_forever - a.playtime_forever)
}

export function formatPlaytime(minutes: number): string {
  if (minutes === 0) return '尚未游玩'
  if (minutes < 60) return `已游玩 ${minutes} 分钟`
  return `已游玩 ${(minutes / 60).toFixed(1)} 小时`
}
