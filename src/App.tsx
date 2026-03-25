import { useState, useMemo } from 'react'
import type { Item, Category } from './types'
import { loadData, saveData } from './store'
import CategorySection from './components/CategorySection'
import AddEditModal from './components/AddEditModal'
import StarRating from './components/StarRating'

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

export default function App() {
  const [items, setItems] = useState<Item[]>(initialData.items)
  const [categories, setCategories] = useState<Category[]>(initialData.categories)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<{ open: boolean; item?: Item | null; defaultCategoryId?: string }>({ open: false })
  const [recSeed, setRecSeed] = useState(() => Date.now())

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
    const newCategories = [...categories, { id, name, icon }]
    persist(items, newCategories)
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

  const recommendations = useMemo(() => {
    if (items.length < 2) return []
    const pool = items.filter(i => i.rating >= 4).length >= 3 ? items.filter(i => i.rating >= 4) : items
    const shuffled = [...pool].sort((a, b) => {
      const ha = Math.sin(recSeed + a.createdAt) * 10000
      const hb = Math.sin(recSeed + b.createdAt) * 10000
      return (ha - Math.floor(ha)) - (hb - Math.floor(hb))
    })
    return shuffled.slice(0, Math.min(3, shuffled.length))
  }, [items, recSeed])

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

        {!search.trim() && recommendations.length > 0 && (
          <div className="rec-section">
            <div className="rec-header">
              <span className="rec-title">猜你喜欢</span>
              <button className="btn-rec-refresh" onClick={() => setRecSeed(Date.now())}>换一批</button>
            </div>
            <div className="rec-list">
              {recommendations.map(item => {
                const cat = categories.find(c => c.id === item.categoryId)
                return (
                  <div key={item.id} className="rec-card" onClick={() => setModal({ open: true, item })}>
                    <div className="rec-card-meta">
                      <span className="rec-card-cat">{cat?.icon} {cat?.name}</span>
                      <StarRating value={item.rating} />
                    </div>
                    <div className="rec-card-title">{item.title}</div>
                    {item.description && <div className="rec-card-desc">{item.description}</div>}
                  </div>
                )
              })}
            </div>
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
          onSave={handleSave}
          onClose={() => setModal({ open: false })}
          onAddCategory={handleAddCategory}
        />
      )}
    </div>
  )
}
