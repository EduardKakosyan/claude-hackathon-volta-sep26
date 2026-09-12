'use client'

import { ArrowLeft, ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'

import { StatusChip } from '@/components/status-chip'
import { Button } from '@/components/ui/button'
import { plainEnglish, SOURCE_SAYS } from '@/lib/copy'
import { addDays, formatDay, formatDayShort, formatPosted } from '@/lib/dates'
import type { Beach } from '@/lib/seed/beaches'
import type { StatusDayView, StatusView } from '@/lib/status'
import { cn } from '@/lib/utils'

export interface BeachDetailProps {
  beach: Beach
  status: StatusView | undefined
  /** This beach's rows in the history window, oldest first. */
  history: StatusDayView[]
  historyFrom: string
  historyTo: string
  replayDay?: string
  onBack: () => void
  /** Slot for Directions / Share buttons. */
  actions?: ReactNode
  /** Slot for the crowd-report line and button. */
  reports?: ReactNode
}

const CELL: Record<string, string> = {
  open: 'bg-status-open',
  advisory: 'bg-status-advisory',
  closed: 'bg-status-closed',
  offseason: 'bg-status-offseason',
}

/**
 * Header, status block (who said it, verbatim, when, plain-English line, link),
 * facts, and the day strip. A replay row says it is replayed and shows no
 * posted time, because it has none.
 */
export function BeachDetail({
  beach,
  status,
  history,
  historyFrom,
  historyTo,
  replayDay,
  onBack,
  actions,
  reports,
}: BeachDetailProps) {
  const state = status?.state ?? 'unknown'
  const byDay = new Map(history.map((r) => [r.day, r]))
  const cells: string[] = []
  for (let d = historyFrom; d <= historyTo; d = addDays(d, 1)) cells.push(d)

  return (
    <article aria-label={beach.name} className="flex min-h-0 flex-col gap-4 overflow-y-auto">
      <header className="flex items-start gap-2">
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to the list">
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-neutral-900">{beach.name}</h2>
          <p className="truncate text-xs text-neutral-500">
            {beach.waterBody} · {beach.community}
          </p>
        </div>
        <StatusChip state={state} className="mt-1" />
      </header>

      <section className="rounded-xl border border-neutral-200 bg-white p-3">
        {status?.kind === 'live' ? (
          <>
            <p className="text-xs font-semibold text-neutral-500">{SOURCE_SAYS[status.source]}</p>
            {status.verbatim ? (
              <p className="mt-1 text-sm font-medium text-neutral-900">“{status.verbatim}”</p>
            ) : null}
            <p className="mt-1 text-xs text-neutral-500">
              {status.postedAt
                ? `Posted ${formatPosted(status.postedAt)}`
                : `Confirmed ${formatPosted(status.confirmedAt)}`}
            </p>
            <p className="mt-2 text-sm text-neutral-800">{plainEnglish(status)}</p>
            <a
              href={status.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700 underline-offset-2 hover:underline"
            >
              Open the source page <ExternalLink className="size-3" />
            </a>
          </>
        ) : status?.kind === 'replay' ? (
          <>
            <p className="text-xs font-semibold text-neutral-500">
              Replayed status for {formatDay(status.day)}
            </p>
            <p className="mt-2 text-sm text-neutral-800">{plainEnglish(status)}</p>
            <p className="mt-2 text-xs text-neutral-500">
              {status.basis === 'verified'
                ? 'Reconstructed from dated news coverage.'
                : status.basis === 'inferred'
                  ? 'Reconstruction: no notice was found for this beach that day.'
                  : 'Recorded by this app on the day.'}
              {status.note ? ` ${status.note}` : ''}
            </p>
          </>
        ) : (
          <>
            <p className="text-xs font-semibold text-neutral-500">
              {replayDay ? `No record for ${formatDay(replayDay)}` : 'No status read yet'}
            </p>
            <p className="mt-2 text-sm text-neutral-800">
              {replayDay
                ? 'This app has no status for this beach on that day.'
                : 'No government source has been read for this beach yet, so no colour is shown.'}
            </p>
          </>
        )}
      </section>

      {reports}

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-neutral-500">Lifeguards</dt>
        <dd className="text-neutral-800">{beach.supervision}</dd>
        <dt className="text-neutral-500">Water</dt>
        <dd className="text-neutral-800">
          {beach.water === 'fresh' ? 'Fresh water (E. coli)' : 'Salt water (enterococci)'}
        </dd>
        <dt className="text-neutral-500">Run by</dt>
        <dd className="text-neutral-800">
          {beach.authority === 'hrm' ? 'Halifax Regional Municipality' : 'Nova Scotia Parks'}
        </dd>
      </dl>

      <section aria-label="Daily status strip">
        <p className="mb-1 text-xs font-semibold text-neutral-500">
          {formatDayShort(historyFrom)} – {formatDayShort(historyTo)}
        </p>
        <ol className="grid grid-cols-14 gap-0.5">
          {cells.map((d) => {
            const row = byDay.get(d)
            return (
              <li
                key={d}
                title={`${formatDayShort(d)}: ${row?.state ?? 'no record'}`}
                className={cn(
                  'h-3 rounded-sm',
                  row ? CELL[row.state] : 'border border-dashed border-status-unknown bg-white',
                )}
              />
            )
          })}
        </ol>
      </section>

      <a
        href={beach.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs text-neutral-500 underline-offset-2 hover:underline"
      >
        Government page for this beach <ExternalLink className="size-3" />
      </a>

      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </article>
  )
}
