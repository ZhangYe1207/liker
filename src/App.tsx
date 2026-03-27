import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import type { Item, Category } from './types'
import { createDataLayer } from './data'
import { useAuth } from './contexts/AuthContext'
import CategorySection from './components/CategorySection'
import AddEditModal from './components/AddEditModal'
import AuthModal from './components/AuthModal'
import SteamSyncModal from './components/SteamSyncModal'
import { fetchRecs, needsTmdbKey } from './services/recommend'
import type { ExternalItem } from './services/recommend'

function fuzzyMatch(text: string, query: string): boolean {
  const t = text.toLowerCase()
  const q = query.toLowerCase()
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++
  }
  return qi === q.length
}

const dataLayer = createDataLayer()

type ModalState = {
  open: boolean
  item?: Item | null
  defaultCategoryId?: string
  prefill?: { title: string; description?: string }
}

export default function App() {
  const { user, signOut } = useAuth()
  const [items, setItems] = useState<Item[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<ModalState>({ open: false })
  const [authModal, setAuthModal] = useState(false)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card')
  const [sidebarWidth, setSidebarWidth] = useState(248)
  const [steamModal, setSteamModal] = useState(false)
  const isResizing = useRef(false)

  useEffect(() => {
    Promise.all([dataLayer.getItems(), dataLayer.getCategories()]).then(([loadedItems, loadedCategories]) => {
      setItems(loadedItems)
      setCategories(loadedCategories)
      setLoading(false)
    })
  }, [])

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

  function handleSave(data: Omit<Item, 'id' | 'createdAt'>) {
    if (modal.item) {
      const updated = { ...modal.item, ...data, updatedAt: Date.now() }
      setItems(prev => prev.map(i => i.id === modal.item!.id ? updated : i))
      dataLayer.saveItem(updated)
    } else {
      const newItem: Item = { ...data, id: crypto.randomUUID(), createdAt: Date.now(), updatedAt: Date.now() }
      setItems(prev => [...prev, newItem])
      dataLayer.saveItem(newItem)
    }
  }

  function handleDeleteItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
    dataLayer.deleteItem(id)
  }

  function handleAddCategory(name: string, icon: string): string {
    const id = crypto.randomUUID()
    const category = { id, name, icon }
    setCategories(prev => [...prev, category])
    dataLayer.saveCategory(category)
    return id
  }

  function handleDeleteCategory(id: string) {
    if (!confirm('删除分类将同时删除该分类下的所有记录，确定吗？')) return
    if (selectedCategoryId === id) setSelectedCategoryId(null)
    setItems(prev => prev.filter(i => i.categoryId !== id))
    setCategories(prev => prev.filter(c => c.id !== id))
    dataLayer.deleteCategory(id)
  }

  function handleSteamSync(newItems: Omit<Item, 'id' | 'createdAt'>[], _categoryId: string) {
    const created: Item[] = newItems.map((data) => ({
      ...data,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }))
    setItems(prev => [...prev, ...created])
    dataLayer.bulkSaveItems(created)
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

  if (loading) {
    return (
      <div className="app-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ opacity: 0.5 }}>加载中…</span>
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
            className={`sidebar-nav-item ${!selectedCategoryId && !isSearching ? 'active' : ''}`}
            onClick={() => { setSelectedCategoryId(null); setSearch('') }}
          >
            <span className="nav-icon">⊞</span>
            <span className="nav-label">全部收藏</span>
            <span className="nav-count">{items.length}</span>
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
              className={`sidebar-nav-item ${selectedCategoryId === cat.id && !isSearching ? 'active' : ''}`}
              onClick={() => { setSelectedCategoryId(cat.id); setSearch('') }}
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
          {user ? (
            <button className="sidebar-auth-btn" onClick={() => signOut()}>
              <span>👤</span>
              <span>{user.email?.split('@')[0] ?? '已登录'}</span>
            </button>
          ) : (
            <button className="sidebar-auth-btn" onClick={() => setAuthModal(true)}>
              <span>☁</span>
              <span>登录 / 注册</span>
            </button>
          )}
        </div>
      </aside>

      <div className="sidebar-resize-handle" onMouseDown={handleMouseDown} />

      {/* ── Main ── */}
      <main className="main-area">
        {isSearching ? (
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

            <CategorySection
              category={selectedCategory}
              items={items.filter((i) => i.categoryId === selectedCategoryId)}
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
                        <span className="occ-count">{catItems.length} 条</span>
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
    </div>
  )
}
