import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DayScrubber, dayTone, describeDay, monthsOf } from './day-scrubber'
import type { DaySummary } from '@/lib/status'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const day = (d: string, counts: Partial<Omit<DaySummary, 'day'>> = {}): DaySummary => ({
  day: d,
  open: 0,
  advisory: 0,
  closed: 0,
  offseason: 0,
  ...counts,
})

/** Newest first, as the store hands them over: two Augusts, one July, and today. */
const DAYS: DaySummary[] = [
  day('2026-09-13', { offseason: 35 }),
  day('2026-08-14', { open: 32, advisory: 2, closed: 1 }),
  day('2026-08-13', { open: 35 }),
  day('2026-07-24', { open: 28, advisory: 7 }),
]

describe('dayTone / describeDay', () => {
  it('names the worst state present, and counts every one', () => {
    expect(dayTone(DAYS[1])).toBe('closed')
    expect(dayTone(DAYS[3])).toBe('advisory')
    expect(dayTone(DAYS[2])).toBe('open')
    expect(dayTone(DAYS[0])).toBe('offseason')
    expect(describeDay(DAYS[1])).toBe('1 closed, 2 under advisory, 32 open')
    expect(describeDay(day('2026-01-01'))).toBe('no record yet')
  })
})

describe('monthsOf', () => {
  it('orders the days, groups them by month, and always ends on today', () => {
    const months = monthsOf(DAYS, '2026-09-13')
    expect(months.map((m) => [m.label, m.days.map((d) => d.day)])).toEqual([
      ['Jul', ['2026-07-24']],
      ['Aug', ['2026-08-13', '2026-08-14']],
      ['Sep', ['2026-09-13']],
    ])
  })

  it('adds a chip for today when no row exists for it yet', () => {
    const months = monthsOf(DAYS.slice(1), '2026-09-14')
    expect(months.at(-1)?.days).toEqual([day('2026-09-14')])
  })
})

describe('DayScrubber', () => {
  beforeEach(() => push.mockReset())

  it('is a closed "Today" pill with no strip until it is opened', async () => {
    render(<DayScrubber days={DAYS} today="2026-09-13" beachId={null} />)
    const toggle = screen.getByRole('button', { name: 'Replay a day' })
    expect(toggle).toHaveTextContent('Today')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('list', { name: 'Recorded days' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Back to today')).not.toBeInTheDocument()

    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const strip = screen.getByRole('list', { name: 'Recorded days' })
    expect(within(strip).getAllByRole('link')).toHaveLength(4)
    expect(within(strip).getByRole('list', { name: 'August 2026' })).toBeInTheDocument()
  })

  it('links every day, keeps the beach in the URL, and marks the day on show', async () => {
    render(<DayScrubber days={DAYS} today="2026-09-13" replayDay="2026-08-14" beachId="hrm-kinap" />)
    // A replay link opens on the strip.
    const strip = screen.getByRole('list', { name: 'Recorded days' })
    const aug14 = within(strip).getByRole('link', { name: 'August 14, 2026: 1 closed, 2 under advisory, 32 open' })
    expect(aug14).toHaveAttribute('href', '/?day=2026-08-14&beach=hrm-kinap')
    expect(aug14).toHaveAttribute('aria-current', 'date')
    expect(aug14).toHaveAttribute('data-tone', 'closed')
    // The bar: closed, then advisory, then open, each part grown by its count.
    const parts = [...aug14.querySelectorAll<HTMLElement>('.beach-scrubber-bar > i')]
    expect(parts.map((p) => [p.getAttribute('data-state'), p.style.flexGrow])).toEqual([
      ['closed', '1'],
      ['advisory', '2'],
      ['open', '32'],
    ])
    const today = within(strip).getByRole('link', { name: /^Today, September 13, 2026/ })
    expect(today).toHaveAttribute('href', '/?beach=hrm-kinap')
    expect(today).not.toHaveAttribute('aria-current')

    const toggle = screen.getByRole('button', { name: 'Replay a day' })
    expect(toggle).toHaveTextContent('Replaying Aug 14')
    expect(screen.getByLabelText('Back to today')).toHaveAttribute('href', '/?beach=hrm-kinap')
  })

  it('navigates on a plain click and leaves a modified click to the browser', async () => {
    render(<DayScrubber days={DAYS} today="2026-09-13" replayDay="2026-08-14" beachId={null} />)
    const strip = screen.getByRole('list', { name: 'Recorded days' })
    await userEvent.click(within(strip).getByRole('link', { name: /July 24, 2026/ }))
    expect(push).toHaveBeenCalledWith('/?day=2026-07-24')

    await userEvent.click(screen.getByLabelText('Back to today'))
    expect(push).toHaveBeenLastCalledWith('/')

    push.mockReset()
    const user = userEvent.setup()
    await user.keyboard('{Meta>}')
    await user.click(within(strip).getByRole('link', { name: /August 13, 2026/ }))
    await user.keyboard('{/Meta}')
    expect(push).not.toHaveBeenCalled()
  })

  it('walks the chips with the arrow keys and closes on Escape', async () => {
    render(<DayScrubber days={DAYS} today="2026-09-13" replayDay="2026-08-13" beachId={null} />)
    const strip = screen.getByRole('list', { name: 'Recorded days' })
    const links = within(strip).getAllByRole('link')
    links[1].focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(links[2]).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(links[0]).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(links[3]).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('list', { name: 'Recorded days' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Replay a day' })).toHaveFocus()
  })
})
