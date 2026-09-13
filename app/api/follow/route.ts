import { getFollowStore } from '@/lib/db/client'
import type { FollowStore } from '@/lib/push/follow-store'
import { isHttpsUrl, parseSubscription } from '@/lib/push/follow-store'
import { BEACHES_BY_ID } from '@/lib/seed/beaches'

export const dynamic = 'force-dynamic'

/**
 * /api/follow — the app's one browser-to-server write. A bell tap stores the
 * browser's anonymous push subscription with the beach id (POST) or drops the
 * pair (DELETE). Both answer 204 with no body; a malformed request is a 400
 * naming the field; no store to write to is a 503. The service-role key never
 * leaves the server: the browser only ever sees this route.
 */

function bad(error: string): Response {
  return Response.json({ error }, { status: 400 })
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await req.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function store(): FollowStore | null {
  try {
    return getFollowStore()
  } catch {
    return null
  }
}

function isBeachId(value: unknown): value is string {
  return typeof value === 'string' && value in BEACHES_BY_ID
}

export async function POST(req: Request) {
  const body = await readJson(req)
  if (!body) return bad('expected a JSON object with subscription and beachId')
  const subscription = parseSubscription(body.subscription)
  if (!subscription) return bad('subscription must carry an https endpoint and p256dh / auth keys')
  if (!isBeachId(body.beachId)) return bad('beachId is not a monitored beach')

  const followStore = store()
  if (!followStore) return Response.json({ error: 'database not configured' }, { status: 503 })

  try {
    await followStore.subscribe(subscription, body.beachId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
  return new Response(null, { status: 204 })
}

export async function DELETE(req: Request) {
  const body = await readJson(req)
  if (!body) return bad('expected a JSON object with endpoint and beachId')
  const { endpoint } = body
  if (typeof endpoint !== 'string' || !isHttpsUrl(endpoint)) return bad('endpoint must be an https URL')
  if (!isBeachId(body.beachId)) return bad('beachId is not a monitored beach')

  const followStore = store()
  if (!followStore) return Response.json({ error: 'database not configured' }, { status: 503 })

  try {
    await followStore.unsubscribe(endpoint, body.beachId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
  return new Response(null, { status: 204 })
}
