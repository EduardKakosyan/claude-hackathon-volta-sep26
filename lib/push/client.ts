import type { PushSubscriptionInput } from './follow-store'

/** The browser's side of /api/follow. Injectable so the hook's tests never fetch. */
export interface FollowClient {
  follow(subscription: PushSubscriptionInput, beachId: string): Promise<void>
  unfollow(endpoint: string, beachId: string): Promise<void>
}

export const FOLLOW_ENDPOINT = '/api/follow'

async function call(fetchImpl: typeof fetch, method: 'POST' | 'DELETE', body: unknown): Promise<void> {
  const res = await fetchImpl(FOLLOW_ENDPOINT, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.status === 204) return
  let detail = ''
  try {
    const json = (await res.json()) as { error?: unknown }
    if (typeof json.error === 'string') detail = json.error
  } catch {
    // no body: the status is the message
  }
  throw new Error(`follow: ${method} answered ${res.status}${detail ? ` — ${detail}` : ''}`)
}

export function createFollowClient(fetchImpl: typeof fetch = (...args) => fetch(...args)): FollowClient {
  return {
    follow: (subscription, beachId) => call(fetchImpl, 'POST', { subscription, beachId }),
    unfollow: (endpoint, beachId) => call(fetchImpl, 'DELETE', { endpoint, beachId }),
  }
}
