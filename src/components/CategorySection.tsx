import type { Category, Item } from '../types'
import ItemCard from './ItemCard'

interface Props {
  category: Category
  items: Item[]
  onEditItem: (item: Item) => void
  onDeleteItem: (id: string) => void
  onDeleteCategory: (id: string) => void
}

export default function CategorySection({ category, items, onEditItem, onDeleteItem, onDeleteCategory }: Props) {
  return (
    <section className="category-section">
      <div className="category-header">
        <span className="category-icon">{category.icon}</span>
        <span className="category-name">{category.name}</span>
        <span className="category-badge">{items.length}</span>
        <button
          className="category-delete"
          onClick={() => onDeleteCategory(category.id)}
          title="删除分类"
        >
          ×
        </button>
      </div>
      <div className="card-list">
        {items.map((item) => (
          <ItemCard key={item.id} item={item} onEdit={onEditItem} onDelete={onDeleteItem} />
        ))}
        {items.length === 0 && <p className="empty-hint">暂无记录</p>}
      </div>
    </section>
  )
}
