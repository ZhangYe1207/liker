import { useState, useEffect, useMemo } from 'react'
import type { Item, Category, LogbookEntry } from '../types'
import type { DataLayer } from '../data'
import {
  type TimeRange,
  filterByTimeRange,
  computeTimeline,
  computeCategoryDistribution,
  computeRatingDistribution,
  computeStatusDistribution,
  computeHighlights,
} from '../utils/stats'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts'

interface Props {
  dataLayer: DataLayer
  items: Item[]
  categories: Category[]
}

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: '30d', label: '近 30 天' },
  { value: 'month', label: '本月' },
  { value: 'year', label: '本年' },
  { value: 'all', label: '全部' },
]

// Chart color palette derived from the design system
const CATEGORY_COLORS = [
  '#ff6b6b', '#a855f7', '#f59e0b', '#3b82f6', '#10b981',
  '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#6366f1',
]

const STATUS_COLORS: Record<string, string> = {
  want: '#3b82f6',
  in_progress: '#eab308',
  completed: '#22c55e',
  dropped: '#78716c',
}

const RATING_COLOR = '#f59e0b'

export default function StatsView({ dataLayer, items, categories }: Props) {
  const [timeRange, setTimeRange] = useState<TimeRange>('all')
  const [_entries, setEntries] = useState<LogbookEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    dataLayer.getLogEntries()
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [dataLayer])

  const filteredItems = useMemo(() => filterByTimeRange(items, timeRange), [items, timeRange])

  const timeline = useMemo(() => computeTimeline(filteredItems, timeRange), [filteredItems, timeRange])
  const categoryDist = useMemo(() => computeCategoryDistribution(filteredItems, categories), [filteredItems, categories])
  const ratingDist = useMemo(() => computeRatingDistribution(filteredItems), [filteredItems])
  const statusDist = useMemo(() => computeStatusDistribution(filteredItems), [filteredItems])
  const highlights = useMemo(() => computeHighlights(filteredItems, categories), [filteredItems, categories])

  // Hero metrics
  const totalItems = filteredItems.length
  const completedCount = filteredItems.filter(i => (i.status ?? 'completed') === 'completed').length
  const rated = filteredItems.filter(i => i.rating > 0)
  const avgRating = rated.length > 0 ? (rated.reduce((s, i) => s + i.rating, 0) / rated.length).toFixed(1) : '—'

  const catCount = new Map<string, number>()
  for (const item of filteredItems) {
    catCount.set(item.categoryId, (catCount.get(item.categoryId) ?? 0) + 1)
  }
  const topCatId = [...catCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const topCat = categories.find(c => c.id === topCatId)

  if (loading) {
    return <div className="stats-view"><div className="stats-empty">加载中…</div></div>
  }

  return (
    <div className="stats-view">
      <div className="stats-header">
        <h2 className="stats-title">数据统计</h2>
        <div className="stats-time-filter">
          {TIME_RANGES.map(r => (
            <button
              key={r.value}
              className={`pill ${timeRange === r.value ? 'active' : ''}`}
              onClick={() => setTimeRange(r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Hero metrics */}
      <div className="stats-hero">
        <div className="stats-hero-card">
          <span className="stats-hero-value">{totalItems}</span>
          <span className="stats-hero-label">总条目</span>
        </div>
        <div className="stats-hero-card">
          <span className="stats-hero-value">{completedCount}</span>
          <span className="stats-hero-label">已完成</span>
        </div>
        <div className="stats-hero-card">
          <span className="stats-hero-value">{avgRating}</span>
          <span className="stats-hero-label">平均评分</span>
        </div>
        <div className="stats-hero-card">
          <span className="stats-hero-value">{topCat ? `${topCat.icon} ${topCat.name}` : '—'}</span>
          <span className="stats-hero-label">最活跃分类</span>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="stats-empty">该时间范围内暂无数据</div>
      ) : (
        <>
          {/* Activity timeline */}
          {timeline.length > 1 && (
            <div className="stats-card">
              <h3 className="stats-card-title">添加趋势</h3>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={timeline} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#ff6b6b" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#a855f7" stopOpacity={0.3} />
                    </linearGradient>
                    <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#ff6b6b" />
                      <stop offset="100%" stopColor="#a855f7" />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#9993a8' }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#9993a8' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#fff',
                      border: '1px solid rgba(0,0,0,0.08)',
                      borderRadius: 10,
                      fontFamily: 'Outfit, sans-serif',
                      fontSize: 13,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="url(#lineGrad)"
                    strokeWidth={2.5}
                    fill="url(#areaGrad)"
                    animationDuration={1200}
                    name="添加数"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Distribution charts */}
          <div className="stats-charts-row">
            {/* Category distribution */}
            {categoryDist.length > 0 && (
              <div className="stats-card stats-card-chart">
                <h3 className="stats-card-title">分类分布</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={categoryDist}
                      dataKey="count"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={3}
                      animationDuration={1000}
                    >
                      {categoryDist.map((_, i) => (
                        <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => [`${value} 条`, String(name)]}
                      contentStyle={{
                        background: '#fff',
                        border: '1px solid rgba(0,0,0,0.08)',
                        borderRadius: 10,
                        fontFamily: 'Outfit, sans-serif',
                        fontSize: 13,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="stats-legend">
                  {categoryDist.map((d, i) => (
                    <span key={d.name} className="stats-legend-item">
                      <span className="stats-legend-dot" style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                      {d.icon} {d.name} ({d.percentage}%)
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Rating distribution */}
            <div className="stats-card stats-card-chart">
              <h3 className="stats-card-title">评分分布</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={ratingDist} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                  <XAxis
                    dataKey="stars"
                    tick={{ fontSize: 12, fill: '#9993a8' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v}★`}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#9993a8' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    formatter={(value) => [`${value} 条`, '数量']}
                    contentStyle={{
                      background: '#fff',
                      border: '1px solid rgba(0,0,0,0.08)',
                      borderRadius: 10,
                      fontFamily: 'Outfit, sans-serif',
                      fontSize: 13,
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill={RATING_COLOR}
                    radius={[6, 6, 0, 0]}
                    animationDuration={1000}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Status distribution */}
          {statusDist.length > 0 && (
            <div className="stats-card">
              <h3 className="stats-card-title">状态分布</h3>
              <div className="stats-status-bars">
                {statusDist.map(d => {
                  const pct = Math.round((d.count / filteredItems.length) * 100)
                  return (
                    <div key={d.status} className="stats-status-row">
                      <span className="stats-status-label">{d.label}</span>
                      <div className="stats-status-bar-track">
                        <div
                          className="stats-status-bar-fill"
                          style={{ width: `${pct}%`, background: STATUS_COLORS[d.status] }}
                        />
                      </div>
                      <span className="stats-status-count">{d.count}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Personal highlights */}
          {highlights.length > 0 && (
            <div className="stats-highlights">
              {highlights.map((h, i) => (
                <div key={h.title} className="stats-highlight-card" style={{ animationDelay: `${i * 80}ms` }}>
                  <span className="stats-highlight-icon">{h.icon}</span>
                  <span className="stats-highlight-title">{h.title}</span>
                  <span className="stats-highlight-value">{h.value}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
