import { useState, useMemo, useEffect } from 'react'
import type { Item, Category } from './types'
import { loadData, saveData } from './store'
import CategorySection from './components/CategorySection'
import AddEditModal from './components/AddEditModal'
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

const initialData = loadData()

type ModalState = {
  open: boolean
  item?: Item | null
  defaultCategoryId?: string
  prefill?: { title: string; description?: string }
}

export default function App() {
  const [items, setItems] = useState<Item[]>(initialData.items)
  const [categories, setCategories] = useState<Category[]>(initialData.categories)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<ModalState>({ open: false })

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

  function persist(newItems: Item[], newCategories: Category[]) {
    setItems(newItems)
    setCategories(newCategories)
    saveData({ items: newItems, categories: newCategories })
  }

  function handleSave(data: Omit<Item, 'id' | 'createdAt'>) {
    if (modal.item) {
      const newItems = items.map((i) => i.id === modal.item!.id ? { ...i, ...data } : i)
      persist(newItems, categories)
    } else {
      const newItem: Item = { ...data, id: crypto.randomUUID(), createdAt: Date.now() }
      persist([...items, newItem], categories)
    }
  }

  function handleDeleteItem(id: string) {
    persist(items.filter((i) => i.id !== id), categories)
  }

  function handleAddCategory(name: string, icon: string): string {
    const id = crypto.randomUUID()
    persist(items, [...categories, { id, name, icon }])
    return id
  }

  function handleDeleteCategory(id: string) {
    if (!confirm('删除分类将同时删除该分类下的所有记录，确定吗？')) return
    persist(items.filter((i) => i.categoryId !== id), categories.filter((c) => c.id !== id))
  }

  const filtered = useMemo(() => {
    const q = search.trim()
    if (!q) return items
    return items.filter((i) => fuzzyMatch(i.title, q) || fuzzyMatch(i.description, q))
  }, [items, search])

  const recCat = categories.find(c => c.id === recCategoryId)
  const showRec = !search.trim() && categories.length > 0 && items.length > 0

  return (
    <div className="app">
      <div className="container">
        <h1 className="page-title">我的喜好</h1>

        <div className="search-row">
          <div className="search-wrap">
            <span className="search-icon">🔍</span>
            <input
              className="search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索记录..."
            />
          </div>
          <button className="btn-add" onClick={() => setModal({ open: true })}>+</button>
        </div>

        {showRec && (
          <div className="rec-section">
            <div className="rec-header">
              <div className="rec-header-left">
                <span className="rec-title">猜你喜欢</span>
                {recCat && <span className="rec-cat-badge">{recCat.icon} {recCat.name}</span>}
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
                <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">免费注册</a>
                ），或点击"换一批"切换到其他分类。
              </div>
            )}

            {!recNeedsKey && recLoading && (
              <div className="rec-loading">
                <span className="rec-loading-dot" />
                <span className="rec-loading-dot" />
                <span className="rec-loading-dot" />
              </div>
            )}

            {!recNeedsKey && !recLoading && recItems.length === 0 && (
              <div className="rec-empty">暂无推荐，点击"换一批"试试其他分类</div>
            )}

            {!recNeedsKey && !recLoading && recItems.length > 0 && (
              <div className="rec-list">
                {recItems.map(ext => (
                  <div key={ext.externalId} className="rec-card">
                    {ext.coverUrl
                      ? <img className="rec-card-cover" src={ext.coverUrl} alt={ext.title} loading="lazy" />
                      : <div className="rec-card-cover rec-card-cover-placeholder">{recCat?.icon ?? '?'}</div>
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
          </div>
        )}

        {categories.length === 0 && (
          <div className="empty-state">
            <p>还没有任何分类，点击 + 开始添加吧</p>
          </div>
        )}

        {categories.map((cat) => {
          const catItems = filtered.filter((i) => i.categoryId === cat.id)
          if (search && catItems.length === 0) return null
          return (
            <CategorySection
              key={cat.id}
              category={cat}
              items={catItems}
              onEditItem={(item) => setModal({ open: true, item })}
              onDeleteItem={handleDeleteItem}
              onDeleteCategory={handleDeleteCategory}
            />
          )
        })}

        {search && filtered.length === 0 && (
          <div className="empty-state">
            <p>未找到匹配的记录</p>
          </div>
        )}
      </div>

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
    </div>
  )
}
