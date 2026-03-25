import type { AppData, Category, Item } from './types'

const KEY = 'liker_data'

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

export function loadData(): AppData {
  const raw = localStorage.getItem(KEY)
  if (!raw) return { items: defaultItems, categories: defaultCategories }
  try {
    return JSON.parse(raw) as AppData
  } catch {
    return { items: defaultItems, categories: defaultCategories }
  }
}

export function saveData(data: AppData): void {
  localStorage.setItem(KEY, JSON.stringify(data))
}
