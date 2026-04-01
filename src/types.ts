export type ItemStatus = 'want' | 'in_progress' | 'completed' | 'dropped'

export interface Item {
  id: string
  title: string
  description: string
  rating: number
  categoryId: string
  createdAt: number
  // v1.0 fields (optional for backward compat with existing localStorage data)
  status?: ItemStatus
  coverUrl?: string
  year?: string
  genre?: string
  externalId?: string
  source?: string
  review?: string
  metadata?: Record<string, unknown>
  updatedAt?: number
}

export interface Category {
  id: string
  name: string
  icon: string
}

export interface AppData {
  items: Item[]
  categories: Category[]
}

export interface LogbookEntry {
  id: string
  itemId: string
  fromStatus: ItemStatus | null
  toStatus: ItemStatus
  createdAt: number
}
