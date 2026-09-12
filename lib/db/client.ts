import 'server-only'

import { SeedStore, type PageStore, type StatusWriter } from './store'
import { SupabaseStore } from './supabase-store'

let cached: PageStore | null = null

/** True when the server has what it needs to talk to Supabase. */
export function hasDatabase(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

/**
 * The page's store. With no credentials the app still runs: it serves the
 * seeded replay days from git and reports that nothing live has been read.
 */
export function getStore(): PageStore {
  if (cached) return cached
  cached = hasDatabase()
    ? new SupabaseStore(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    : new SeedStore()
  return cached
}

/** The writer for the refresh route, or null when there is no database to write to. */
export function getWriter(): (PageStore & StatusWriter) | null {
  const store = getStore()
  return store instanceof SupabaseStore ? store : null
}
