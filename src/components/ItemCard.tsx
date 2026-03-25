import { useState } from 'react'
import type { Item } from '../types'
import StarRating from './StarRating'

interface Props {
  item: Item
  onEdit: (item: Item) => void
  onDelete: (id: string) => void
}

export default function ItemCard({ item, onEdit, onDelete }: Props) {
  const [pendingDelete, setPendingDelete] = useState(false)

  return (
    <div
      className={`card${pendingDelete ? ' card-confirming' : ''}`}
      onClick={() => !pendingDelete && onEdit(item)}
    >
      <div className="card-header">
        <span className="card-title">{item.title}</span>
        <StarRating value={item.rating} />
      </div>
      {item.description && <p className="card-desc">{item.description}</p>}
      {pendingDelete ? (
        <div className="card-delete-confirm" onClick={(e) => e.stopPropagation()}>
          <span className="delete-confirm-text">确认删除？</span>
          <button className="btn-confirm-yes" onClick={() => onDelete(item.id)}>删除</button>
          <button className="btn-confirm-no" onClick={() => setPendingDelete(false)}>取消</button>
        </div>
      ) : (
        <button
          className="card-delete"
          onClick={(e) => { e.stopPropagation(); setPendingDelete(true) }}
          title="删除"
        >×</button>
      )}
    </div>
  )
}
