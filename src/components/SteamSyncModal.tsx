import { useState, useEffect } from 'react'
import type { Item, Category } from '../types'
import {
  loadSteamConfig,
  saveSteamConfig,
  fetchOwnedGames,
  formatPlaytime,
  type SteamConfig,
  type SteamGame,
} from '../services/steam'

interface Props {
  items: Item[]
  categories: Category[]
  onSync: (newItems: Omit<Item, 'id' | 'createdAt'>[], categoryId: string) => void
  onAddCategory: (name: string, icon: string) => string
  onClose: () => void
}

type Step = 'config' | 'syncing' | 'result'

export default function SteamSyncModal({ items, categories, onSync, onAddCategory, onClose }: Props) {
  const saved = loadSteamConfig()
  const [apiKey, setApiKey] = useState(saved?.apiKey ?? '')
  const [steamId, setSteamId] = useState(saved?.steamId ?? '')
  const [proxyUrl, setProxyUrl] = useState(saved?.proxyUrl ?? '')
  const [showProxy, setShowProxy] = useState(!!saved?.proxyUrl)
  const [step, setStep] = useState<Step>('config')
  const [error, setError] = useState('')
  const [result, setResult] = useState({ added: 0, skipped: 0 })

  async function handleSync() {
    if (!apiKey.trim() || !steamId.trim()) return
    const config: SteamConfig = {
      apiKey: apiKey.trim(),
      steamId: steamId.trim(),
      proxyUrl: proxyUrl.trim() || undefined,
    }
    saveSteamConfig(config)
    setStep('syncing')
    setError('')

    try {
      const games = await fetchOwnedGames(config)

      // Find or create game category
      let gameCat = categories.find(
        (c) => /🎮|游戏|game/i.test(c.name + c.icon)
      )
      let catId: string
      if (gameCat) {
        catId = gameCat.id
      } else {
        catId = onAddCategory('游戏', '🎮')
      }

      // Filter out existing games
      const existingTitles = new Set(
        items
          .filter((i) => i.categoryId === catId)
          .map((i) => i.title.toLowerCase())
      )

      const newGames: Omit<Item, 'id' | 'createdAt'>[] = []
      let skipped = 0

      for (const game of games) {
        if (existingTitles.has(game.name.toLowerCase())) {
          skipped++
          continue
        }
        newGames.push({
          title: game.name,
          description: formatPlaytime(game.playtime_forever),
          rating: 0,
          categoryId: catId,
        })
      }

      onSync(newGames, catId)
      setResult({ added: newGames.length, skipped })
      setStep('result')
    } catch (e: any) {
      setError(e.message || '同步失败，请检查配置')
      setStep('config')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">
          <span style={{ marginRight: 8 }}>🎮</span>
          Steam 游戏同步
        </h2>

        {step === 'config' && (
          <>
            {error && <div className="steam-error">{error}</div>}

            <label className="form-label">Steam API Key *</label>
            <input
              className="input"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="请输入 Steam API Key"
              autoFocus
            />
            <a
              className="steam-help-link"
              href="https://steamcommunity.com/dev/apikey"
              target="_blank"
              rel="noreferrer"
            >
              免费申请 API Key →
            </a>

            <label className="form-label">Steam ID *</label>
            <input
              className="input"
              value={steamId}
              onChange={(e) => setSteamId(e.target.value)}
              placeholder="17位数字 Steam ID"
            />
            <p className="steam-help-text">
              在 Steam 个人资料页 URL 中查看，如 steamcommunity.com/profiles/<b>76561198xxxxxxxx</b>
            </p>

            <button
              className="steam-proxy-toggle"
              onClick={() => setShowProxy(!showProxy)}
            >
              {showProxy ? '▾' : '▸'} 高级设置
            </button>

            {showProxy && (
              <>
                <label className="form-label">CORS 代理 URL（可选）</label>
                <input
                  className="input"
                  value={proxyUrl}
                  onChange={(e) => setProxyUrl(e.target.value)}
                  placeholder="默认使用 api.allorigins.win"
                />
              </>
            )}

            <div className="modal-actions">
              <button className="btn-secondary" onClick={onClose}>取消</button>
              <button
                className="btn-primary"
                onClick={handleSync}
                disabled={!apiKey.trim() || !steamId.trim()}
              >
                开始同步
              </button>
            </div>
          </>
        )}

        {step === 'syncing' && (
          <div className="steam-syncing">
            <div className="rec-loading">
              <span className="rec-dot" />
              <span className="rec-dot" />
              <span className="rec-dot" />
            </div>
            <p>正在从 Steam 获取游戏列表…</p>
          </div>
        )}

        {step === 'result' && (
          <div className="steam-result">
            <div className="steam-result-icon">✓</div>
            <p className="steam-result-text">
              同步完成！新增 <b>{result.added}</b> 款游戏
              {result.skipped > 0 && `，跳过 ${result.skipped} 款已存在`}
            </p>
            <div className="modal-actions">
              <button className="btn-primary" onClick={onClose}>完成</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
