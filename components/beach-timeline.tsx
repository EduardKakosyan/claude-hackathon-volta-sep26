'use client'

import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'

import type { BeachHistoryState } from '@/hooks/use-beach-history'
import { statusPresentation, type PinState } from '@/lib/beach-status'
import { BASIS_LINE } from '@/lib/copy'
import { addDays, formatDay, formatDayShort } from '@/lib/dates'
import { seasonOf, spanFor, type HistorySpan } from '@/lib/history'
import type { Beach } from '@/lib/seed/beaches'
import { buildHref } from '@/lib/url-state'

export type BeachTimelineProps = BeachHistoryState & {
  beach: Beach
  /** Today's Halifax date: the band ends here whether or not a row exists yet. */
  today: string
  replayDay?: string
}

/** A day's state on the band: a recorded state, or a gap in the record. */
export type BandState = PinState | 'none'

export interface Segment {
  from: string
  to: string
  state: BandState
  /** Days in the run. */
  days: number
  /** Off-season runs fold to one narrow column so the season gets the width. */
  collapsed: boolean
  /** The first grid column (1-based) and how many the run spans. */
  column: number
  span: number
}

export interface Band {
  /** Every day from the first recorded to today, in order. */
  days: string[]
  segments: Segment[]
  /** The CSS grid template both the band and the axis share. */
  template: string
  /** Month labels: the first in-season day of each month, with its column. */
  months: { label: string; column: number }[]
}

const STUB = 'var(--beach-timeline-stub)'
const MONTH = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', month: 'short' })

/**
 * The band's layout from the spans: one column per in-season day, one narrow
 * stub per off-season run, and the same template for the month axis. A beach
 * with no in-season day yet has nothing to make room for, so its stubs take
 * the width instead.
 */
export function bandOf(spans: readonly HistorySpan[], today: string): Band {
  const first = spans[0]?.from
  const days: string[] = []
  if (first) for (let d = first; d <= today; d = addDays(d, 1)) days.push(d)

  const runs: { from: string; to: string; state: BandState; days: number }[] = []
  for (const day of days) {
    const state: BandState = spanFor(spans, day)?.state ?? 'none'
    const last = runs[runs.length - 1]
    if (last && last.state === state) {
      last.to = day
      last.days += 1
    } else runs.push({ from: day, to: day, state, days: 1 })
  }

  const anySeason = runs.some((r) => r.state !== 'offseason')
  const segments: Segment[] = []
  const parts: string[] = []
  let column = 1
  for (const run of runs) {
    const collapsed = run.state === 'offseason' && anySeason
    const span = collapsed ? 1 : run.days
    segments.push({ ...run, collapsed, column, span })
    parts.push(collapsed ? STUB : `repeat(${run.days}, minmax(0, 1fr))`)
    column += span
  }

  // One label per month, at its first in-season day.
  const months: Band['months'] = []
  const seen = new Set<string>()
  for (const seg of segments) {
    if (seg.state === 'offseason') continue
    for (let i = 0; i < seg.days; i++) {
      const day = addDays(seg.from, i)
      const key = day.slice(0, 7)
      if (seen.has(key)) continue
      seen.add(key)
      months.push({ label: MONTH.format(new Date(`${day}T00:00:00Z`)), column: seg.column + i })
    }
  }

  return { days, segments, template: parts.join(' '), months }
}

