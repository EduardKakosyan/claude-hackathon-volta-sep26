import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type { Follower, FollowStore, PushSubscriptionInput } from './follow-store'

/** Row shapes as supabase/migrations/20260914000100_push.sql declares them. */
interface PushSubscriptionRow {
  endpoint: string
  p256dh: string
  auth: string
}

interface FollowJoinRow {
  beach_id: string
  push_subscription: PushSubscriptionRow | PushSubscriptionRow[] | null
}

function fail(op: string, error: { message: string } | null): never {
  throw new Error(`supabase ${op}: ${error?.message ?? 'unknown error'}`)
}

/**
 * The follow tables through the service-role key. Server-only: the browser
 * only ever talks to /api/follow, never to Supabase.
 */
export class SupabaseFollowStore implements FollowStore {
  private readonly db: SupabaseClient

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }

  async subscribe(subscription: PushSubscriptionInput, beachId: string): Promise<void> {
    const row: PushSubscriptionRow = {
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    }
    const sub = await this.db.from('push_subscription').upsert(row, { onConflict: 'endpoint' })
    if (sub.error) fail('push_subscription upsert', sub.error)
    const follow = await this.db
      .from('follow')
      .upsert({ endpoint: subscription.endpoint, beach_id: beachId }, { onConflict: 'endpoint,beach_id' })
    if (follow.error) fail('follow upsert', follow.error)
  }

  async unsubscribe(endpoint: string, beachId: string): Promise<void> {
    const del = await this.db.from('follow').delete().eq('endpoint', endpoint).eq('beach_id', beachId)
    if (del.error) fail('follow delete', del.error)
    const left = await this.db.from('follow').select('beach_id', { count: 'exact', head: true }).eq('endpoint', endpoint)
    if (left.error) fail('follow count', left.error)
    if ((left.count ?? 0) === 0) await this.remove(endpoint)
  }

  async followersOf(beachIds: readonly string[]): Promise<Follower[]> {
    if (beachIds.length === 0) return []
    const { data, error } = await this.db
      .from('follow')
      .select('beach_id, push_subscription (endpoint, p256dh, auth)')
      .in('beach_id', [...beachIds])
    if (error) fail('follow select', error)
    const out: Follower[] = []
    for (const r of (data ?? []) as FollowJoinRow[]) {
      const sub = Array.isArray(r.push_subscription) ? r.push_subscription[0] : r.push_subscription
      if (!sub) continue
      out.push({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth }, beachId: r.beach_id })
    }
    return out
  }

  async remove(endpoint: string): Promise<void> {
    // The follow rows go with it: `on delete cascade` in the migration.
    const { error } = await this.db.from('push_subscription').delete().eq('endpoint', endpoint)
    if (error) fail('push_subscription delete', error)
  }
}
