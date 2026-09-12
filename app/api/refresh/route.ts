import { getWriter } from '@/lib/db/client'
import { seedRefresh } from '@/lib/ingest/refresh'
import { refreshLive } from '@/lib/ingest/refresh-live'

export const dynamic = 'force-dynamic'

/**
 * GET /api/refresh — the only thing that writes to the database.
 * 401 without the cron secret; 503 when the server has no database to write to.
 * Seeds first (idempotent), then reads the three live sources and resolves
 * every roster beach it can attribute.
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

  try {
    const seeded = await seedRefresh(writer)
    const live = await refreshLive({ writer, log: console.warn })
    return Response.json({ ...seeded, live })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
