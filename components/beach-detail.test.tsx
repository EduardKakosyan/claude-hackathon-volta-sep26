import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BeachDetail, type BeachDetailProps } from '@/components/beach-detail'
import type { ConditionsView } from '@/lib/conditions'
import type { Beach } from '@/lib/seed/beaches'
import type { LiveStatus, ReplayStatus, StatusView } from '@/lib/status'

describe('BeachDetail', () => {
  const createBeach = (overrides: Partial<Beach> = {}): Beach => ({
    id: 'test-beach',
    name: 'Test Beach',
    authority: 'hrm',
    lat: 44.5,
    lon: -63.3,
    waterBody: 'Atlantic Ocean',
    community: 'Test Community',
    region: 'Halifax',
    water: 'salt' as const,
    supervision: 'Scheduled',
    sourceUrl: 'https://example.com/status',
    match: {
      hrmTable: 'Test',
      parksText: [],
      lakes: [],
    },
    ...overrides,
  })

  const makeLiveStatus = (
    state: 'open' | 'advisory' | 'closed' | 'offseason',
    overrides: Partial<LiveStatus> = {},
  ): LiveStatus => ({
    kind: 'live',
    beachId: 'test-beach',
    state,
    source: 'hrm',
    verbatim: null,
    sourceUrl: 'https://example.com/status',
    postedAt: null,
    confirmedAt: '2026-07-15T12:00:00Z',
    ...overrides,
  })

  const makeReplayStatus = (state: 'open' | 'advisory' | 'closed' | 'offseason'): ReplayStatus => ({
    kind: 'replay',
    beachId: 'test-beach',
    day: '2026-07-10',
    state,
    basis: 'scraped',
    note: null,
  })

  const baseProps: Omit<BeachDetailProps, 'beach' | 'status'> = {
    history: [],
    historyFrom: '2026-07-01',
    historyTo: '2026-07-14',
    distanceKm: 3.6,
  }

  const statusBox = () => document.querySelector('.beach-detail-status')!

  it('renders the name as the heading and a subtitle of distance, water body and community', () => {
    render(<BeachDetail beach={createBeach()} status={undefined} {...baseProps} />)

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Test Beach')
    expect(document.querySelector('.beach-detail-sub')).toHaveTextContent('3.6 km · Atlantic Ocean · Test Community')
  })

  it('without a distance the subtitle is just water body and community, and there is no Distance fact', () => {
    render(<BeachDetail beach={createBeach()} status={undefined} {...baseProps} distanceKm={undefined} />)

    expect(document.querySelector('.beach-detail-sub')).toHaveTextContent(/^Atlantic Ocean · Test Community$/)
    expect(screen.queryByText('Distance')).toBeNull()
  })

  it('the distance is repeated in the facts, rounded the way the directory rounds it', () => {
    render(<BeachDetail beach={createBeach()} status={undefined} {...baseProps} distanceKm={17.4} />)

    expect(document.querySelector('.beach-detail-sub')).toHaveTextContent(/^17 km/)
    expect(screen.getByText('Distance').nextElementSibling).toHaveTextContent('17 km')
  })

  it('takes focus on open so a screen reader lands on the name', () => {
    render(<BeachDetail beach={createBeach()} status={undefined} {...baseProps} />)

    expect(screen.getByRole('heading', { level: 2 })).toHaveFocus()
  })

  it('has no back control of its own: the panel heading owns the single one', () => {
    render(<BeachDetail beach={createBeach()} status={makeLiveStatus('open')} {...baseProps} />)

    expect(screen.queryByRole('button', { name: /back/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /back/i })).toBeNull()
  })

  it('renders Directions and Share above the facts', () => {
    render(<BeachDetail beach={createBeach()} status={makeLiveStatus('open')} {...baseProps} />)

    const directions = screen.getByRole('link', { name: /Directions/ })
    const share = screen.getByRole('button', { name: /Share/ })
    const facts = document.querySelector('.beach-detail-facts')!
    expect(directions.compareDocumentPosition(facts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(share.compareDocumentPosition(facts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('is one column with no scroller of its own', () => {
    render(<BeachDetail beach={createBeach()} status={makeLiveStatus('open')} {...baseProps} />)

    const article = document.querySelector('article')!
    expect(article).toHaveClass('beach-detail')
    expect(article.className).not.toMatch(/overflow/)
    expect(article.getAttribute('style')).toBeNull()
  })

  it('the status block carries the state, the authority-aware label, and the source line', () => {
    const status = makeLiveStatus('advisory', {
      verbatim: 'Water quality advisory in effect',
      sourceUrl: 'https://hrm.example.com/beach',
      postedAt: '2026-07-15T10:00:00Z',
    })
    render(<BeachDetail beach={createBeach()} status={status} {...baseProps} />)

    expect(statusBox()).toHaveAttribute('data-state', 'advisory')
    expect(document.querySelector('.beach-detail-status-label')).toHaveTextContent('Advisory')
    expect(document.querySelector('.beach-detail-status-quote')).toHaveTextContent('Water quality advisory in effect')
    expect(document.querySelector('.beach-detail-status-source')).toHaveTextContent(/^halifax\.ca says · posted /)
  })

  it('a provincial open beach is labelled "No advisory posted", never "Open"', () => {
    const status = makeLiveStatus('open', { source: 'season', verbatim: 'No advisory posted' })
    render(<BeachDetail beach={createBeach({ authority: 'province' })} status={status} {...baseProps} />)

    expect(document.querySelector('.beach-detail-status-label')).toHaveTextContent('No advisory posted')
    expect(statusBox().textContent).not.toMatch(/\bOpen\b/)
  })

  it('the source\'s words are quoted only when they say more than the label', () => {
    const { unmount } = render(
      <BeachDetail beach={createBeach()} status={makeLiveStatus('open', { verbatim: 'Open' })} {...baseProps} />,
    )
    expect(document.querySelector('.beach-detail-status-quote')).toBeNull()
    unmount()

    render(
      <BeachDetail
        beach={createBeach()}
        status={makeLiveStatus('closed', { verbatim: 'Closed — blue-green algae' })}
        {...baseProps}
      />,
    )
    expect(document.querySelector('.beach-detail-status-quote')).toHaveTextContent('Closed — blue-green algae')
  })

  it('live status with a verbatim quote shows the quoted text and the source link', () => {
    const status = makeLiveStatus('advisory', {
      verbatim: 'Water quality advisory in effect',
      sourceUrl: 'https://hrm.example.com/beach',
    })
    render(<BeachDetail beach={createBeach()} status={status} {...baseProps} />)

    expect(screen.getByText(/Water quality advisory in effect/i)).toBeInTheDocument()
    const sourceLink = screen.getByRole('link', { name: /open the source page/i })
    expect(sourceLink).toHaveAttribute('href', 'https://hrm.example.com/beach')
    expect(sourceLink).toHaveAttribute('target', '_blank')
  })

  it('live status with postedAt says "posted"', () => {
    const status = makeLiveStatus('open', { postedAt: '2026-07-15T10:00:00Z' })
    render(<BeachDetail beach={createBeach()} status={status} {...baseProps} />)

    expect(document.querySelector('.beach-detail-status-source')).toHaveTextContent(/posted/)
    expect(document.querySelector('.beach-detail-status-source')).not.toHaveTextContent(/confirmed/)
  })

  it('live status without postedAt says "confirmed"', () => {
    const status = makeLiveStatus('open', { postedAt: null, confirmedAt: '2026-07-15T12:00:00Z' })
    render(<BeachDetail beach={createBeach()} status={status} {...baseProps} />)

    expect(document.querySelector('.beach-detail-status-source')).toHaveTextContent(/confirmed/)
  })

  it('the plain-English line comes from the central copy', () => {
    render(<BeachDetail beach={createBeach()} status={makeLiveStatus('advisory')} {...baseProps} />)

    expect(document.querySelector('.beach-detail-plain')).toHaveTextContent(/Swimming is not recommended/)
  })

  it('replay status shows the replay explanation and no live source link', () => {
    render(<BeachDetail beach={createBeach()} status={makeReplayStatus('advisory')} {...baseProps} replayDay="2026-07-10" />)

    expect(screen.getByText(/Replayed status for/)).toBeInTheDocument()
    expect(statusBox()).toHaveAttribute('data-state', 'advisory')
    expect(screen.queryByRole('link', { name: /open the source page/i })).toBeNull()
    expect(document.querySelector('.beach-detail-plain')).toHaveTextContent(/An advisory was in effect/)
  })

  it('replay status with verified basis shows the reconstruction note', () => {
    const status: ReplayStatus = { ...makeReplayStatus('closed'), basis: 'verified', note: 'Per CBC coverage.' }
    render(<BeachDetail beach={createBeach()} status={status} {...baseProps} replayDay="2026-07-10" />)

    expect(screen.getByText(/Reconstructed from dated news coverage\. Per CBC coverage\./)).toBeInTheDocument()
  })

  it('no status shows "No status read yet" in live mode, reads unknown, and repeats the caveat', () => {
    render(<BeachDetail beach={createBeach()} status={undefined} {...baseProps} />)

    expect(screen.getByText('No status read yet')).toBeInTheDocument()
    expect(statusBox()).toHaveAttribute('data-state', 'unknown')
    expect(document.querySelector('.beach-detail-status-label')).toHaveTextContent('No status available')
    expect(document.querySelector('.beach-detail-plain')).toHaveTextContent(/No government source has been read/)
    expect(document.querySelector('.beach-detail-plain')).toHaveTextContent('Unknown does not mean open.')
  })

  it('no status in replay mode shows "No record for" the day', () => {
    render(<BeachDetail beach={createBeach()} status={undefined} {...baseProps} replayDay="2026-07-10" />)

    expect(screen.getByText(/No record for/)).toBeInTheDocument()
  })

  describe('conditions line', () => {
    const conditions: ConditionsView = {
      windKmh: 25,
      windDir: 'SW',
      airTempC: 21,
      observedAt: '2026-07-15T17:00:00Z', // 2 p.m. ADT
      sunrise: '2026-07-15T08:40:00Z',
      sunset: '2026-07-16T00:00:00Z',
    }

    it('an ocean beach near the buoy shows water temperature, wind and the reading\'s time under the plain English', () => {
      render(
        <BeachDetail beach={createBeach()} status={makeLiveStatus('open')} {...baseProps} conditions={{ ...conditions, waterTempC: 16.4 }} />,
      )

      const line = document.querySelector('.beach-detail-conditions')!
      expect(line).toHaveTextContent('16 °C water · Wind 25 km/h SW · 2 p.m.')
      const plain = document.querySelector('.beach-detail-plain')!
      expect(plain.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      const directions = screen.getByRole('link', { name: /Directions/ })
      expect(line.compareDocumentPosition(directions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('a lake shows wind only: no water figure and no placeholder', () => {
      render(<BeachDetail beach={createBeach({ water: 'fresh' })} status={makeLiveStatus('open')} {...baseProps} conditions={conditions} />)

      expect(document.querySelector('.beach-detail-conditions')).toHaveTextContent(/^Wind 25 km\/h SW · 2 p\.m\.$/)
      expect(document.querySelector('.beach-detail-conditions')?.textContent).not.toMatch(/water/i)
    })

    it('with no conditions the line is absent altogether', () => {
      render(<BeachDetail beach={createBeach()} status={makeLiveStatus('open')} {...baseProps} />)

      expect(document.querySelector('.beach-detail-conditions')).toBeNull()
      expect(document.querySelector('article')?.textContent).not.toMatch(/wind|unavailable/i)
    })
  })

  describe('out of season', () => {
    /** A September afternoon: 4:30 p.m. ADT, sun up 6:41 a.m., down 7:32 p.m. */
    const conditions: ConditionsView = {
      windKmh: 19,
      windDir: 'SW',
      airTempC: 14,
      observedAt: '2026-09-12T19:30:00Z',
      sunrise: '2026-09-12T09:41:00Z',
      sunset: '2026-09-12T22:32:00Z',
    }
    const offseason = (overrides: Partial<LiveStatus> = {}) =>
      makeLiveStatus('offseason', { source: 'season', verbatim: 'Off-season', ...overrides })

    it('leads with the conditions line, sunrise and sunset included, straight under the heading', () => {
      render(<BeachDetail beach={createBeach({ water: 'fresh' })} status={offseason()} {...baseProps} conditions={conditions} />)

      const line = document.querySelector('.beach-detail-conditions')!
      expect(line).toHaveTextContent('Wind 19 km/h SW · 4:30 p.m. · Sunrise 6:41 a.m. · Sunset 7:32 p.m.')
      expect(line).toHaveAttribute('data-lead', 'true')
      expect(line.previousElementSibling).toHaveClass('beach-detail-head')
      expect(line.nextElementSibling).toHaveClass('beach-detail-status')
      expect(document.querySelector('article')).toHaveAttribute('data-offseason', 'true')
    })

    it('an ocean beach near the buoy still leads with the water figure', () => {
      render(<BeachDetail beach={createBeach()} status={offseason()} {...baseProps} conditions={{ ...conditions, waterTempC: 16.4 }} />)

      expect(document.querySelector('.beach-detail-conditions')).toHaveTextContent(/^16 °C water · Wind 19 km\/h SW · 4:30 p\.m\. · Sunrise/)
    })

    it('the status block is one quiet line saying when that authority\'s lifeguards return, and there is no plain-English line', () => {
      const { unmount } = render(<BeachDetail beach={createBeach({ authority: 'hrm' })} status={offseason()} {...baseProps} conditions={conditions} />)

      expect(statusBox()).toHaveAttribute('data-state', 'offseason')
      expect(statusBox()).toHaveTextContent(/^Off-season\. Lifeguards return late June\.$/)
      expect(document.querySelector('.beach-detail-status-label')).toBeNull()
      expect(document.querySelector('.beach-detail-status-source')).toBeNull()
      expect(document.querySelector('.beach-detail-plain')).toBeNull()
      unmount()

      render(<BeachDetail beach={createBeach({ authority: 'province' })} status={offseason()} {...baseProps} conditions={conditions} />)
      expect(statusBox()).toHaveTextContent(/^Off-season\. Lifeguards return July 1\.$/)
    })

    it('with no conditions the note is the quiet line and the actions, nothing invented', () => {
      render(<BeachDetail beach={createBeach()} status={offseason()} {...baseProps} />)

      expect(document.querySelector('.beach-detail-conditions')).toBeNull()
      expect(statusBox()).toHaveTextContent('Off-season. Lifeguards return late June.')
      expect(document.querySelector('article')?.textContent).not.toMatch(/wind|unavailable|sunrise/i)
      expect(screen.getByRole('link', { name: /Directions/ })).toBeInTheDocument()
    })

    it('the source\'s own "Supervision ended" in season is off-season too, with its page still linked', () => {
      const status = offseason({ source: 'hrm', verbatim: 'Supervision ended for the season', sourceUrl: 'https://hrm.example.com/beach' })
      render(<BeachDetail beach={createBeach()} status={status} {...baseProps} conditions={conditions} />)

      expect(statusBox()).toHaveTextContent('Off-season. Lifeguards return late June.')
      expect(document.querySelector('.beach-detail-conditions')).toHaveAttribute('data-lead', 'true')
      expect(screen.getByRole('link', { name: /open the source page/i })).toHaveAttribute('href', 'https://hrm.example.com/beach')
    })

    it('a replayed off-season day keeps the replay layout: its status is a record, not the calendar', () => {
      render(<BeachDetail beach={createBeach()} status={makeReplayStatus('offseason')} {...baseProps} replayDay="2026-07-10" />)

      expect(document.querySelector('article')).toHaveAttribute('data-offseason', 'false')
      expect(screen.getByText(/Replayed status for/)).toBeInTheDocument()
      expect(document.querySelector('.beach-detail-plain')).toHaveTextContent('Supervision had ended for the season.')
    })
  })

  describe('follow bell', () => {
    it('is absent unless the slot is given', () => {
      render(<BeachDetail beach={createBeach()} status={makeLiveStatus('open')} {...baseProps} />)
      expect(document.querySelector('.beach-detail-follow')).toBeNull()
    })

    it('sits in the heading row beside the name, reads the state it is given, and a tap calls the toggle', async () => {
      const user = userEvent.setup()
      const onToggle = vi.fn()
      render(<BeachDetail beach={createBeach()} status={makeLiveStatus('open')} {...baseProps} follow={{ state: 'off', onToggle }} />)

      const head = document.querySelector('.beach-detail-head')!
      const bell = screen.getByRole('button', { name: 'Follow' })
      expect(head.contains(bell)).toBe(true)
      expect(head.querySelector('.beach-detail-name')!.compareDocumentPosition(bell) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(bell).toHaveAttribute('aria-pressed', 'false')
      await user.click(bell)
      expect(onToggle).toHaveBeenCalledTimes(1)
    })

    it('following reads "Following" and pressed; the hint states stay in the head too', () => {
      const { unmount } = render(
        <BeachDetail beach={createBeach()} status={makeLiveStatus('open')} {...baseProps} follow={{ state: 'on', onToggle: () => {} }} />,
      )
      expect(screen.getByRole('button', { name: 'Following' })).toHaveAttribute('aria-pressed', 'true')
      unmount()

      render(<BeachDetail beach={createBeach()} status={makeLiveStatus('open')} {...baseProps} follow={{ state: 'needs-install', onToggle: () => {} }} />)
      expect(document.querySelector('.beach-detail-head .beach-detail-follow')).toHaveAttribute('data-state', 'needs-install')
    })

    it('the name still takes focus on open, not the bell, and the bell is not a back control', () => {
      render(<BeachDetail beach={createBeach()} status={makeLiveStatus('open')} {...baseProps} follow={{ state: 'off', onToggle: () => {} }} />)
      expect(screen.getByRole('heading', { level: 2 })).toHaveFocus()
      expect(screen.queryByRole('button', { name: /back/i })).toBeNull()
    })
  })

  it('no rendered text asserts the water is safe', () => {
    const statuses: (StatusView | undefined)[] = [
      makeLiveStatus('open'),
      makeLiveStatus('advisory'),
      makeLiveStatus('closed'),
      makeLiveStatus('offseason'),
      makeReplayStatus('open'),
      undefined,
    ]

    statuses.forEach((status) => {
      const { unmount } = render(<BeachDetail beach={createBeach()} status={status} {...baseProps} />)

      const article = document.querySelector('article')
      expect(article?.textContent).not.toMatch(/water is safe/i)
      unmount()
    })
  })

  it('facts section shows lifeguards, water type, and authority', () => {
    render(<BeachDetail beach={createBeach({ water: 'fresh', authority: 'province' })} status={undefined} {...baseProps} />)

    expect(screen.getByText('Scheduled')).toBeInTheDocument()
    expect(screen.getByText(/Fresh water/)).toBeInTheDocument()
    expect(screen.getByText('Nova Scotia Parks')).toBeInTheDocument()
  })

  it('HRM beach shows "Halifax Regional Municipality" as authority', () => {
    render(<BeachDetail beach={createBeach({ authority: 'hrm' })} status={undefined} {...baseProps} />)

    expect(screen.getByText('Halifax Regional Municipality')).toBeInTheDocument()
  })

  it('government page link points at beach.sourceUrl', () => {
    const sourceUrl = 'https://example.com/beach-status'
    render(<BeachDetail beach={createBeach({ sourceUrl })} status={undefined} {...baseProps} />)

    const link = screen.getByRole('link', { name: /government page for this beach/i })
    expect(link).toHaveAttribute('href', sourceUrl)
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('history strip renders one cell per day in the window, coloured by state', () => {
    render(
      <BeachDetail
        beach={createBeach()}
        status={undefined}
        {...baseProps}
        history={[
          { beachId: 'test-beach', day: '2026-07-03', state: 'advisory', basis: 'scraped', note: null },
          { beachId: 'test-beach', day: '2026-07-04', state: 'open', basis: 'scraped', note: null },
        ]}
        historyFrom="2026-07-01"
        historyTo="2026-07-14"
      />,
    )

    const cells = document.querySelectorAll('.beach-detail-history ol li')
    expect(cells).toHaveLength(14)
    expect(cells[0]).toHaveAttribute('data-state', 'none')
    expect(cells[2]).toHaveAttribute('data-state', 'advisory')
    expect(cells[3]).toHaveAttribute('data-state', 'open')
    expect(cells[3]).toHaveAttribute('title', 'Jul 4: open')
  })
})
