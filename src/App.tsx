import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import type { Item, Category, LogbookEntry, ItemStatus } from './types'
import { createDataLayer, type DataLayer } from './data'
import { shouldMigrate, migrateToSupabase } from './data/migration'
import { supabase } from './lib/supabase'
import { useAuth } from './contexts/AuthContext'
import CategorySection from './components/CategorySection'
import AddEditModal from './components/AddEditModal'
import AuthModal from './components/AuthModal'
import SteamSyncModal from './components/SteamSyncModal'
import LogbookView from './components/LogbookView'
import StatsView from './components/StatsView'
import { computeTimeline } from './utils/stats'
import { ResponsiveContainer, AreaChart, Area } from 'recharts'
import { fetchRecs, needsTmdbKey } from './services/recommend'
import type { ExternalItem } from './services/recommend'
import { detectMediaType, getStatusConfig, getStatusOptions } from './utils/statusLabels'

function fuzzyMatch(text: string, query: string): boolean {
  const t = text.toLowerCase()
  const q = query.toLowerCase()
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++
  }
  return qi === q.length
}

type ModalState = {
  open: boolean
  item?: Item | null
  defaultCategoryId?: string
  prefill?: { title: string; description?: string }
}

export default function App() {
  const { session, user, signOut } = useAuth()
  const [items, setItems] = useState<Item[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<ModalState>({ open: false })
  const [authModal, setAuthModal] = useState(false)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<ItemStatus | ''>('')
  const [showLogbook, setShowLogbook] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card')
  const [sidebarWidth, setSidebarWidth] = useState(248)
  const [steamModal, setSteamModal] = useState(false)
  const isResizing = useRef(false)
  const dlRef = useRef<DataLayer>(createDataLayer(session))

  const [migrating, setMigrating] = useState(false)
  const [migrationMsg, setMigrationMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    const dl = createDataLayer(session)
    dlRef.current = dl
    setLoading(true)

    async function load() {
      // Check if migration needed on first login
      if (session?.user && supabase) {
        const needsMigration = await shouldMigrate(supabase, session.user).catch(() => false)
        if (cancelled) return
        if (needsMigration) {
          setMigrating(true)
          try {
            const result = await migrateToSupabase(supabase, session.user, (p) => {
              if (!cancelled) setMigrationMsg(`${p.step}… ${p.current}/${p.total}`)
            })
            if (cancelled) return
            setMigrationMsg(`迁移完成: ${result.categoryCount} 个分类, ${result.itemCount} 条记录`)
            // Re-create DataLayer to read from Supabase after migration
            const freshDl = createDataLayer(session)
            dlRef.current = freshDl
          } catch (err: any) {
            if (cancelled) return
            setMigrationMsg(`迁移失败: ${err.message}`)
          }
          setTimeout(() => { if (!cancelled) { setMigrating(false); setMigrationMsg('') } }, 2000)
        }
      }

      try {
        const [loadedItems, loadedCategories] = await Promise.all([
          dlRef.current.getItems(),
          dlRef.current.getCategories(),
        ])
        if (cancelled) return
        setItems(loadedItems)
        setCategories(loadedCategories)
      } catch (err: any) {
        if (cancelled) return
        console.error('Failed to load data:', err)
        setErrorMsg('数据加载失败，请刷新页面重试')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()

    return () => { cancelled = true }
  }, [session])

  const handleMouseDown = useCallback(() => {
    isResizing.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return
      const newWidth = Math.min(400, Math.max(180, e.clientX))
      setSidebarWidth(newWidth)
    }

    const handleMouseUp = () => {
      isResizing.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [])

  // Recommendations
  const [recSeed, setRecSeed] = useState(0)
  const [recItems, setRecItems] = useState<ExternalItem[]>([])
  const [recLoading, setRecLoading] = useState(false)
  const [recCategoryId, setRecCategoryId] = useState('')
  const [recNeedsKey, setRecNeedsKey] = useState(false)

  useEffect(() => {
    if (categories.length === 0 || items.length === 0) return
    const cat = categories[recSeed % categories.length]
    const catItems = items.filter(i => i.categoryId === cat.id).sort((a, b) => b.rating - a.rating)
    const seed = catItems[0]?.title ?? cat.name

    if (needsTmdbKey(cat.name, cat.icon)) {
      setRecNeedsKey(true)
      setRecItems([])
      setRecCategoryId(cat.id)
      return
    }

    setRecNeedsKey(false)
    setRecLoading(true)
    setRecCategoryId(cat.id)

    const existingTitles = new Set(items.map(i => i.title.toLowerCase()))
    fetchRecs(cat.name, cat.icon, [seed])
      .then(results =>
        setRecItems(results.filter(r => !existingTitles.has(r.title.toLowerCase())).slice(0, 4))
      )
      .catch(() => setRecItems([]))
      .finally(() => setRecLoading(false))
  }, [recSeed, categories.length, items.length])

  function showError(msg: string) {
    setErrorMsg(msg)
    setTimeout(() => setErrorMsg(''), 4000)
  }

  async function logStatusChange(itemId: string, fromStatus: ItemStatus | null, toStatus: ItemStatus) {
    if (fromStatus === toStatus) return
    const entry: LogbookEntry = {
      id: crypto.randomUUID(),
      itemId,
      fromStatus,
      toStatus,
      createdAt: Date.now(),
    }
    try {
      await dlRef.current.addLogEntry(entry)
    } catch (err) {
      console.error('Failed to log status change:', err)
    }
  }

  async function handleSave(data: Omit<Item, 'id' | 'createdAt'>) {
    const dl = dlRef.current
    if (modal.item) {
      const oldStatus = modal.item.status ?? 'completed'
      const newStatus = (data as any).status ?? 'completed'
      const updated = { ...modal.item, ...data, updatedAt: Date.now() }
      setItems(prev => prev.map(i => i.id === modal.item!.id ? updated : i))
      try {
        await dl.saveItem(updated)
        await logStatusChange(modal.item.id, oldStatus, newStatus)
      } catch (err) {
        setItems(prev => prev.map(i => i.id === modal.item!.id ? modal.item! : i))
        showError('保存失败，请重试')
      }
    } else {
      const newItem: Item = { ...data, id: crypto.randomUUID(), createdAt: Date.now(), updatedAt: Date.now() }
      setItems(prev => [...prev, newItem])
      try {
        await dl.saveItem(newItem)
        await logStatusChange(newItem.id, null, (data as any).status ?? 'completed')
      } catch (err) {
        setItems(prev => prev.filter(i => i.id !== newItem.id))
        showError('保存失败，请重试')
      }
    }
  }

  async function handleDeleteItem(id: string) {
    const prev = items
    setItems(p => p.filter(i => i.id !== id))
    try {
      await dlRef.current.deleteItem(id)
    } catch (err) {
      setItems(prev)
      showError('删除失败，请重试')
    }
  }

  async function handleAddCategory(name: string, icon: string): Promise<string> {
    const existing = categories.find(c => c.name.trim().toLowerCase() === name.trim().toLowerCase())
    if (existing) {
      showError('分类名称已存在')
      return existing.id
    }
    const id = crypto.randomUUID()
    const category = { id, name, icon }
    setCategories(prev => [...prev, category])
    try {
      await dlRef.current.saveCategory(category)
    } catch (err) {
      setCategories(prev => prev.filter(c => c.id !== id))
      showError(err instanceof Error && err.message === '分类名称已存在' ? '分类名称已存在' : '添加分类失败，请重试')
    }
    return id
  }

  async function handleDeleteCategory(id: string) {
    if (!confirm('删除分类将同时删除该分类下的所有记录，确定吗？')) return
    if (selectedCategoryId === id) setSelectedCategoryId(null)
    const prevItems = items
    const prevCategories = categories
    setItems(prev => prev.filter(i => i.categoryId !== id))
    setCategories(prev => prev.filter(c => c.id !== id))
    try {
      await dlRef.current.deleteCategory(id)
    } catch (err) {
      setItems(prevItems)
      setCategories(prevCategories)
      showError('删除分类失败，请重试')
    }
  }

  async function handleSteamSync(newItems: Omit<Item, 'id' | 'createdAt'>[], _categoryId: string) {
    const created: Item[] = newItems.map((data) => ({
      ...data,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }))
    setItems(prev => [...prev, ...created])
    try {
      await dlRef.current.bulkSaveItems(created)
    } catch (err) {
      setItems(prev => prev.filter(i => !created.some(c => c.id === i.id)))
      showError('Steam 同步保存失败，请重试')
    }
  }

  const isSearching = search.trim().length > 0

  const filtered = useMemo(() => {
    if (!isSearching) return items
    const q = search.trim()
    return items.filter((i) => fuzzyMatch(i.title, q) || fuzzyMatch(i.description, q))
  }, [items, search, isSearching])

  const recCat = categories.find(c => c.id === recCategoryId)
  const selectedCategory = categories.find(c => c.id === selectedCategoryId)
  const totalItems = items.length
  const avgRating = totalItems > 0 ? items.reduce((s, i) => s + i.rating, 0) / totalItems : 0

  if (loading || migrating) {
    return (
      <div className="app-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '8px' }}>
        <span style={{ opacity: 0.5 }}>{migrating ? '正在迁移数据…' : '加载中…'}</span>
        {migrationMsg && <span style={{ opacity: 0.4, fontSize: '13px' }}>{migrationMsg}</span>}
      </div>
    )
  }

  return (
    <div className="app-shell">
      {/* ── Sidebar ── */}
      <aside className="sidebar" style={{ width: sidebarWidth }}>
        <div className="sidebar-brand">
          <span className="sidebar-brand-mark">✦</span>
          <span className="sidebar-brand-text">我的喜好</span>
        </div>

        <div className="sidebar-auth-section">
          {user ? (
            <button className="sidebar-auth-btn" onClick={() => signOut()}>
              <span>👤</span>
              <span>{user.email?.split('@')[0] ?? '已登录'}</span>
            </button>
          ) : (
            <button className="sidebar-auth-btn" onClick={() => setAuthModal(true)}>
              <span>☁</span>
              <span>云同步 · 登录 / 注册</span>
            </button>
          )}
        </div>

        <div className="sidebar-search-wrap">
          <span className="sidebar-search-icon">⌕</span>
          <input
            className="sidebar-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索收藏..."
          />
          {search && (
            <button className="sidebar-search-clear" onClick={() => setSearch('')}>×</button>
          )}
        </div>

        <nav className="sidebar-nav">
          <button
            className={`sidebar-nav-item ${!selectedCategoryId && !isSearching && !showLogbook && !showStats ? 'active' : ''}`}
            onClick={() => { setSelectedCategoryId(null); setSearch(''); setShowLogbook(false); setShowStats(false) }}
          >
            <span className="nav-icon">⊞</span>
            <span className="nav-label">全部收藏</span>
            <span className="nav-count">{items.length}</span>
          </button>
          <button
            className={`sidebar-nav-item ${showLogbook ? 'active' : ''}`}
            onClick={() => { setShowLogbook(true); setShowStats(false); setSelectedCategoryId(null); setSearch('') }}
          >
            <span className="nav-icon">📋</span>
            <span className="nav-label">活动记录</span>
          </button>
          <button
            className={`sidebar-nav-item ${showStats ? 'active' : ''}`}
            onClick={() => { setShowStats(true); setShowLogbook(false); setSelectedCategoryId(null); setSearch('') }}
          >
            <span className="nav-icon">📊</span>
            <span className="nav-label">数据统计</span>
          </button>

          {categories.length > 0 && (
            <>
              <div className="sidebar-section-header">
                <span className="sidebar-section-label">分类</span>
                <button
                  className="sidebar-add-cat-btn"
                  title="添加分类"
                  onClick={() => setModal({ open: true, item: null })}
                >+</button>
              </div>
              <div className="sidebar-section-divider" />
            </>
          )}

          {categories.map((cat) => (
            <button
              key={cat.id}
              className={`sidebar-nav-item ${selectedCategoryId === cat.id && !isSearching && !showLogbook && !showStats ? 'active' : ''}`}
              onClick={() => { setSelectedCategoryId(cat.id); setSearch(''); setShowLogbook(false); setShowStats(false) }}
            >
              <span className="nav-icon">{cat.icon}</span>
              <span className="nav-label">{cat.name}</span>
              <span className="nav-count">{items.filter(i => i.categoryId === cat.id).length}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            className="sidebar-add-btn"
            onClick={() => setModal({ open: true, defaultCategoryId: selectedCategoryId ?? undefined })}
          >
            <span className="sidebar-add-plus">+</span>
            <span>新增记录</span>
          </button>
          <button
            className="sidebar-steam-btn"
            onClick={() => setSteamModal(true)}
          >
            <span>🎮</span>
            <span>Steam 同步</span>
          </button>
        </div>
      </aside>

      <div className="sidebar-resize-handle" onMouseDown={handleMouseDown} />

      {/* ── Main ── */}
      <main className="main-area">
        {showLogbook ? (
          <LogbookView dataLayer={dlRef.current} items={items} categories={categories} />
        ) : showStats ? (
          <StatsView dataLayer={dlRef.current} items={items} categories={categories} />
        ) : isSearching ? (
          /* Search results */
          <div className="page-search">
            <div className="page-header">
              <div className="page-header-left">
                <p className="page-supertitle">搜索结果</p>
                <h1 className="page-title">
                  <em>"{search}"</em>
                </h1>
              </div>
              <div className="page-header-right">
                <div className="view-toggle">
                  <button
                    className={`view-btn ${viewMode === 'card' ? 'active' : ''}`}
                    onClick={() => setViewMode('card')}
                    title="卡片视图"
                  >⊞</button>
                  <button
                    className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
                    onClick={() => setViewMode('list')}
                    title="列表视图"
                  >≡</button>
                </div>
              </div>
            </div>

            {categories.map((cat) => {
              const catItems = filtered.filter((i) => i.categoryId === cat.id)
              if (!catItems.length) return null
              return (
                <CategorySection
                  key={cat.id}
                  category={cat}
                  items={catItems}
                  viewMode={viewMode}
                  onEditItem={(item) => setModal({ open: true, item })}
                  onDeleteItem={handleDeleteItem}
                />
              )
            })}

            {!filtered.length && (
              <div className="empty-state">
                <span className="empty-icon">◌</span>
                <p>未找到匹配的记录</p>
              </div>
            )}
          </div>

        ) : selectedCategoryId && selectedCategory ? (
          /* Category detail */
          <div className="page-category">
            <div className="page-header">
              <div className="page-header-left">
                <button className="back-btn" onClick={() => setSelectedCategoryId(null)}>
                  ← 返回
                </button>
                <div className="page-title-row">
                  <span className="page-title-icon">{selectedCategory.icon}</span>
                  <h1 className="page-title">{selectedCategory.name}</h1>
                  <span className="page-title-count">
                    {items.filter(i => i.categoryId === selectedCategoryId).length}
                  </span>
                </div>
              </div>
              <div className="page-header-right">
                <div className="view-toggle">
                  <button
                    className={`view-btn ${viewMode === 'card' ? 'active' : ''}`}
                    onClick={() => setViewMode('card')}
                    title="卡片视图"
                  >⊞</button>
                  <button
                    className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
                    onClick={() => setViewMode('list')}
                    title="列表视图"
                  >≡</button>
                </div>
                <button
                  className="cat-delete-btn"
                  onClick={() => handleDeleteCategory(selectedCategoryId)}
                >
                  删除分类
                </button>
              </div>
            </div>

            <div className="status-filter-bar">
              {(() => {
                const mt = selectedCategory ? detectMediaType(selectedCategory.name, selectedCategory.icon) : undefined
                return (['', 'want', 'in_progress', 'completed', 'dropped'] as const).map(s => {
                  const cfg = s ? getStatusConfig(s, mt) : null
                  return (
                    <button
                      key={s}
                      className={`pill ${statusFilter === s ? 'active' : ''}`}
                      onClick={() => setStatusFilter(s)}
                    >
                      {cfg ? `${cfg.icon} ${cfg.label}` : '全部'}
                    </button>
                  )
                })
              })()}
            </div>

            <CategorySection
              category={selectedCategory}
              items={items.filter((i) =>
                i.categoryId === selectedCategoryId &&
                (!statusFilter || (i.status ?? 'completed') === statusFilter)
              )}
              viewMode={viewMode}
              hideHeader
              onEditItem={(item) => setModal({ open: true, item })}
              onDeleteItem={handleDeleteItem}
            />
          </div>

        ) : (
          /* Overview dashboard */
          <div className="page-overview">
            <div className="overview-header">
              <div>
                <p className="overview-supertitle">收藏库</p>
                <h1 className="overview-title">我的喜好</h1>
              </div>
              <div className="overview-stats">
                <div className="stat-pill">
                  <span className="stat-value">{totalItems}</span>
                  <span className="stat-label">条记录</span>
                </div>
                <div className="stat-pill">
                  <span className="stat-value">{categories.length}</span>
                  <span className="stat-label">个分类</span>
                </div>
                {avgRating > 0 && (
                  <div className="stat-pill">
                    <span className="stat-value">{avgRating.toFixed(1)}</span>
                    <span className="stat-label">平均评分</span>
                  </div>
                )}
              </div>
              {items.length > 5 && (() => {
                const sparkData = computeTimeline(items, '30d')
                return sparkData.length > 1 ? (
                  <div className="overview-sparkline">
                    <ResponsiveContainer width="100%" height={40}>
                      <AreaChart data={sparkData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                        <defs>
                          <linearGradient id="sparkGrad" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#ff6b6b" stopOpacity={0.25} />
                            <stop offset="100%" stopColor="#a855f7" stopOpacity={0.25} />
                          </linearGradient>
                        </defs>
                        <Area
                          type="monotone"
                          dataKey="count"
                          stroke="url(#lineGrad)"
                          strokeWidth={1.5}
                          fill="url(#sparkGrad)"
                          animationDuration={800}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : null
              })()}
            </div>

            {categories.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">✦</span>
                <p>还没有任何分类，点击左下角"新增记录"开始吧</p>
              </div>
            ) : (
              <div className="overview-cat-grid">
                {categories.map((cat) => {
                  const catItems = items.filter(i => i.categoryId === cat.id)
                  const avg = catItems.length
                    ? catItems.reduce((s, i) => s + i.rating, 0) / catItems.length
                    : 0
                  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()
                  const monthlyNew = catItems.filter(i => i.createdAt >= monthStart).length
                  const recent = [...catItems]
                    .sort((a, b) => b.createdAt - a.createdAt)
                    .slice(0, 3)
                  return (
                    <button
                      key={cat.id}
                      className="overview-cat-card"
                      onClick={() => setSelectedCategoryId(cat.id)}
                    >
                      <div className="occ-top">
                        <span className="occ-icon">{cat.icon}</span>
                        <span className="occ-arrow">→</span>
                      </div>
                      <h2 className="occ-name">{cat.name}</h2>
                      <div className="occ-stats">
                        <span className="occ-count">{catItems.length} 条{monthlyNew > 0 && <span className="occ-monthly">+{monthlyNew}</span>}</span>
                        {avg > 0 && (
                          <span className="occ-stars">{'★'.repeat(Math.round(avg))}</span>
                        )}
                      </div>
                      {recent.length > 0 && (
                        <ul className="occ-recent">
                          {recent.map((item) => (
                            <li key={item.id}>{item.title}</li>
                          ))}
                        </ul>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Recommendations */}
            {items.length > 0 && categories.length > 0 && (
              <section className="rec-section">
                <div className="rec-header">
                  <div className="rec-header-left">
                    <span className="rec-title">猜你喜欢</span>
                    {recCat && (
                      <span className="rec-cat-badge">{recCat.icon} {recCat.name}</span>
                    )}
                  </div>
                  <button
                    className="btn-rec-refresh"
                    onClick={() => setRecSeed(s => s + 1)}
                    disabled={recLoading}
                  >
                    {recLoading ? '加载中…' : '换一批'}
                  </button>
                </div>

                {recNeedsKey && (
                  <div className="rec-no-key">
                    电影推荐需要配置 TMDB API Key，请在{' '}
                    <code>src/services/recommend.ts</code> 顶部填入（
                    <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">
                      免费注册
                    </a>
                    ），或点击"换一批"切换到其他分类。
                  </div>
                )}

                {!recNeedsKey && recLoading && (
                  <div className="rec-loading">
                    <span className="rec-dot" />
                    <span className="rec-dot" />
                    <span className="rec-dot" />
                  </div>
                )}

                {!recNeedsKey && !recLoading && recItems.length === 0 && (
                  <div className="rec-empty">暂无推荐，点击"换一批"试试其他分类</div>
                )}

                {!recNeedsKey && !recLoading && recItems.length > 0 && (
                  <div className="rec-list">
                    {recItems.map((ext) => (
                      <div key={ext.externalId} className="rec-card">
                        {ext.coverUrl
                          ? <img className="rec-card-cover" src={ext.coverUrl} alt={ext.title} loading="lazy" />
                          : <div className="rec-card-cover rec-card-cover-empty">{recCat?.icon ?? '?'}</div>
                        }
                        <div className="rec-card-body">
                          <span className="rec-card-source">{ext.source}</span>
                          <div className="rec-card-title">{ext.title}</div>
                          {(ext.subtitle || ext.year) && (
                            <div className="rec-card-sub">
                              {[ext.subtitle, ext.year].filter(Boolean).join(' · ')}
                            </div>
                          )}
                          {ext.description && (
                            <div className="rec-card-desc">{ext.description}</div>
                          )}
                          <button
                            className="btn-rec-add"
                            onClick={() => setModal({
                              open: true,
                              defaultCategoryId: recCategoryId,
                              prefill: {
                                title: ext.title,
                                description: [ext.subtitle, ext.year].filter(Boolean).join(' · '),
                              },
                            })}
                          >
                            + 添加到收藏
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </main>

      {modal.open && (
        <AddEditModal
          item={modal.item}
          items={items}
          categories={categories}
          defaultCategoryId={modal.defaultCategoryId}
          prefill={modal.prefill}
          onSave={handleSave}
          onClose={() => setModal({ open: false })}
          onAddCategory={handleAddCategory}
        />
      )}

      {steamModal && (
        <SteamSyncModal
          items={items}
          categories={categories}
          onSync={handleSteamSync}
          onAddCategory={handleAddCategory}
          onClose={() => setSteamModal(false)}
        />
      )}

      {authModal && (
        <AuthModal onClose={() => setAuthModal(false)} />
      )}

      {errorMsg && (
        <div className="error-toast" onClick={() => setErrorMsg('')}>
          {errorMsg}
        </div>
      )}
    </div>
  )
}
