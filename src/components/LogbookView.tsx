import { useState, useEffect, useMemo } from 'react'
import type { LogbookEntry, Item, Category, ItemStatus } from '../types'
import type { DataLayer } from '../data'
import StatusBadge from './StatusBadge'
import { detectMediaType, getStatusLabel } from '../utils/statusLabels'

interface Props {
  dataLayer: DataLayer
  items: Item[]
  categories: Category[]
}

function groupByDate(entries: LogbookEntry[]): Map<string, LogbookEntry[]> {
  const groups = new Map<string, LogbookEntry[]>()
  for (const entry of entries) {
    const dateKey = new Date(entry.createdAt).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    const group = groups.get(dateKey) ?? []
    group.push(entry)
    groups.set(dateKey, group)
  }
  return groups
}

export default function LogbookView({ dataLayer, items, categories }: Props) {
  const [entries, setEntries] = useState<LogbookEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<ItemStatus | ''>('')
  const [filterCategoryId, setFilterCategoryId] = useState('')

  useEffect(() => {
    setLoading(true)
    const filters: { categoryId?: string; status?: ItemStatus } = {}
    if (filterStatus) filters.status = filterStatus
    if (filterCategoryId) filters.categoryId = filterCategoryId
    dataLayer.getLogEntries(filters)
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [dataLayer, filterStatus, filterCategoryId])

  const itemMap = new Map(items.map(i => [i.id, i]))
  const catMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])
  const grouped = groupByDate(entries)

  // For the logbook filter dropdown, use generic labels since entries span multiple categories
  const filterLabels: { value: ItemStatus; label: string }[] = [
    { value: 'want', label: getStatusLabel('want') },
    { value: 'in_progress', label: getStatusLabel('in_progress') },
    { value: 'completed', label: getStatusLabel('completed') },
    { value: 'dropped', label: getStatusLabel('dropped') },
  ]

  function getMediaTypeForItem(itemId: string) {
    const item = itemMap.get(itemId)
    if (!item) return undefined
    const cat = catMap.get(item.categoryId)
    if (!cat) return undefined
    return detectMediaType(cat.name, cat.icon)
  }

  return (
    <div className="logbook-view">
      <div className="logbook-header">
        <h2 className="logbook-title">活动记录</h2>
        <div className="logbook-filters">
          <select
            className="logbook-filter-select"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as ItemStatus | '')}
          >
            <option value="">全部状态</option>
            {filterLabels.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
          <select
            className="logbook-filter-select"
            value={filterCategoryId}
            onChange={(e) => setFilterCategoryId(e.target.value)}
          >
            <option value="">全部分类</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="logbook-empty">加载中…</div>
      ) : entries.length === 0 ? (
        <div className="logbook-empty">暂无活动记录</div>
      ) : (
        <div className="logbook-timeline">
          {[...grouped.entries()].map(([date, dayEntries]) => (
            <div key={date} className="logbook-day">
              <div className="logbook-day-label">{date}</div>
              {dayEntries.map(entry => {
                const item = itemMap.get(entry.itemId)
                const mt = getMediaTypeForItem(entry.itemId)
                return (
                  <div key={entry.id} className="logbook-entry">
                    <div className="logbook-entry-dot" />
                    <div className="logbook-entry-content">
                      <span className="logbook-entry-title">{item?.title ?? '已删除的记录'}</span>
                      <span className="logbook-entry-change">
                        {entry.fromStatus ? (
                          <>
                            <StatusBadge status={entry.fromStatus} mediaType={mt} size="sm" />
                            <span className="logbook-arrow">→</span>
                          </>
                        ) : (
                          <span className="logbook-new-tag">新增</span>
                        )}
                        <StatusBadge status={entry.toStatus} mediaType={mt} size="sm" />
                      </span>
                      <span className="logbook-entry-time">
                        {new Date(entry.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
