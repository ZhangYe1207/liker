import type { Item, Category, LogbookEntry, ItemStatus } from '../types'
import { LocalStorageDataLayer } from './localStorage'

export interface DataLayer {
  getItems(): Promise<Item[]>
  getCategories(): Promise<Category[]>
  saveItem(item: Item): Promise<void>
  deleteItem(id: string): Promise<void>
  saveCategory(category: Category): Promise<void>
  deleteCategory(id: string): Promise<void>
  addLogEntry(entry: LogbookEntry): Promise<void>
  getLogEntries(filters?: { categoryId?: string; status?: ItemStatus }): Promise<LogbookEntry[]>
  bulkSaveItems(items: Item[]): Promise<void>
  bulkSaveCategories(categories: Category[]): Promise<void>
}

export function createDataLayer(): DataLayer {
  // Future: return SupabaseDataLayer when session exists
  return new LocalStorageDataLayer()
}
