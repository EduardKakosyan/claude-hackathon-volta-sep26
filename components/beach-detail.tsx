'use client'

import { ExternalLink } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { BeachActions } from '@/components/beach-actions'
import { authorityName, statusPresentation, UNKNOWN_CAVEAT, type PinState } from '@/lib/beach-status'
import { plainEnglish, SOURCE_SAYS } from '@/lib/copy'
import { addDays, formatDay, formatDayShort, formatPosted } from '@/lib/dates'
import { formatDistance } from '@/lib/geo'
import type { Beach } from '@/lib/seed/beaches'
import type { DayBasis, StatusDayView, StatusView } from '@/lib/status'

export interface BeachDetailProps {
  beach: Beach
  status: StatusView | undefined
  /** This beach's rows in the history window, oldest first. */
  history: StatusDayView[]
  historyFrom: string
  historyTo: string
  replayDay?: string
  /**
   * Kilometres from wherever the directory is measured from (the visitor, or
   * downtown Halifax); undefined when the beach is not in the current roster.
   */
  distanceKm: number | undefined
}

/** How a replayed day's row came to exist. */
const BASIS_LINE: Record<DayBasis, string> = {
  scraped: 'Recorded by this app on the day.',
  verified: 'Reconstructed from dated news coverage.',
  inferred: 'Reconstruction: no notice was found for this beach that day.',
}

/**
 * One field note: the heading, the single boxed status block, the plain-English
 * line, and Directions / Share above the fold; the facts, the 14-day strip and
 * the source links below it. It has no back control (the panel heading's is the
 * only one) and no scroller of its own (the sheet or panel column is the only
 * thing that scrolls), and every rule it wears is a `.beach-detail-*` class in
 * beach-shell.css.
 */
export function BeachDetail({
  beach,
  status,
  history,
  historyFrom,
  historyTo,
  replayDay,
  distanceKm,
}: BeachDetailProps) {
  const state: PinState = status?.state ?? 'unknown'
  const { label } = statusPresentation(state, beach.authority)
  const distance = distanceKm === undefined ? null : formatDistance(distanceKm)

  // The row that opened this has unmounted, so focus would otherwise fall to
  // <body>; the name is where a screen reader should land.
  const nameRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    nameRef.current?.focus({ preventScroll: true })
  }, [])

  const byDay = new Map(history.map((row) => [row.day, row]))
  const cells: string[] = []
  for (let d = historyFrom; d <= historyTo; d = addDays(d, 1)) cells.push(d)

  // The source's exact words are quoted only when they say more than the label
  // already does: "Open" under OPEN is noise, "Risk advisory in effect" is not.
  const quote =
    status?.kind === 'live' && status.verbatim && status.verbatim.trim().toLowerCase() !== label.toLowerCase()
      ? status.verbatim
      : null

  const attribution =
    status?.kind === 'live'
      ? `${SOURCE_SAYS[status.source]} · ${
          status.postedAt ? `posted ${formatPosted(status.postedAt)}` : `confirmed ${formatPosted(status.confirmedAt)}`
        }`
      : status?.kind === 'replay'
        ? `Replayed status for ${formatDay(status.day)}`
        : replayDay
          ? `No record for ${formatDay(replayDay)}`
          : 'No status read yet'

  const basis =
    status?.kind === 'replay' ? `${BASIS_LINE[status.basis]}${status.note ? ` ${status.note}` : ''}` : null

  const plain = status
    ? plainEnglish(status)
    : replayDay
      ? `This app has no status for this beach on that day. ${UNKNOWN_CAVEAT}`
      : `No government source has been read for this beach yet, so no colour is shown. ${UNKNOWN_CAVEAT}`

  return (
    <article className="beach-detail" aria-label={beach.name}>
      <header className="beach-detail-head">
        <h2 className="beach-detail-name" tabIndex={-1} ref={nameRef}>
          {beach.name}
        </h2>
        <p className="beach-detail-sub">
          {[distance, beach.waterBody, beach.community].filter(Boolean).join(' · ')}
        </p>
      </header>

      <section className="beach-detail-status" data-state={state} aria-label="Status">
        <p className="beach-detail-status-label">{label}</p>
        {quote ? <q className="beach-detail-status-quote">{quote}</q> : null}
        <p className="beach-detail-status-source">{attribution}</p>
        {basis ? <p className="beach-detail-status-source">{basis}</p> : null}
      </section>

      <p className="beach-detail-plain">{plain}</p>

      <BeachActions beach={beach} />

      <dl className="beach-detail-facts">
        <div>
          <dt>Lifeguards</dt>
          <dd>{beach.supervision}</dd>
        </div>
        <div>
          <dt>Water</dt>
          <dd>{beach.water === 'fresh' ? 'Fresh water (E. coli)' : 'Salt water (enterococci)'}</dd>
        </div>
        <div>
          <dt>Run by</dt>
          <dd>{authorityName(beach.authority)}</dd>
        </div>
        {distance ? (
          <div>
            <dt>Distance</dt>
            <dd>{distance}</dd>
          </div>
        ) : null}
      </dl>

      <section className="beach-detail-history" aria-label="Daily status strip">
        <h3>
          Last 14 days
          <span>
            {formatDayShort(historyFrom)} – {formatDayShort(historyTo)}
          </span>
        </h3>
        <ol>
          {cells.map((day) => {
            const row = byDay.get(day)
            return (
              <li
                key={day}
                data-state={row?.state ?? 'none'}
                title={`${formatDayShort(day)}: ${row?.state ?? 'no record'}`}
              />
            )
          })}
        </ol>
      </section>

      <p className="beach-detail-sources">
        {status?.kind === 'live' ? (
          <a href={status.sourceUrl} target="_blank" rel="noreferrer">
            Open the source page <ExternalLink size={12} aria-hidden="true" />
          </a>
        ) : null}
        <a href={beach.sourceUrl} target="_blank" rel="noreferrer">
          Government page for this beach <ExternalLink size={12} aria-hidden="true" />
        </a>
      </p>
    </article>
  )
}
