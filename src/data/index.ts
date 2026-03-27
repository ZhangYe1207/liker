import type { Session } from '@supabase/supabase-js'
import type { Item, Category, LogbookEntry, ItemStatus } from '../types'
import { LocalStorageDataLayer } from './localStorage'
import { SupabaseDataLayer } from './supabase'
import { supabase } from '../lib/supabase'

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

export function createDataLayer(session?: Session | null): DataLayer {
  if (session?.user && supabase) {
    return new SupabaseDataLayer(supabase, session.user)
  }
  return new LocalStorageDataLayer()
}
