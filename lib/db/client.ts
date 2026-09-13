import 'server-only'

import type { FollowStore } from '@/lib/push/follow-store'
import { MemoryFollowStore } from '@/lib/push/memory-follow-store'
import { SupabaseFollowStore } from '@/lib/push/supabase-follow-store'

import { FixtureStore } from './fixture-store'
import type { PageStore, StatusWriter } from './store'
import { SupabaseStore } from './supabase-store'

let cached: PageStore | null = null
let cachedFollow: FollowStore | null = null

function refuseFixtureInProduction(): void {
  if (process.env.VERCEL_ENV === 'production') {
    throw new Error(
      'production has no database: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the Vercel project',
    )
  }
}

/** True when the server has what it needs to talk to Supabase. */
export function hasDatabase(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

/**
 * The page's store. With credentials it reads Supabase. Without them it serves
 * the fixture day so a fresh clone, the Playwright suite and CI all see realistic
 * statuses — except in production, which must never pass a fixture off as live:
 * there the first request fails loudly instead of rendering 35 unknowns.
 */
export function getStore(): PageStore {
  if (cached) return cached
  if (hasDatabase()) {
    cached = new SupabaseStore(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    return cached
  }
  refuseFixtureInProduction()
  cached = new FixtureStore()
  return cached
}

/**
 * Where follows live: the Supabase tables with credentials, a map in this
 * process without them — so fixture mode's bell subscribes for real and the
 * rig can drive it — and, like the page store, never a fixture in production.
 */
export function getFollowStore(): FollowStore {
  if (cachedFollow) return cachedFollow
  if (hasDatabase()) {
    cachedFollow = new SupabaseFollowStore(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    return cachedFollow
  }
  refuseFixtureInProduction()
  cachedFollow = new MemoryFollowStore()
  return cachedFollow
}

/** The writer for the refresh route, or null when there is no database to write to. */
export function getWriter(): (PageStore & StatusWriter) | null {
  const store = getStore()
  return store instanceof SupabaseStore ? store : null
}
