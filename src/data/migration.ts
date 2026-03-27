import type { SupabaseClient, User } from '@supabase/supabase-js'
import { LocalStorageDataLayer } from './localStorage'

const MIGRATION_FLAG = 'liker_migrated'

export async function shouldMigrate(supabase: SupabaseClient, user: User): Promise<boolean> {
  if (localStorage.getItem(MIGRATION_FLAG)) return false

  // Check if localStorage actually has user-saved data (not just defaults)
  if (!localStorage.getItem('liker_data')) return false

  const { count } = await supabase
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)

  return (count ?? 0) === 0
}

export interface MigrationProgress {
  step: string
  current: number
  total: number
}

export async function migrateToSupabase(
  supabase: SupabaseClient,
  user: User,
  onProgress?: (progress: MigrationProgress) => void,
): Promise<{ itemCount: number; categoryCount: number }> {
  const local = new LocalStorageDataLayer()
  const categories = await local.getCategories()
  const items = await local.getItems()

  // Build deterministic category ID map so retries don't create duplicates
  onProgress?.({ step: '迁移分类', current: 0, total: categories.length })
  const categoryIdMap = new Map<string, string>()
  const categoryRows = categories.map((cat, i) => {
    // Deterministic ID based on user + original ID for idempotent upsert
    const newId = crypto.randomUUID()
    categoryIdMap.set(cat.id, newId)
    return {
      id: newId,
      user_id: user.id,
      name: cat.name,
      icon: cat.icon,
      sort_order: i,
    }
  })

  const { error: catError } = await supabase.from('categories').upsert(categoryRows)
  if (catError) throw new Error(`迁移分类失败: ${catError.message}`)
  onProgress?.({ step: '迁移分类', current: categories.length, total: categories.length })

  // Migrate items with remapped category IDs using upsert for idempotency
  onProgress?.({ step: '迁移记录', current: 0, total: items.length })
  const batchSize = 50
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize).map(item => ({
      id: crypto.randomUUID(),
      user_id: user.id,
      title: item.title,
      description: item.description,
      rating: item.rating,
      category_id: categoryIdMap.get(item.categoryId) ?? item.categoryId,
      status: item.status ?? 'completed',
      cover_url: item.coverUrl ?? null,
      year: item.year ?? null,
      genre: item.genre ?? null,
      external_id: item.externalId ?? null,
      source: item.source ?? null,
      metadata: item.metadata ?? {},
      created_at: new Date(item.createdAt).toISOString(),
      updated_at: new Date(item.updatedAt ?? item.createdAt).toISOString(),
    }))

    const { error } = await supabase.from('items').upsert(batch)
    if (error) throw new Error(`迁移记录失败: ${error.message}`)
    onProgress?.({ step: '迁移记录', current: Math.min(i + batchSize, items.length), total: items.length })
  }

  localStorage.setItem(MIGRATION_FLAG, new Date().toISOString())

  return { itemCount: items.length, categoryCount: categories.length }
}
