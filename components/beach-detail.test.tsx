import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BeachDetail, type BeachDetailProps } from '@/components/beach-detail'
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
