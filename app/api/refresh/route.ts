import { getFollowStore, getWriter } from '@/lib/db/client'
import { seedRefresh } from '@/lib/ingest/refresh'
import { refreshConditions } from '@/lib/ingest/refresh-conditions'
import { refreshLive } from '@/lib/ingest/refresh-live'
import { sendTransitions } from '@/lib/push/send'
import { createWebPushSender, resolveVapid } from '@/lib/push/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/refresh — the only thing that writes to the database. Vercel Cron
 * calls it at seven past every hour (vercel.json): Supabase's gateway was seen
 * failing calls made in the first second of the hour, and the store retries
 * each call besides (lib/db/retry.ts).
 * 401 without the cron secret; 503 when the server has no database to write to.
 * Four stages: seed (idempotent), then the live status sources, then
 * conditions, then one Web Push per follower of every beach whose state the
 * status stage changed. Conditions and push each run in their own try and
 * never gate the status write that came before them: a wind, buoy or push
 * outage is reported in the response, not raised.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response(null, { status: 401 })
  }

  const writer = getWriter()
  if (!writer) {
    return Response.json({ error: 'database not configured' }, { status: 503 })
  }

  let seeded
  let live
  try {
    seeded = await seedRefresh(writer)
    live = await refreshLive({ writer, log: console.warn })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // Logged as well as returned: a cron's response body is never seen, its logs are.
    console.error(`refresh failed before the status write: ${message}`)
    return Response.json({ error: message }, { status: 500 })
  }

  let conditions
  try {
    conditions = await refreshConditions({ writer, log: console.warn })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`conditions stage failed: ${message}`)
    conditions = { error: message }
  }

  let pushed
  try {
    pushed = await sendTransitions({
      transitions: live.transitions,
      store: getFollowStore(),
      sender: createWebPushSender(resolveVapid()),
      log: console.warn,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`push stage failed: ${message}`)
    pushed = { error: message }
  }

  return Response.json({ ...seeded, live, conditions, pushed })
}
