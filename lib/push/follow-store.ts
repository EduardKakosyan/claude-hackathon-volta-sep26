/**
 * The follow port: the one place a browser's anonymous push subscription and
 * the beach ids it follows are kept. Two adapters, chosen once by env in
 * lib/db/client.ts — Supabase with credentials (supabase-follow-store.ts), an
 * in-memory map without (memory-follow-store.ts) so fixture mode can exercise
 * the bell end to end — and no other way to reach the tables.
 */

/** What `PushSubscription.toJSON()` yields once the two keys are known to be present. */
export interface PushSubscriptionInput {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/** One (subscription, beach) pair: everything a send needs. */
export interface Follower extends PushSubscriptionInput {
  beachId: string
}

export interface FollowStore {
  /** Stores the subscription (idempotent) and the follow (idempotent). */
  subscribe(subscription: PushSubscriptionInput, beachId: string): Promise<void>
  /** Drops the follow; when it was the subscription's last, drops the subscription too. Unknown pairs are a no-op. */
  unsubscribe(endpoint: string, beachId: string): Promise<void>
  /** Every follower of any of the beaches, one entry per (subscription, beach). */
  followersOf(beachIds: readonly string[]): Promise<Follower[]>
  /** Drops the subscription and all of its follows: the push service said it is gone. */
  remove(endpoint: string): Promise<void>
}

/**
 * The shape the follow route accepts, checked field by field: an https
 * endpoint and two non-empty key strings. Everything else a browser puts in
 * `toJSON()` (`expirationTime`) is ignored.
 */
export function parseSubscription(value: unknown): PushSubscriptionInput | null {
  if (!value || typeof value !== 'object') return null
  const { endpoint, keys } = value as { endpoint?: unknown; keys?: unknown }
  if (typeof endpoint !== 'string' || !isHttpsUrl(endpoint)) return null
  if (!keys || typeof keys !== 'object') return null
  const { p256dh, auth } = keys as { p256dh?: unknown; auth?: unknown }
  if (typeof p256dh !== 'string' || p256dh.length === 0) return null
  if (typeof auth !== 'string' || auth.length === 0) return null
  return { endpoint, keys: { p256dh, auth } }
}

export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}
