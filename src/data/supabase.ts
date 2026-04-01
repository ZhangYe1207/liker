import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { Item, Category, LogbookEntry, ItemStatus } from '../types'
import type { DataLayer } from './index'

function toItem(row: any): Item {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    rating: row.rating ?? 0,
    categoryId: row.category_id,
    createdAt: new Date(row.created_at).getTime(),
    status: row.status ?? 'completed',
    coverUrl: row.cover_url ?? undefined,
    year: row.year ?? undefined,
    genre: row.genre ?? undefined,
    externalId: row.external_id ?? undefined,
    source: row.source ?? undefined,
    review: row.review ?? undefined,
    metadata: row.metadata ?? undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : undefined,
  }
}

function toRow(item: Item, userId: string) {
  return {
    id: item.id,
    user_id: userId,
    title: item.title,
    description: item.description,
    rating: item.rating,
    category_id: item.categoryId,
    status: item.status ?? 'completed',
    cover_url: item.coverUrl ?? null,
    year: item.year ?? null,
    genre: item.genre ?? null,
    external_id: item.externalId ?? null,
    source: item.source ?? null,
    review: item.review ?? '',
    metadata: item.metadata ?? {},
    created_at: new Date(item.createdAt).toISOString(),
    updated_at: new Date(item.updatedAt ?? item.createdAt).toISOString(),
  }
}

function toCategory(row: any): Category {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
  }
}

function toLogEntry(row: any): LogbookEntry {
  return {
    id: row.id,
    itemId: row.item_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    createdAt: new Date(row.created_at).getTime(),
  }
}

export class SupabaseDataLayer implements DataLayer {
  constructor(
    private supabase: SupabaseClient,
    private user: User,
  ) {}

  async getItems(): Promise<Item[]> {
    const { data, error } = await this.supabase
      .from('items')
      .select('*')
      .eq('user_id', this.user.id)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(toItem)
  }

  async getCategories(): Promise<Category[]> {
    const { data, error } = await this.supabase
      .from('categories')
      .select('*')
      .eq('user_id', this.user.id)
      .order('sort_order', { ascending: true })
    if (error) throw error
    return (data ?? []).map(toCategory)
  }

  async saveItem(item: Item): Promise<void> {
    const { error } = await this.supabase
      .from('items')
      .upsert(toRow(item, this.user.id))
    if (error) throw error
  }

  async deleteItem(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('items')
      .delete()
      .eq('id', id)
      .eq('user_id', this.user.id)
    if (error) throw error
  }

  async saveCategory(category: Category): Promise<void> {
    const { error } = await this.supabase
      .from('categories')
      .upsert({
        id: category.id,
        user_id: this.user.id,
        name: category.name,
        icon: category.icon,
      })
    if (error) {
      if (error.code === '23505') throw new Error('分类名称已存在')
      throw error
    }
  }

  async deleteCategory(id: string): Promise<void> {
    // Delete associated items first to avoid orphaned rows
    const { error: itemsError } = await this.supabase
      .from('items')
      .delete()
      .eq('category_id', id)
      .eq('user_id', this.user.id)
    if (itemsError) throw itemsError

    const { error } = await this.supabase
      .from('categories')
      .delete()
      .eq('id', id)
      .eq('user_id', this.user.id)
    if (error) throw error
  }

  async addLogEntry(entry: LogbookEntry): Promise<void> {
    const { error } = await this.supabase
      .from('logbook_entries')
      .insert({
        id: entry.id,
        user_id: this.user.id,
        item_id: entry.itemId,
        from_status: entry.fromStatus,
        to_status: entry.toStatus,
      })
    if (error) throw error
  }

  async getLogEntries(filters?: { categoryId?: string; status?: ItemStatus }): Promise<LogbookEntry[]> {
    let query = this.supabase
      .from('logbook_entries')
      .select('*, items!inner(category_id)')
      .eq('user_id', this.user.id)
      .order('created_at', { ascending: false })

    if (filters?.status) {
      query = query.eq('to_status', filters.status)
    }
    if (filters?.categoryId) {
      query = query.eq('items.category_id', filters.categoryId)
    }

    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map(toLogEntry)
  }

  async bulkSaveItems(items: Item[]): Promise<void> {
    const rows = items.map(i => toRow(i, this.user.id))
    const { error } = await this.supabase
      .from('items')
      .upsert(rows)
    if (error) throw error
  }

  async bulkSaveCategories(categories: Category[]): Promise<void> {
    const rows = categories.map(c => ({
      id: c.id,
      user_id: this.user.id,
      name: c.name,
      icon: c.icon,
    }))
    const { error } = await this.supabase
      .from('categories')
      .upsert(rows)
    if (error) {
      if (error.code === '23505') throw new Error('分类名称已存在')
      throw error
    }
  }
}
