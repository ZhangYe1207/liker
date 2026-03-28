import type { Item, Category, ItemStatus } from '../types'

export type TimeRange = '30d' | 'month' | 'year' | 'all'

export interface TimelinePoint {
  label: string
  count: number
}

export interface CategoryDistItem {
  name: string
  icon: string
  count: number
  percentage: number
}

export interface RatingDistItem {
  stars: number
  count: number
}

export interface StatusDistItem {
  status: ItemStatus
  count: number
  label: string
}

export interface HeroMetrics {
  totalItems: number
  completedCount: number
  avgRating: string
  topCategory: { icon: string; name: string } | null
}

export interface Highlight {
  icon: string
  title: string
  value: string
}

// ── Time range helpers ──

function getRangeStart(range: TimeRange): number {
  const now = new Date()
  switch (range) {
    case '30d':
      return now.getTime() - 30 * 24 * 60 * 60 * 1000
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    case 'year':
      return new Date(now.getFullYear(), 0, 1).getTime()
    case 'all':
      return 0
  }
}

export function filterByTimeRange<T extends { createdAt: number }>(data: T[], range: TimeRange): T[] {
  if (range === 'all') return data
  const start = getRangeStart(range)
  return data.filter(d => d.createdAt >= start)
}

// ── Timeline aggregation ──

function formatDay(ts: number): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function formatMonth(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}/${d.getMonth() + 1}`
}

export function computeTimeline(items: Item[], range: TimeRange): TimelinePoint[] {
  if (items.length === 0) return []

  const useDaily = range === '30d' || range === 'month'

  const buckets = new Map<string, number>()

  if (useDaily) {
    // Fill all days in range
    const start = getRangeStart(range)
    const now = Date.now()
    for (let t = start; t <= now; t += 24 * 60 * 60 * 1000) {
      buckets.set(formatDay(t), 0)
    }
    for (const item of items) {
      const key = formatDay(item.createdAt)
      buckets.set(key, (buckets.get(key) ?? 0) + 1)
    }
  } else {
    // Monthly aggregation
    for (const item of items) {
      const key = formatMonth(item.createdAt)
      buckets.set(key, (buckets.get(key) ?? 0) + 1)
    }
  }

  const result = Array.from(buckets.entries()).map(([label, count]) => ({ label, count }))

  // Sort monthly buckets chronologically (daily buckets are already ordered by pre-fill)
  if (!useDaily) {
    result.sort((a, b) => {
      const [ay, am] = a.label.split('/').map(Number)
      const [by, bm] = b.label.split('/').map(Number)
      return ay !== by ? ay - by : am - bm
    })
  }

  return result
}

// ── Distribution computations ──

export function computeCategoryDistribution(items: Item[], categories: Category[]): CategoryDistItem[] {
  const total = items.length
  if (total === 0) return []

  const countMap = new Map<string, number>()
  for (const item of items) {
    countMap.set(item.categoryId, (countMap.get(item.categoryId) ?? 0) + 1)
  }

  return categories
    .filter(c => (countMap.get(c.id) ?? 0) > 0)
    .map(c => {
      const count = countMap.get(c.id) ?? 0
      return { name: c.name, icon: c.icon, count, percentage: Math.round((count / total) * 100) }
    })
    .sort((a, b) => b.count - a.count)
}

export function computeRatingDistribution(items: Item[]): RatingDistItem[] {
  const counts = [0, 0, 0, 0, 0]
  for (const item of items) {
    if (item.rating >= 1 && item.rating <= 5) {
      counts[item.rating - 1]++
    }
  }
  return counts.map((count, i) => ({ stars: i + 1, count }))
}

export function computeStatusDistribution(items: Item[]): StatusDistItem[] {
  const labels: Record<string, string> = {
    want: '想要',
    in_progress: '进行中',
    completed: '已完成',
    dropped: '搁置',
  }

  const countMap = new Map<string, number>()
  for (const item of items) {
    const s = item.status ?? 'completed'
    countMap.set(s, (countMap.get(s) ?? 0) + 1)
  }

  const statuses: (ItemStatus)[] = ['completed', 'in_progress', 'want', 'dropped']
  return statuses
    .filter(s => (countMap.get(s) ?? 0) > 0)
    .map(s => ({ status: s, count: countMap.get(s) ?? 0, label: labels[s] }))
}

// ── Hero metrics ──

export function computeHeroMetrics(items: Item[], categories: Category[]): HeroMetrics {
  const totalItems = items.length
  const completedCount = items.filter(i => (i.status ?? 'completed') === 'completed').length
  const rated = items.filter(i => i.rating > 0)
  const avgRating = rated.length > 0
    ? (rated.reduce((s, i) => s + i.rating, 0) / rated.length).toFixed(1)
    : '—'

  const catCount = new Map<string, number>()
  for (const item of items) {
    catCount.set(item.categoryId, (catCount.get(item.categoryId) ?? 0) + 1)
  }
  const topCatId = [...catCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const topCat = categories.find(c => c.id === topCatId)

  return {
    totalItems,
    completedCount,
    avgRating,
    topCategory: topCat ? { icon: topCat.icon, name: topCat.name } : null,
  }
}

// ── Highlights ──

export function computeHighlights(items: Item[], categories: Category[]): Highlight[] {
  const highlights: Highlight[] = []
  if (items.length === 0) return highlights

  // Total items
  highlights.push({ icon: '📊', title: '总记录数', value: `${items.length} 条` })

  // Highest rated item
  const rated = items.filter(i => i.rating > 0)
  if (rated.length > 0) {
    const best = rated.reduce((a, b) => a.rating >= b.rating ? a : b)
    highlights.push({ icon: '⭐', title: '最高评分', value: `${best.title}（${best.rating} 星）` })
  }

  // Average rating
  if (rated.length > 0) {
    const avg = rated.reduce((s, i) => s + i.rating, 0) / rated.length
    highlights.push({ icon: '📈', title: '平均评分', value: `${avg.toFixed(1)} 星` })
  }

  // Most active category
  const catCount = new Map<string, number>()
  for (const item of items) {
    catCount.set(item.categoryId, (catCount.get(item.categoryId) ?? 0) + 1)
  }
  const topCatId = [...catCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const topCat = categories.find(c => c.id === topCatId)
  if (topCat) {
    highlights.push({ icon: topCat.icon, title: '最活跃分类', value: `${topCat.name}（${catCount.get(topCatId)} 条）` })
  }

  // Most active month
  const monthCount = new Map<string, number>()
  for (const item of items) {
    const d = new Date(item.createdAt)
    const key = `${d.getFullYear()}年${d.getMonth() + 1}月`
    monthCount.set(key, (monthCount.get(key) ?? 0) + 1)
  }
  const topMonth = [...monthCount.entries()].sort((a, b) => b[1] - a[1])[0]
  if (topMonth) {
    highlights.push({ icon: '📅', title: '最活跃月份', value: `${topMonth[0]}（${topMonth[1]} 条）` })
  }

  // Completed count
  const completed = items.filter(i => (i.status ?? 'completed') === 'completed')
  if (completed.length > 0) {
    highlights.push({ icon: '✅', title: '已完成', value: `${completed.length} 条` })
  }

  return highlights
}
