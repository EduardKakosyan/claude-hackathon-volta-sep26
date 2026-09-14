'use client'

import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, XIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'

import { formatDay, formatDayShort } from '@/lib/dates'
import type { DaySummary } from '@/lib/status'
import { buildHref } from '@/lib/url-state'
import { cn } from '@/lib/utils'

export interface DayScrubberProps {
  /** Every recorded day, newest first. */
  days: DaySummary[]
  /** Today's Halifax date: the last chip, whether or not a row exists for it yet. */
  today: string
  replayDay?: string
  /** Kept in the URL across the navigation. */
  beachId: string | null
  className?: string
}

export type DayTone = 'closed' | 'advisory' | 'open' | 'offseason' | 'live'

/** The chip's dot: the worst state any beach was in that day. */
export function dayTone(d: DaySummary): DayTone {
  if (d.closed > 0) return 'closed'
  if (d.advisory > 0) return 'advisory'
  if (d.open > 0) return 'open'
  return 'offseason'
}

/** "1 closed, 2 under advisory, 32 open" — the chip's accessible name, after the date. */
export function describeDay(d: DaySummary): string {
  const parts = [
    d.closed > 0 && `${d.closed} closed`,
    d.advisory > 0 && `${d.advisory} under advisory`,
    d.open > 0 && `${d.open} open`,
    d.offseason > 0 && `${d.offseason} off-season`,
  ].filter((p): p is string => Boolean(p))
  return parts.length ? parts.join(', ') : 'no record yet'
}

/**
 * The chip's bar: how many beaches stood in each state that day, worst first
 * so any red sits at the same edge on every chip. Each non-empty part keeps a
 * 2px floor (the flex basis), so one closed beach among 35 stays visible
 * without painting the whole day. Off-season days are one muted bar; today
 * with no row yet has none.
 */
function DayBar({ day, tone }: { day: DaySummary; tone: DayTone }) {
  if (tone === 'live') return <span className="beach-scrubber-bar" data-tone="live" aria-hidden="true" />
  if (tone === 'offseason') {
    return (
      <span className="beach-scrubber-bar" aria-hidden="true">
        <i data-state="offseason" style={{ flexGrow: 1 }} />
      </span>
    )
  }
  return (
    <span className="beach-scrubber-bar" aria-hidden="true">
      {day.closed > 0 ? <i data-state="closed" style={{ flexGrow: day.closed }} /> : null}
      {day.advisory > 0 ? <i data-state="advisory" style={{ flexGrow: day.advisory }} /> : null}
      {day.open > 0 ? <i data-state="open" style={{ flexGrow: day.open }} /> : null}
    </span>
  )
}

const WEEKDAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', weekday: 'narrow' })
const MONTH = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', month: 'short' })
const MONTH_LONG = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', month: 'long', year: 'numeric' })
const at = (day: string) => new Date(`${day}T00:00:00Z`)

interface Month {
  key: string
  label: string
  name: string
  days: DaySummary[]
}

const EMPTY = { open: 0, advisory: 0, closed: 0, offseason: 0 }

/** Every recorded day before today, then today itself, in calendar order and grouped by month. */
export function monthsOf(days: readonly DaySummary[], today: string): Month[] {
  const past = days.filter((d) => d.day < today)
  const todayRow = days.find((d) => d.day === today) ?? { day: today, ...EMPTY }
  const all = [...past, todayRow].sort((a, b) => a.day.localeCompare(b.day))
  const months: Month[] = []
  for (const d of all) {
    const key = d.day.slice(0, 7)
    const last = months[months.length - 1]
    if (last?.key === key) last.days.push(d)
    else months.push({ key, label: MONTH.format(at(d.day)), name: MONTH_LONG.format(at(d.day)), days: [d] })
  }
  return months
}

/**
 * "Replay a day". One pill at the top of the map says which day the map shows
 * — "Today", or "Replaying Aug 14" on ink so a replayed map can never pass for
 * a live one, with a control back to today beside it. The pill opens a strip
 * of every recorded day, one chip each, grouped by month, with a bar of the
 * day's states by count, that scrolls sideways and snaps; the arrow keys walk it.
 * Picking a day changes which rows the page needs, so it is a real navigation
 * and the server renders again from `status_day`. The strip stays open across
 * that navigation — the shell keeps its client state — so days can be stepped
 * through one after another.
 */
