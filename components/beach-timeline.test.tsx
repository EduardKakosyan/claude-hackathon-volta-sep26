import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { bandOf, BeachTimeline, columnOf } from '@/components/beach-timeline'
import type { HistorySpan } from '@/lib/history'
import { BEACHES_BY_ID } from '@/lib/seed/beaches'

const OAKFIELD = BEACHES_BY_ID['hrm-oakfield-park']
const TODAY = '2026-09-13'

/** Oakfield's summer as the route folds it, shortened: off-season, open, the closure, the reopening, off-season. */
const SPANS: HistorySpan[] = [
  { from: '2026-06-28', to: '2026-06-30', state: 'offseason', basis: 'calendar', note: 'Off-season by the calendar.' },
  { from: '2026-07-01', to: '2026-07-27', state: 'open', basis: 'inferred', note: null },
  { from: '2026-07-28', to: '2026-07-28', state: 'closed', basis: 'verified', note: 'halifax.ca, "Oakfield Beach closed to swimming".' },
  { from: '2026-07-29', to: '2026-08-23', state: 'closed', basis: 'inferred', note: 'Closure between the notices is inferred.' },
  { from: '2026-08-24', to: '2026-08-31', state: 'open', basis: 'inferred', note: null },
  { from: '2026-09-01', to: '2026-09-12', state: 'offseason', basis: 'calendar', note: 'Off-season by the calendar.' },
]

const ready = (spans: HistorySpan[] = SPANS) =>
  ({
    status: 'ready' as const,
    error: null,
    history: { beachId: OAKFIELD.id, from: spans[0]?.from ?? '', to: spans.at(-1)?.to ?? '', spans },
  })

describe('bandOf', () => {
  it('runs the days from the first recorded to today, folds off-season runs to a stub, and labels each month once', () => {
    const band = bandOf(SPANS, TODAY)
    expect(band.days[0]).toBe('2026-06-28')
    expect(band.days.at(-1)).toBe(TODAY)
    expect(band.days).toHaveLength(78)
    // Off-season · open · closed · open · off-season (Sep 1 to today, the 13th, which has no span, is 'none').
    expect(band.segments.map((s) => [s.state, s.days, s.collapsed, s.column, s.span])).toEqual([
      ['offseason', 3, true, 1, 1],
      ['open', 27, false, 2, 27],
      ['closed', 27, false, 29, 27],
      ['open', 8, false, 56, 8],
      ['offseason', 12, true, 64, 1],
      ['none', 1, false, 65, 1],
    ])
    expect(band.template).toBe(
      'var(--beach-timeline-stub) repeat(27, minmax(0, 1fr)) repeat(27, minmax(0, 1fr)) repeat(8, minmax(0, 1fr)) var(--beach-timeline-stub) repeat(1, minmax(0, 1fr))',
    )
    expect(band.months).toEqual([
      { label: 'Jul', column: 2 },
      { label: 'Aug', column: 33 },
      { label: 'Sep', column: 65 },
    ])
  })

  it('gives the stubs the width when no day was in season', () => {
    const band = bandOf([{ from: '2026-01-01', to: '2026-01-03', state: 'offseason', basis: 'calendar', note: null }], '2026-01-03')
    expect(band.segments).toEqual([{ from: '2026-01-01', to: '2026-01-03', state: 'offseason', days: 3, collapsed: false, column: 1, span: 3 }])
    expect(band.months).toEqual([])
  })

  it('is empty with no spans', () => {
    expect(bandOf([], TODAY)).toEqual({ days: [], segments: [], template: '', months: [] })
  })
})

describe('columnOf', () => {
  const band = bandOf(SPANS, TODAY)
  it('maps a day to its column, a collapsed run to its one column, and an unrecorded day to null', () => {
    expect(columnOf(band, '2026-07-01')).toBe(2)
    expect(columnOf(band, '2026-07-28')).toBe(29)
    expect(columnOf(band, '2026-08-31')).toBe(63)
    expect(columnOf(band, '2026-06-29')).toBe(1)
    expect(columnOf(band, '2026-09-05')).toBe(64)
    expect(columnOf(band, TODAY)).toBe(65)
    expect(columnOf(band, '2026-06-01')).toBeNull()
  })
})

