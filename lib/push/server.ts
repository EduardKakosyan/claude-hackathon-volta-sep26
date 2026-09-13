import 'server-only'

import webPush, { WebPushError } from 'web-push'

import type { PushSubscriptionInput } from './follow-store'
import { PushSendError, type PushSender } from './send'

/**
 * The VAPID pair that signs every send, and whose public half the browser
 * subscribes with. Real keys come from the environment (VAPID_PUBLIC_KEY,
 * VAPID_PRIVATE_KEY, VAPID_SUBJECT — see .env.example) and are set on the
 * Vercel project, never committed. Without them, anywhere but production, a
 * throwaway pair is generated once per server process so the bell, the
 * subscribe path and a local send all work; its subscriptions are worthless
 * after a restart, which is what a fixture's should be. Production with no
 * keys sends nothing and says so in the refresh response.
 */
export interface VapidDetails {
  subject: string
  publicKey: string
  privateKey: string
}

/** How long the push service may hold a notification for an offline device. One refresh cycle. */
export const PUSH_TTL_SECONDS = 60 * 60

const THROWAWAY_SUBJECT = 'mailto:dev@localhost'
const THROWAWAY = Symbol.for('is-the-beach-open.vapid.throwaway')

type WithThrowaway = typeof globalThis & { [THROWAWAY]?: VapidDetails }

function isProduction(env: NodeJS.ProcessEnv): boolean {
  return env.VERCEL_ENV === 'production'
}

/** The pair from the environment, a throwaway outside production, or null. */
export function resolveVapid(env: NodeJS.ProcessEnv = process.env): VapidDetails | null {
  const publicKey = env.VAPID_PUBLIC_KEY || env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = env.VAPID_PRIVATE_KEY
  const subject = env.VAPID_SUBJECT
  if (publicKey && privateKey && subject) return { subject, publicKey, privateKey }
  if (isProduction(env)) return null

  // Cached on globalThis, not the module: Next compiles the layout and each
  // route into their own server bundles, and every one of them must hand out
  // the same key or a subscription made on the page could never be signed for.
  const g = globalThis as WithThrowaway
  if (!g[THROWAWAY]) {
    const pair = webPush.generateVAPIDKeys()
    g[THROWAWAY] = { subject: THROWAWAY_SUBJECT, publicKey: pair.publicKey, privateKey: pair.privateKey }
  }
  return g[THROWAWAY]
}

/** The public half the page hands to the browser, or null when there is nothing to subscribe with. */
export function vapidPublicKey(env: NodeJS.ProcessEnv = process.env): string | null {
  return resolveVapid(env)?.publicKey ?? null
}

/** web-push behind the `PushSender` port; null when there is nothing to sign with. */
export function createWebPushSender(vapid: VapidDetails | null): PushSender | null {
  if (!vapid) return null
  return {
    async send(subscription: PushSubscriptionInput, payload: string) {
      try {
        await webPush.sendNotification(subscription, payload, { TTL: PUSH_TTL_SECONDS, vapidDetails: vapid })
      } catch (err) {
        if (err instanceof WebPushError) throw new PushSendError(err.message, err.statusCode)
        throw new PushSendError(err instanceof Error ? err.message : String(err), null)
      }
    },
  }
}