export function DayScrubber({ days, today, replayDay, beachId, className }: DayScrubberProps) {
  const router = useRouter()
  const id = useId()
  const listRef = useRef<HTMLOListElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  // A replay link opens on the strip: whoever followed it is here to look around.
  const [open, setOpen] = useState(() => Boolean(replayDay))

  const replaying = Boolean(replayDay)
  const current = replayDay ?? today
  const months = useMemo(() => monthsOf(days, today), [days, today])
  const beach = beachId ?? undefined
  const todayHref = buildHref({ beach })

  // The selected chip sits mid-strip whenever the strip opens or the day changes.
  useEffect(() => {
    if (!open) return
    const list = listRef.current
    const chip = list?.querySelector<HTMLElement>('[aria-current="date"]')
    if (!list || !chip) return
    list.scrollTo({ left: chip.offsetLeft - list.clientWidth / 2 + chip.offsetWidth / 2 })
  }, [open, current])

  const go = (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    // A modified click keeps the anchor's own behaviour: a new tab with the same URL.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    event.preventDefault()
    router.push(href)
  }

  function nudge(direction: -1 | 1) {
    const list = listRef.current
    list?.scrollBy({ left: direction * list.clientWidth * 0.8, behavior: 'smooth' })
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      setOpen(false)
      toggleRef.current?.focus()
      return
    }
    const chips = [...(listRef.current?.querySelectorAll<HTMLAnchorElement>('.beach-scrubber-day') ?? [])]
    const index = chips.findIndex((chip) => chip === document.activeElement)
    if (index === -1) return
    const next =
      event.key === 'ArrowLeft'
        ? index - 1
        : event.key === 'ArrowRight'
          ? index + 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? chips.length - 1
              : null
    if (next === null || next < 0 || next >= chips.length) return
    event.preventDefault()
    chips[next].focus()
    chips[next].scrollIntoView?.({ inline: 'center', block: 'nearest' })
  }

  return (
    <div className={cn('beach-scrubber', className)} data-replaying={replaying} data-open={open}>
      <div className="beach-scrubber-pill">
        <button
          ref={toggleRef}
          type="button"
          className="beach-scrubber-toggle"
          aria-label="Replay a day"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((value) => !value)}
        >
          <CalendarDays size={14} aria-hidden="true" />
          <span>{replayDay ? `Replaying ${formatDayShort(replayDay)}` : 'Today'}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        {replayDay ? (
          <a href={todayHref} className="beach-scrubber-close" aria-label="Back to today" onClick={go(todayHref)}>
            <XIcon size={14} aria-hidden="true" />
          </a>
        ) : null}
      </div>

      {open ? (
        <div className="beach-scrubber-strip" id={id} onKeyDown={onKeyDown}>
          <button type="button" className="beach-scrubber-arrow" aria-label="Earlier days" onClick={() => nudge(-1)}>
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <ol className="beach-scrubber-days" ref={listRef} aria-label="Recorded days">
            {months.map((month) => (
              <li key={month.key} className="beach-scrubber-month">
                <span className="beach-scrubber-month-label" title={month.name} aria-hidden="true">
                  {month.label}
                </span>
                <ol aria-label={month.name}>
                  {month.days.map((d) => {
                    const isToday = d.day === today
                    const href = isToday ? todayHref : buildHref({ day: d.day, beach })
                    const tone: DayTone = isToday && !days.some((x) => x.day === today) ? 'live' : dayTone(d)
                    return (
                      <li key={d.day}>
                        <a
                          href={href}
                          className="beach-scrubber-day"
                          aria-current={d.day === current ? 'date' : undefined}
                          aria-label={`${isToday ? 'Today, ' : ''}${formatDay(d.day)}: ${tone === 'live' ? 'live status' : describeDay(d)}`}
                          data-tone={tone}
                          data-today={isToday || undefined}
                          onClick={go(href)}
                        >
                          <span className="beach-scrubber-weekday">{WEEKDAY.format(at(d.day))}</span>
                          <span className="beach-scrubber-num">{Number(d.day.slice(8))}</span>
                          <DayBar day={d} tone={tone} />
                        </a>
                      </li>
                    )
                  })}
                </ol>
              </li>
            ))}
          </ol>
          <button type="button" className="beach-scrubber-arrow" aria-label="Later days" onClick={() => nudge(1)}>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  )
}