describe('BeachTimeline', () => {
  it('shows the season bounds, the day counts, and a hint until a day is picked', () => {
    render(<BeachTimeline beach={OAKFIELD} today={TODAY} {...ready()} />)
    const region = screen.getByRole('region', { name: 'Season timeline' })
    expect(region).toHaveTextContent('2026 season')
    expect(region).toHaveTextContent('Jul 1 – Aug 31')
    expect(region).toHaveTextContent('35 days open · 27 closed')
    expect(region).toHaveTextContent('Drag across the timeline or use the arrow keys')
    const band = screen.getByRole('slider', { name: 'Oakfield Park Beach, day by day' })
    expect(band).toHaveAttribute('aria-valuemax', '77')
    expect(band).toHaveAttribute('aria-valuetext', '35 days open · 27 closed')
    expect(band.querySelectorAll('[data-segment]')).toHaveLength(6)
    expect(band.querySelector('.beach-timeline-today')).toBeInTheDocument()
    expect(band.querySelector('.beach-timeline-cursor')).not.toBeInTheDocument()
  })

  it('walks the days from the keyboard: the readout names the day, its state and the evidence, and offers the replay', async () => {
    const user = userEvent.setup()
    render(<BeachTimeline beach={OAKFIELD} today={TODAY} {...ready()} />)
    const band = screen.getByRole('slider')
    band.focus()
    // From the end (today) back to July 28: End, then 47 steps left.
    await user.keyboard('{End}')
    expect(band).toHaveAttribute('aria-valuetext', `September 13, 2026: Live status: see above`)
    await user.keyboard('{PageDown}'.repeat(6) + '{ArrowLeft}'.repeat(5))
    expect(band).toHaveAttribute('aria-valuenow', '30')
    expect(band).toHaveAttribute('aria-valuetext', 'July 28, 2026: Closed')
    const readout = screen.getByText('July 28, 2026').closest('.beach-timeline-readout')!
    expect(readout).toHaveTextContent('Closed')
    expect(readout).toHaveTextContent('Based on a dated notice or a saved copy of the official status page. halifax.ca, "Oakfield Beach closed to swimming".')
    expect(screen.getByRole('link', { name: 'Replay Jul 28 on the map' })).toHaveAttribute('href', '/?day=2026-07-28&beach=hrm-oakfield-park')
    expect(band.querySelector('.beach-timeline-cursor')).toHaveStyle({ gridColumn: '29' })

    // Home is the first recorded day, an off-season one; no replay of a day already on the map, none of today.
    await user.keyboard('{Home}')
    expect(band).toHaveAttribute('aria-valuetext', 'June 28, 2026: Off-season')
    expect(screen.getByRole('link', { name: 'Replay Jun 28 on the map' })).toBeInTheDocument()
  })

  it('opens on the replayed day, already picked, and offers no replay of it', () => {
    render(<BeachTimeline beach={OAKFIELD} today={TODAY} replayDay="2026-08-01" {...ready()} />)
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', 'August 1, 2026: Closed')
    expect(screen.queryByRole('link', { name: /Replay/ })).not.toBeInTheDocument()
  })

  it('a pointer over the band previews a day without picking it; a press picks it', () => {
    render(<BeachTimeline beach={OAKFIELD} today={TODAY} {...ready()} />)
    const band = screen.getByRole('slider')
    const segments = band.querySelectorAll<HTMLElement>('[data-segment]')
    // jsdom has no layout: give the open run a box from x=100 to x=370 (27 days at 10px).
    segments[1].getBoundingClientRect = () => ({ left: 100, right: 370, width: 270, top: 0, bottom: 18, height: 18, x: 100, y: 0, toJSON: () => ({}) })
    fireEvent.pointerMove(band, { clientX: 125, pointerType: 'mouse' })
    expect(band).toHaveAttribute('aria-valuetext', 'July 3, 2026: Open')
    expect(screen.queryByRole('link', { name: /Replay/ })).not.toBeInTheDocument()
    fireEvent.pointerLeave(band)
    expect(band).toHaveAttribute('aria-valuetext', '35 days open · 27 closed')

    fireEvent.pointerDown(band, { clientX: 365, button: 0, pointerId: 1, pointerType: 'touch' })
    fireEvent.pointerUp(band, { clientX: 365, pointerId: 1, pointerType: 'touch' })
    expect(band).toHaveAttribute('aria-valuetext', 'July 27, 2026: Open')
    expect(screen.getByRole('link', { name: 'Replay Jul 27 on the map' })).toBeInTheDocument()
  })

  it('after the keyboard picks a day, a mouse that has not moved does not take the readout back; one that has does', async () => {
    const user = userEvent.setup()
    render(<BeachTimeline beach={OAKFIELD} today={TODAY} {...ready()} />)
    const band = screen.getByRole('slider')
    const segments = band.querySelectorAll<HTMLElement>('[data-segment]')
    segments[1].getBoundingClientRect = () => ({ left: 100, right: 370, width: 270, top: 0, bottom: 18, height: 18, x: 100, y: 0, toJSON: () => ({}) })
    band.focus()
    await user.keyboard('{Home}')
    expect(band).toHaveAttribute('aria-valuetext', 'June 28, 2026: Off-season')

    // The readout grew under a mouse resting on the band: WebKit reports a move, though nothing moved.
    fireEvent.pointerMove(band, { clientX: 125, clientY: 9, pointerType: 'mouse' })
    expect(band).toHaveAttribute('aria-valuetext', 'June 28, 2026: Off-season')
    fireEvent.pointerMove(band, { clientX: 125, clientY: 9, pointerType: 'mouse' })
    expect(band).toHaveAttribute('aria-valuetext', 'June 28, 2026: Off-season')
    expect(screen.getByRole('link', { name: 'Replay Jun 28 on the map' })).toBeInTheDocument()

    // A real move previews again, and keeps previewing.
    fireEvent.pointerMove(band, { clientX: 135, clientY: 9, pointerType: 'mouse' })
    expect(band).toHaveAttribute('aria-valuetext', 'July 4, 2026: Open')
    fireEvent.pointerMove(band, { clientX: 135, clientY: 9, pointerType: 'mouse' })
    expect(band).toHaveAttribute('aria-valuetext', 'July 4, 2026: Open')
    fireEvent.pointerLeave(band)
    expect(band).toHaveAttribute('aria-valuetext', 'June 28, 2026: Off-season')

    // The next key holds the mouse again until it moves.
    await user.keyboard('{ArrowRight}')
    expect(band).toHaveAttribute('aria-valuetext', 'June 29, 2026: Off-season')
    fireEvent.pointerMove(band, { clientX: 135, clientY: 9, pointerType: 'mouse' })
    expect(band).toHaveAttribute('aria-valuetext', 'June 29, 2026: Off-season')
    fireEvent.pointerMove(band, { clientX: 145, clientY: 9, pointerType: 'mouse' })
    expect(band).toHaveAttribute('aria-valuetext', 'July 5, 2026: Open')
  })

  it('says so while loading, when the load failed, and when nothing is recorded', () => {
    const { rerender } = render(<BeachTimeline beach={OAKFIELD} today={TODAY} status="loading" history={null} error={null} />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading beach history…')
    rerender(<BeachTimeline beach={OAKFIELD} today={TODAY} status="error" history={null} error="history: answered 503" />)
    expect(screen.getByRole('alert')).toHaveTextContent('We couldn’t load the beach history. Try refreshing the page. history: answered 503')
    rerender(<BeachTimeline beach={OAKFIELD} today={TODAY} {...ready([])} />)
    expect(screen.getByRole('region', { name: 'Season timeline' })).toHaveTextContent('We don’t have any history for this beach yet.')
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  })
})
