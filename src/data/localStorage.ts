import type { Item, Category, LogbookEntry, ItemStatus } from '../types'
import type { DataLayer } from './index'

const DATA_KEY = 'liker_data'
const LOGBOOK_KEY = 'liker_logbook'

const defaultCategories: Category[] = [
  { id: 'books', name: '书籍', icon: '📖' },
  { id: 'movies', name: '电影', icon: '🎬' },
  { id: 'music', name: '音乐', icon: '🎵' },
]

const defaultItems: Item[] = [
  { id: '1', title: '百年孤独', description: '魔幻现实主义的巅峰之作，讲述了布恩迪亚家族七代人的传奇故事。', rating: 5, categoryId: 'books', createdAt: Date.now() - 3000 },
  { id: '2', title: '人类简史', description: '从认知革命到农业革命，再到科学革命，重新认识人类的历史。', rating: 4, categoryId: 'books', createdAt: Date.now() - 2000 },
  { id: '3', title: '星际穿越', description: '一部关于爱与时间、物理与亲情的科幻史诗。配乐极其震撼。', rating: 5, categoryId: 'movies', createdAt: Date.now() - 1000 },
  { id: '4', title: '肖申克的救赎', description: '希望是美好的事物，也许是世上最美好的事物。', rating: 5, categoryId: 'movies', createdAt: Date.now() },
]

function normalizeItem(item: Item): Item {
  return {
    ...item,
    status: item.status ?? 'completed',
    updatedAt: item.updatedAt ?? item.createdAt,
  }
}

function loadRaw(): { items: Item[]; categories: Category[] } {
  const raw = localStorage.getItem(DATA_KEY)
  if (!raw) return { items: defaultItems, categories: defaultCategories }
  try {
    const data = JSON.parse(raw) as { items: Item[]; categories: Category[] }
    return {
      items: data.items.map(normalizeItem),
      categories: data.categories,
    }
  } catch {
    return { items: defaultItems, categories: defaultCategories }
  }
}

function saveRaw(items: Item[], categories: Category[]): void {
  localStorage.setItem(DATA_KEY, JSON.stringify({ items, categories }))
}

function loadLogbook(): LogbookEntry[] {
  const raw = localStorage.getItem(LOGBOOK_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as LogbookEntry[]
  } catch {
    return []
  }
}

function saveLogbook(entries: LogbookEntry[]): void {
  localStorage.setItem(LOGBOOK_KEY, JSON.stringify(entries))
}

export class LocalStorageDataLayer implements DataLayer {
  async getItems(): Promise<Item[]> {
    return loadRaw().items
  }

  async getCategories(): Promise<Category[]> {
    return loadRaw().categories
  }

  async saveItem(item: Item): Promise<void> {
    const { items, categories } = loadRaw()
    const idx = items.findIndex(i => i.id === item.id)
    if (idx >= 0) {
      items[idx] = normalizeItem(item)
    } else {
      items.push(normalizeItem(item))
    }
    saveRaw(items, categories)
  }

  async deleteItem(id: string): Promise<void> {
    const { items, categories } = loadRaw()
    saveRaw(items.filter(i => i.id !== id), categories)
  }

  async saveCategory(category: Category): Promise<void> {
    const { items, categories } = loadRaw()
    const idx = categories.findIndex(c => c.id === category.id)
    if (idx >= 0) {
      categories[idx] = category
    } else {
      categories.push(category)
    }
    saveRaw(items, categories)
  }

  async deleteCategory(id: string): Promise<void> {
    const { items, categories } = loadRaw()
    saveRaw(items.filter(i => i.categoryId !== id), categories.filter(c => c.id !== id))
  }

  async addLogEntry(entry: LogbookEntry): Promise<void> {
    const entries = loadLogbook()
    entries.push(entry)
    saveLogbook(entries)
  }

  async getLogEntries(filters?: { categoryId?: string; status?: ItemStatus }): Promise<LogbookEntry[]> {
    let entries = loadLogbook()
    if (filters?.status) {
      entries = entries.filter(e => e.toStatus === filters.status)
    }
    if (filters?.categoryId) {
      const { items } = loadRaw()
      const itemIds = new Set(items.filter(i => i.categoryId === filters.categoryId).map(i => i.id))
      entries = entries.filter(e => itemIds.has(e.itemId))
    }
    return entries.sort((a, b) => b.createdAt - a.createdAt)
  }

  async bulkSaveItems(items: Item[]): Promise<void> {
    const data = loadRaw()
    const existing = new Map(data.items.map(i => [i.id, i]))
    for (const item of items) {
      existing.set(item.id, normalizeItem(item))
    }
    saveRaw([...existing.values()], data.categories)
  }

  async bulkSaveCategories(categories: Category[]): Promise<void> {
    const data = loadRaw()
    const existing = new Map(data.categories.map(c => [c.id, c]))
    for (const cat of categories) {
      existing.set(cat.id, cat)
    }
    saveRaw(data.items, [...existing.values()])
  }
}
