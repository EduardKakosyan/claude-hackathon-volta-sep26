import { getStore } from '@/lib/db/client'
import type { PageStore } from '@/lib/db/store'
import { toSpans, type BeachHistory } from '@/lib/history'
import { BEACHES_BY_ID } from '@/lib/seed/beaches'

export const dynamic = 'force-dynamic'

/**
 * GET /api/history/:beachId — every recorded day of one beach, folded into
 * spans, for the detail's timeline. Asked for only when a beach opens, so the
 * page never carries the whole year for every beach. The answer changes once
 * an hour at most, so the CDN may hold it for five minutes and serve it stale
 * for an hour while it fetches a fresh one. 404 for a beach not on the roster;
 * 503 when there is no store (a production deployment with no database).
 */

function store(): PageStore | null {
  try {
    return getStore()
  } catch {
    return null
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ beachId: string }> }) {
  const { beachId } = await params
  if (!(beachId in BEACHES_BY_ID)) {
    return Response.json({ error: 'beachId is not a monitored beach' }, { status: 404 })
  }
  const pageStore = store()
  if (!pageStore) return Response.json({ error: 'database not configured' }, { status: 503 })

  try {
    const spans = toSpans(await pageStore.beachHistory(beachId))
    const body: BeachHistory = {
      beachId,
      from: spans[0]?.from ?? '',
      to: spans[spans.length - 1]?.to ?? '',
      spans,
    }
    return Response.json(body, {
      headers: { 'cache-control': 'public, s-maxage=300, stale-while-revalidate=3600' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
