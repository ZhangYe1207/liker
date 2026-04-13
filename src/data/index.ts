import type { Session } from '@supabase/supabase-js'
import type { Item, Category, LogbookEntry, ItemStatus, Conversation } from '../types'
import type { ChatMessage } from '../services/ai'
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
  // AI chat conversations (login-only)
  listConversations(): Promise<Conversation[]>
  listMessages(conversationId: string): Promise<ChatMessage[]>
  renameConversation(id: string, title: string): Promise<Conversation>
  deleteConversation(id: string): Promise<void>
}

export function createDataLayer(session?: Session | null): DataLayer {
  if (session?.user && supabase) {
    return new SupabaseDataLayer(supabase, session.user)
  }
  return new LocalStorageDataLayer()
}
