import { pushPayload, type PushPayload } from '@/lib/copy'
import type { StatusTransition } from '@/lib/ingest/refresh-live'
import { BEACHES, type Beach } from '@/lib/seed/beaches'
import { buildHref } from '@/lib/url-state'

import type { FollowStore, PushSubscriptionInput } from './follow-store'

/** A push-service refusal, carrying the status code the service answered with. */
export class PushSendError extends Error {
  constructor(
    message: string,
    readonly statusCode: number | null,
  ) {
    super(message)
    this.name = 'PushSendError'
  }
}

/** The one call the send needs: web-push behind it in production (lib/push/server.ts), a fake in tests. */
export interface PushSender {
  send(subscription: PushSubscriptionInput, payload: string): Promise<void>
}

/** What the service worker receives, as JSON. `url` is where a tap goes. */
export interface PushMessage extends PushPayload {
  url: string
}

export interface SendTransitionsDeps {
  transitions: readonly StatusTransition[]
  store: FollowStore
  /** Null when there are no VAPID keys to sign with: nothing is sent, and the result says so. */
  sender: PushSender | null
  roster?: readonly Beach[]
  now?: () => Date
  log?: (message: string, detail?: unknown) => void
}

export interface PushResult {
  /** Notifications the push service accepted. */
  sent: number
  /** Subscriptions dropped because the service said they are gone (404 / 410). */
  removed: number
  /** Sends the service refused for any other reason; the subscription is kept. */
  failed: number
  /** Why nothing was attempted, when nothing was. */
  skipped?: string
}

/** The push service's two ways of saying a subscription no longer exists. */
const GONE = new Set([404, 410])

export function pushMessage(beach: Pick<Beach, 'id' | 'name' | 'authority'>, transition: StatusTransition, now: Date): PushMessage {
  return { ...pushPayload(beach, transition.status, now), url: buildHref({ beach: beach.id }) }
}

/**
 * The fourth stage of the refresh: one notification per follower per beach
 * that changed state this run, in the words lib/copy builds from the row. A
 * 404 or 410 from the push service deletes that subscription — the browser is
 * gone — and every other failure is logged and counted, never thrown: a push
 * problem can never fail the status write that ran before it.
 */
export async function sendTransitions(deps: SendTransitionsDeps): Promise<PushResult> {
  const { transitions, store, sender, roster = BEACHES, log } = deps
  const result: PushResult = { sent: 0, removed: 0, failed: 0 }
  if (transitions.length === 0) return result
  if (!sender) {
    result.skipped = 'no VAPID keys configured'
    log?.(`push: ${transitions.length} transition(s) not sent — ${result.skipped}`)
    return result
  }

  const byBeach = new Map(roster.map((beach) => [beach.id, beach]))
  const transitionOf = new Map(transitions.map((t) => [t.beachId, t]))
  const followers = await store.followersOf([...transitionOf.keys()])
  const now = deps.now?.() ?? new Date()
  const gone = new Set<string>()

  for (const follower of followers) {
    if (gone.has(follower.endpoint)) continue
    const transition = transitionOf.get(follower.beachId)
    const beach = byBeach.get(follower.beachId)
    if (!transition || !beach) continue

    const payload = JSON.stringify(pushMessage(beach, transition, now))
    try {
      await sender.send({ endpoint: follower.endpoint, keys: follower.keys }, payload)
      result.sent += 1
    } catch (err) {
      const code = err instanceof PushSendError ? err.statusCode : null
      if (code !== null && GONE.has(code)) {
        gone.add(follower.endpoint)
        try {
          await store.remove(follower.endpoint)
          result.removed += 1
        } catch (removeErr) {
          result.failed += 1
          log?.(`push: could not remove a gone subscription`, removeErr)
        }
        continue
      }
      result.failed += 1
      log?.(`push: send failed for ${follower.beachId}${code === null ? '' : ` (HTTP ${code})`}`, err)
    }
  }

  return result
}
