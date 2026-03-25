import { useState, useEffect } from 'react'
import type { Item, Category } from '../types'
import StarRating from './StarRating'

interface Props {
  item?: Item | null
  categories: Category[]
  defaultCategoryId?: string
  onSave: (data: Omit<Item, 'id' | 'createdAt'>) => void
  onClose: () => void
  onAddCategory: (name: string, icon: string) => string
}

export default function AddEditModal({ item, categories, defaultCategoryId, onSave, onClose, onAddCategory }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [rating, setRating] = useState(5)
  const [categoryId, setCategoryId] = useState(defaultCategoryId ?? categories[0]?.id ?? '')
  const [newCatName, setNewCatName] = useState('')
  const [newCatIcon, setNewCatIcon] = useState('⭐')
  const [showNewCat, setShowNewCat] = useState(false)

  useEffect(() => {
    if (item) {
      setTitle(item.title)
      setDescription(item.description)
      setRating(item.rating)
      setCategoryId(item.categoryId)
    }
  }, [item])

  function handleSave() {
    if (!title.trim()) return
    onSave({ title: title.trim(), description: description.trim(), rating, categoryId })
    onClose()
  }

  function handleAddCategory() {
    if (!newCatName.trim()) return
    const id = onAddCategory(newCatName.trim(), newCatIcon)
    setCategoryId(id)
    setNewCatName('')
    setNewCatIcon('⭐')
    setShowNewCat(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{item ? '编辑记录' : '新增记录'}</h2>

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

        <label className="form-label">名称 *</label>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="请输入名称"
          autoFocus
        />

        <label className="form-label">简介</label>
        <textarea
          className="input textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="请输入简介（选填）"
          rows={3}
        />

        <label className="form-label">评分</label>
        <StarRating value={rating} onChange={setRating} size={28} />

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={handleSave} disabled={!title.trim()}>保存</button>
        </div>
      </div>
    </div>
  )
}
