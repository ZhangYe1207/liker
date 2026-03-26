import { useState } from 'react'
import type { Item } from '../types'
import StarRating from './StarRating'

interface Props {
  item: Item
  variant?: 'card' | 'list'
  onEdit: (item: Item) => void
  onDelete: (id: string) => void
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function ItemCard({ item, variant = 'card', onEdit, onDelete }: Props) {
  const [pendingDelete, setPendingDelete] = useState(false)

  if (variant === 'list') {
    if (pendingDelete) {
      return (
        <div
          className="list-item list-item-confirming"
          style={{ gridTemplateColumns: 'auto 1fr auto', gap: '14px' }}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="list-item-title">{item.title}</span>
          <span className="delete-confirm-text" style={{ fontSize: '12px' }}>确认删除这条记录？</span>
          <div className="list-item-confirm">
            <button className="btn-confirm-yes" onClick={() => onDelete(item.id)}>删除</button>
            <button className="btn-confirm-no" onClick={() => setPendingDelete(false)}>取消</button>
          </div>
        </div>
      )
    }

    return (
      <div className="list-item" onClick={() => onEdit(item)}>
        <span className="list-item-title">{item.title}</span>
        <span className="list-item-desc">{item.description || '—'}</span>
        <span className="list-item-rating">
          <StarRating value={item.rating} size={12} />
        </span>
        <span className="list-item-date">{formatDate(item.createdAt)}</span>
        <button
          className="list-item-delete"
          onClick={(e) => { e.stopPropagation(); setPendingDelete(true) }}
          title="删除"
        >×</button>
      </div>
    )
  }

  // Card variant
  return (
    <div
      className={`item-card${pendingDelete ? ' item-card-confirming' : ''}`}
      onClick={() => !pendingDelete && onEdit(item)}
    >
      <div className="item-card-top">
        <span className="item-card-title">{item.title}</span>
        <StarRating value={item.rating} size={13} />
      </div>

      {item.description && (
        <p className="item-card-desc">{item.description}</p>
      )}

      <div className="item-card-footer">
        <span className="item-card-date">{formatDate(item.createdAt)}</span>
      </div>

      {pendingDelete ? (
        <div className="item-card-confirm" onClick={(e) => e.stopPropagation()}>
          <span className="delete-confirm-text">确认删除？</span>
          <button className="btn-confirm-yes" onClick={() => onDelete(item.id)}>删除</button>
          <button className="btn-confirm-no" onClick={() => setPendingDelete(false)}>取消</button>
        </div>
      ) : (
        <button
          className="item-card-delete"
          onClick={(e) => { e.stopPropagation(); setPendingDelete(true) }}
          title="删除"
        >×</button>
      )}
    </div>
  )
}