/** The column a day sits in, or null when it is off the band. */
export function columnOf(band: Band, day: string): number | null {
  for (const seg of band.segments) {
    if (day < seg.from || day > seg.to) continue
    if (seg.collapsed) return seg.column
    const offset = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${seg.from}T00:00:00Z`)) / 86_400_000)
    return seg.column + offset
  }
  return null
}

/** The day under a pointer: the segment whose box holds x, then the day at that fraction of it. */
function dayAt(list: HTMLElement, band: Band, x: number): string | null {
  const boxes = list.querySelectorAll<HTMLElement>('[data-segment]')
  for (let i = 0; i < boxes.length; i++) {
    const rect = boxes[i].getBoundingClientRect()
    if (x < rect.left || x > rect.right) continue
    const seg = band.segments[i]
    const fraction = rect.width ? (x - rect.left) / rect.width : 0
    return addDays(seg.from, Math.min(seg.days - 1, Math.max(0, Math.floor(fraction * seg.days))))
  }
  return null
}

/**
 * The beach's own season: one band across every recorded day, the summer at
 * full width and the off-season folded to a stub at each end. Drag or arrow
 * across it and the line under it names the day, its state and the evidence
 * behind it; a picked day offers to replay itself on the map. One focusable
 * slider rather than 256 buttons: the arrow keys step a day, Page keys a week.
 */
export function BeachTimeline({ beach, today, replayDay, status, history, error }: BeachTimelineProps) {
  const spans = useMemo(() => history?.spans ?? [], [history])
  const band = useMemo(() => bandOf(spans, today), [spans, today])
  const season = useMemo(() => seasonOf(spans), [spans])
  const listRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<string | null>(null)
  /** The person's own pick; until there is one, a replayed day stands picked so the band and the map agree. */
  const [picked, setPicked] = useState<string | null>(null)
  const dragging = useRef(false)
  const selected = picked ?? (replayDay && band.days.includes(replayDay) ? replayDay : null)

  const current = hover ?? selected
  const index = current ? band.days.indexOf(current) : -1

  const describe = (day: string): { label: string; note: string | null } => {
    const span = spanFor(spans, day)
    if (!span) return { label: day === today ? 'Live status: see above' : 'No record', note: null }
    const { label } = statusPresentation(span.state, beach.authority)
    return { label, note: `${BASIS_LINE[span.basis]}${span.note ? ` ${span.note}` : ''}` }
  }

  const pick = (day: string | null) => {
    if (day) setPicked(day)
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !listRef.current) return
    dragging.current = true
    listRef.current.setPointerCapture?.(event.pointerId)
    pick(dayAt(listRef.current, band, event.clientX))
    setHover(null)
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!listRef.current) return
    const day = dayAt(listRef.current, band, event.clientX)
    if (dragging.current) pick(day)
    else if (event.pointerType === 'mouse') setHover(day)
  }
  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = false
    listRef.current?.releasePointerCapture?.(event.pointerId)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!band.days.length) return
    const at = selected ? band.days.indexOf(selected) : band.days.length - 1
    const step =
      event.key === 'ArrowLeft' || event.key === 'ArrowDown'
        ? -1
        : event.key === 'ArrowRight' || event.key === 'ArrowUp'
          ? 1
          : event.key === 'PageDown'
            ? -7
            : event.key === 'PageUp'
              ? 7
              : null
    const next =
      event.key === 'Home' ? 0 : event.key === 'End' ? band.days.length - 1 : step === null ? null : at + step
    if (next === null) return
    event.preventDefault()
    setPicked(band.days[Math.min(band.days.length - 1, Math.max(0, next))])
    setHover(null)
  }

  const title = season.from && season.to ? `${formatDayShort(season.from)} – ${formatDayShort(season.to)}` : null
  const summary = season.from
    ? [
        `${season.open} ${season.open === 1 ? 'day' : 'days'} open`,
        season.advisory > 0 && `${season.advisory} under advisory`,
        season.closed > 0 && `${season.closed} closed`,
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Off-season every recorded day so far.'

  const gridStyle: CSSProperties = { gridTemplateColumns: band.template }
  const replayHref = selected && selected !== today && selected !== replayDay ? buildHref({ day: selected, beach: beach.id }) : null
  const valueText = current ? `${formatDay(current)}: ${describe(current).label}` : summary

  return (
    <section className="beach-detail-timeline" aria-label="Season timeline" data-status={status}>
      <h3>
        {today.slice(0, 4)} season
        {title ? <span>{title}</span> : null}
      </h3>

      {status === 'loading' || status === 'idle' ? (
        <p className="beach-timeline-note" role="status">
          Loading this beach’s year…
        </p>
      ) : status === 'error' ? (
        <p className="beach-timeline-note" role="alert">
          Could not load this beach’s year just now.{error ? ` ${error}` : ''}
        </p>
      ) : band.days.length === 0 ? (
        <p className="beach-timeline-note">No days recorded yet for this beach.</p>
      ) : (
        <>
          <div
            ref={listRef}
            className="beach-timeline-band"
            role="slider"
            tabIndex={0}
            aria-label={`${beach.name}, day by day`}
            aria-valuemin={0}
            aria-valuemax={band.days.length - 1}
            aria-valuenow={index >= 0 ? index : band.days.length - 1}
            aria-valuetext={valueText}
            style={gridStyle}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onPointerLeave={() => setHover(null)}
            onKeyDown={onKeyDown}
          >
            {band.segments.map((seg) => (
              <i
                key={seg.from}
                data-segment
                data-state={seg.state}
                data-collapsed={seg.collapsed || undefined}
                style={{ gridColumn: `${seg.column} / span ${seg.span}` }}
                title={
                  seg.collapsed
                    ? `Off-season ${formatDayShort(seg.from)} – ${formatDayShort(seg.to)}`
                    : undefined
                }
              />
            ))}
            {columnOf(band, today) !== null ? (
              <i className="beach-timeline-today" style={{ gridColumn: columnOf(band, today)! }} aria-hidden="true" />
            ) : null}
            {selected && columnOf(band, selected) !== null ? (
              <i className="beach-timeline-cursor" style={{ gridColumn: columnOf(band, selected)! }} aria-hidden="true" />
            ) : null}
          </div>
          <ol className="beach-timeline-axis" style={gridStyle} aria-hidden="true">
            {band.months.map((m) => (
              <li key={m.column} style={{ gridColumn: m.column }}>
                {m.label}
              </li>
            ))}
          </ol>
          <p className="beach-timeline-readout" aria-live="polite" data-picked={Boolean(current)}>
            {current ? (
              <>
                <strong>{formatDay(current)}</strong>
                <span className="beach-timeline-state" data-state={spanFor(spans, current)?.state ?? 'none'}>
                  {describe(current).label}
                </span>
                {describe(current).note ? <span className="beach-timeline-evidence">{describe(current).note}</span> : null}
                {replayHref && selected === current ? (
                  <a href={replayHref} className="beach-timeline-replay">
                    Replay {formatDayShort(current)} on the map
                  </a>
                ) : null}
              </>
            ) : (
              <>
                <span className="beach-timeline-summary">{summary}</span>
                <span className="beach-timeline-hint">Drag along the band, or use the arrow keys, for any day.</span>
              </>
            )}
          </p>
        </>
      )}
    </section>
  )
}
