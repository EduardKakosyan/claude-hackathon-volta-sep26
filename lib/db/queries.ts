import { addDays, halifaxToday } from '@/lib/dates'
import { BEACHES, BEACHES_BY_ID, type Beach } from '@/lib/seed/beaches'
import { toReplay, type SourceHealthView, type StatusDayView, type StatusView } from '@/lib/status'
import { readUrlState } from '@/lib/url-state'

import type { PageStore } from './store'

export const HISTORY_DAYS = 14

/** Everything the page hands to the client. Plain data only. */
export interface PageData {
  beaches: Beach[]
  /** Keyed by beach id. A missing entry renders as `unknown`, never as a colour. */
  status: Record<string, StatusView | undefined>
  health: SourceHealthView[]
  /** The last HISTORY_DAYS days ending on `replayDay ?? today`, keyed by beach id, oldest first. */
  history: Record<string, StatusDayView[]>
  /** Distinct replayable days, newest first. */
  days: string[]
  /** The window the history covers, inclusive. */
  historyFrom: string
  historyTo: string
  replayDay?: string
  initialBeachId?: string
  storeKind: PageStore['kind']
}

export interface LoadPageInput {
  params: Record<string, string | string[] | undefined>
  store: PageStore
  now?: Date
}

/** The whole read contract. `day` switches the status source; nothing else does. */
export async function loadPage({ params, store, now = new Date() }: LoadPageInput): Promise<PageData> {
  const url = readUrlState(params, (id) => id in BEACHES_BY_ID)
  const today = halifaxToday(now)
  const historyTo = url.day ?? today
  const historyFrom = addDays(historyTo, -(HISTORY_DAYS - 1))

  const [statusRows, health, historyRows, days] = await Promise.all([
    url.day
      ? store.dayStatus(url.day).then((rows) => rows.map(toReplay))
      : store.liveStatus(),
    store.health(),
    store.history(historyFrom, historyTo),
    store.days(),
  ])

  const status: PageData['status'] = {}
  for (const row of statusRows) {
    if (row.beachId in BEACHES_BY_ID) status[row.beachId] = row
  }

  const history: PageData['history'] = {}
  for (const row of historyRows) {
    if (!(row.beachId in BEACHES_BY_ID)) continue
    ;(history[row.beachId] ??= []).push(row)
  }
  for (const rows of Object.values(history)) rows.sort((a, b) => a.day.localeCompare(b.day))

  return {
    beaches: BEACHES,
    status,
    health,
    history,
    days,
    historyFrom,
    historyTo,
    replayDay: url.day,
    initialBeachId: url.beach,
    storeKind: store.kind,
  }
}
