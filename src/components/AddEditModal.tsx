import { useState, useEffect, useRef, useCallback } from 'react'
import type { Item, Category, ItemStatus } from '../types'
import StarRating from './StarRating'
import MetadataSearchResults from './MetadataSearchResults'
import { searchMetadata, type MetadataResult } from '../services/metadata'

const STATUS_OPTIONS: { value: ItemStatus; label: string }[] = [
  { value: 'completed', label: '✓ 看过' },
  { value: 'in_progress', label: '▶ 在看' },
  { value: 'want', label: '🔖 想看' },
  { value: 'dropped', label: '✗ 搁置' },
]

interface Props {
  item?: Item | null
  categories: Category[]
  defaultCategoryId?: string
  prefill?: { title: string; description?: string }
  onSave: (data: Omit<Item, 'id' | 'createdAt'>) => void
  onClose: () => void
  onAddCategory: (name: string, icon: string) => string | Promise<string>
}

export default function AddEditModal({ item, categories, defaultCategoryId, prefill, onSave, onClose, onAddCategory }: Props) {
  const [mode, setMode] = useState<'search' | 'manual'>(item ? 'manual' : 'search')
  const [title, setTitle] = useState(prefill?.title ?? '')
  const [description, setDescription] = useState(prefill?.description ?? '')
  const [rating, setRating] = useState(5)
  const [status, setStatus] = useState<ItemStatus>('completed')
  const [categoryId, setCategoryId] = useState(defaultCategoryId ?? categories[0]?.id ?? '')
  const [coverUrl, setCoverUrl] = useState('')
  const [year, setYear] = useState('')
  const [genre, setGenre] = useState('')
  const [externalId, setExternalId] = useState('')
  const [source, setSource] = useState('')
  const [newCatName, setNewCatName] = useState('')
  const [newCatIcon, setNewCatIcon] = useState('⭐')
  const [showNewCat, setShowNewCat] = useState(false)

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<MetadataResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (item) {
      setTitle(item.title)
      setDescription(item.description)
      setRating(item.rating)
      setStatus(item.status ?? 'completed')
      setCategoryId(item.categoryId)
      setCoverUrl(item.coverUrl ?? '')
      setYear(item.year ?? '')
      setGenre(item.genre ?? '')
      setExternalId(item.externalId ?? '')
      setSource(item.source ?? '')
    }
  }, [item])

  const selectedCategory = categories.find(c => c.id === categoryId)

  const doSearch = useCallback((query: string) => {
    if (!query.trim()) {
      setSearchResults([])
      return
    }
    setSearchLoading(true)
    searchMetadata(query, selectedCategory?.name ?? '', selectedCategory?.icon ?? '')
      .then(setSearchResults)
      .catch(() => setSearchResults([]))
      .finally(() => setSearchLoading(false))
  }, [selectedCategory?.name, selectedCategory?.icon])

  function handleSearchInput(value: string) {
    setSearchQuery(value)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(value), 300)
  }

  function handleSelectResult(result: MetadataResult) {
    setTitle(result.title)
    setDescription(result.description ?? '')
    setCoverUrl(result.coverUrl ?? '')
    setYear(result.year ?? '')
    setGenre(result.genre ?? '')
    setExternalId(result.externalId)
    setSource(result.source)
    setMode('manual') // Switch to form view with auto-filled data
  }

  function handleSave() {
    if (!title.trim()) return
    onSave({
      title: title.trim(),
      description: description.trim(),
      rating: status === 'completed' ? rating : 0,
      categoryId,
      status,
      coverUrl: coverUrl || undefined,
      year: year || undefined,
      genre: genre || undefined,
      externalId: externalId || undefined,
      source: source || undefined,
    })
    onClose()
  }

  async function handleAddCategory() {
    if (!newCatName.trim()) return
    const id = await onAddCategory(newCatName.trim(), newCatIcon)
    setCategoryId(id)
    setNewCatName('')
    setNewCatIcon('⭐')
    setShowNewCat(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{item ? '编辑记录' : '新增记录'}</h2>

        {/* Mode tabs for new items */}
        {!item && (
          <div className="auth-tabs" style={{ marginBottom: 12 }}>
            <button
              className={`auth-tab ${mode === 'search' ? 'active' : ''}`}
              onClick={() => setMode('search')}
            >
              搜索添加
            </button>
            <button
              className={`auth-tab ${mode === 'manual' ? 'active' : ''}`}
              onClick={() => setMode('manual')}
            >
              手动添加
            </button>
          </div>
        )}

        <label className="form-label">分类</label>
        <div className="category-pills">
          {categories.map((c) => (
            <button
              key={c.id}
              className={`pill ${categoryId === c.id ? 'active' : ''}`}
              onClick={() => setCategoryId(c.id)}
            >
              {c.icon} {c.name}
            </button>
          ))}
          <button className="pill pill-add" onClick={() => setShowNewCat(!showNewCat)}>
            + 新建分类
          </button>
        </div>

        {showNewCat && (
          <div className="new-cat-row">
            <input
              className="input emoji-input"
              value={newCatIcon}
              onChange={(e) => setNewCatIcon(e.target.value)}
              maxLength={2}
              placeholder="图标"
            />
            <input
              className="input"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="分类名称"
            />
            <button className="btn-primary" onClick={handleAddCategory}>确定</button>
          </div>
        )}

        {/* Search mode */}
        {mode === 'search' && !item && (
          <>
            <label className="form-label">搜索</label>
            <input
              className="input"
              value={searchQuery}
              onChange={(e) => handleSearchInput(e.target.value)}
              placeholder="输入名称搜索…"
              autoFocus
            />
            <MetadataSearchResults
              results={searchResults}
              loading={searchLoading}
              onSelect={handleSelectResult}
            />
          </>
        )}

        {/* Manual/form mode */}
        {(mode === 'manual' || item) && (
          <>
            {coverUrl && (
              <div className="meta-cover-preview">
                <img src={coverUrl} alt={title} />
              </div>
            )}

            <label className="form-label">名称 *</label>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="请输入名称"
              autoFocus={mode === 'manual'}
            />

            <label className="form-label">简介</label>
            <textarea
              className="input textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="请输入简介（选填）"
              rows={3}
            />

            {(year || genre) && (
              <div className="meta-extra-row">
                {year && <span className="meta-extra-tag">{year}</span>}
                {genre && <span className="meta-extra-tag">{genre}</span>}
                {source && <span className="meta-extra-tag meta-source-tag">{source}</span>}
              </div>
            )}

            <label className="form-label">状态</label>
            <div className="status-selector">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`pill ${status === opt.value ? 'active' : ''}`}
                  onClick={() => setStatus(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {status === 'completed' && (
              <>
                <label className="form-label">评分</label>
                <StarRating value={rating} onChange={setRating} size={28} />
              </>
            )}

            <div className="modal-actions">
              <button className="btn-secondary" onClick={onClose}>取消</button>
              <button className="btn-primary" onClick={handleSave} disabled={!title.trim()}>保存</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
