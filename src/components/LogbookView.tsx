import { useState, useEffect } from 'react'
import type { LogbookEntry, Item, Category, ItemStatus } from '../types'
import type { DataLayer } from '../data'
import StatusBadge from './StatusBadge'

interface Props {
  dataLayer: DataLayer
  items: Item[]
  categories: Category[]
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
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
  const grouped = groupByDate(entries)

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
            <option value="want">想看</option>
            <option value="in_progress">在看</option>
            <option value="completed">看过</option>
            <option value="dropped">搁置</option>
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
                return (
                  <div key={entry.id} className="logbook-entry">
                    <div className="logbook-entry-dot" />
                    <div className="logbook-entry-content">
                      <span className="logbook-entry-title">{item?.title ?? '已删除的记录'}</span>
                      <span className="logbook-entry-change">
                        {entry.fromStatus ? (
                          <>
                            <StatusBadge status={entry.fromStatus} size="sm" />
                            <span className="logbook-arrow">→</span>
                          </>
                        ) : (
                          <span className="logbook-new-tag">新增</span>
                        )}
                        <StatusBadge status={entry.toStatus} size="sm" />
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
