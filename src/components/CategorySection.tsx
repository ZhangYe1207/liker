import type { Category, Item } from '../types'
import ItemCard from './ItemCard'

interface Props {
  category: Category
  items: Item[]
  viewMode: 'card' | 'list'
  onEditItem: (item: Item) => void
  onDeleteItem: (id: string) => void
  hideHeader?: boolean
}

export default function CategorySection({
  category,
  items,
  viewMode,
  onEditItem,
  onDeleteItem,
  hideHeader,
}: Props) {
  return (
    <section className="category-section">
      {!hideHeader && (
        <div className="cs-header">
          <span className="cs-header-icon">{category.icon}</span>
          <span className="cs-header-name">{category.name}</span>
          <span className="cs-header-count">{items.length}</span>
        </div>
      )}

      {viewMode === 'card' ? (
        <div className="items-grid">
          {items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              variant="card"
              onEdit={onEditItem}
              onDelete={onDeleteItem}
            />
          ))}
          {items.length === 0 && (
            <p className="empty-hint">暂无记录，点击左下角"新增记录"</p>
          )}
        </div>
      ) : (
        <div className="items-list">
          {items.length > 0 && (
            <div className="list-header-row">
              <span className="list-col-title">名称</span>
              <span className="list-col-status">状态</span>
              <span className="list-col-desc">简介</span>
              <span className="list-col-rating">评分</span>
              <span className="list-col-date">日期</span>
              <span />
            </div>
          )}
          {items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              variant="list"
              onEdit={onEditItem}
              onDelete={onDeleteItem}
            />
          ))}
          {items.length === 0 && (
            <p className="empty-hint">暂无记录</p>
          )}
        </div>
      )}
    </section>
  )
}
