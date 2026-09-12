import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BeachDetail, type BeachDetailProps } from '@/components/beach-detail'
import type { Beach } from '@/lib/seed/beaches'
import type { LiveStatus, ReplayStatus, StatusView } from '@/lib/status'

describe('BeachDetail', () => {
  const mockOnBack = vi.fn()

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

  const makeLiveStatus = (state: 'open' | 'advisory' | 'closed' | 'offseason', overrides: Partial<LiveStatus> = {}): LiveStatus => ({
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
    onBack: mockOnBack,
  }

  beforeEach(() => {
    mockOnBack.mockClear()
  })

  it('renders beach name and community', () => {
    render(
      <BeachDetail
        beach={createBeach()}
        status={undefined}
        {...baseProps}
      />
    )

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Test Beach')
    expect(screen.getByText(/Atlantic Ocean/)).toBeInTheDocument()
    expect(screen.getByText(/Test Community/)).toBeInTheDocument()
  })

  it('live status with verbatim quote shows the quoted text and source link', () => {
    const status = makeLiveStatus('advisory', {
      verbatim: 'Water quality advisory in effect',
      sourceUrl: 'https://hrm.example.com/beach',
    })
    render(
      <BeachDetail
        beach={createBeach()}
        status={status}
        {...baseProps}
      />
    )

    expect(screen.getByText(/Water quality advisory in effect/i)).toBeInTheDocument()
    const sourceLink = screen.getByRole('link', { name: /open the source page/i })
    expect(sourceLink).toHaveAttribute('href', 'https://hrm.example.com/beach')
    expect(sourceLink).toHaveAttribute('target', '_blank')
  })

  it('live status with postedAt shows "Posted" timestamp', () => {
    const status = makeLiveStatus('open', {
      postedAt: '2026-07-15T10:00:00Z',
    })
    render(
      <BeachDetail
        beach={createBeach()}
        status={status}
        {...baseProps}
      />
    )

    expect(screen.getByText(/Posted/)).toBeInTheDocument()
  })

  it('live status without postedAt shows "Confirmed" timestamp', () => {
    const status = makeLiveStatus('open', {
      postedAt: null,
      confirmedAt: '2026-07-15T12:00:00Z',
    })
    render(
      <BeachDetail
        beach={createBeach()}
        status={status}
        {...baseProps}
      />
    )

    expect(screen.getByText(/Confirmed/)).toBeInTheDocument()
  })

  it('replay status shows the replay explanation', () => {
    const status = makeReplayStatus('advisory')
    render(
      <BeachDetail
        beach={createBeach()}
        status={status}
        {...baseProps}
        replayDay="2026-07-10"
      />
    )

    expect(screen.getByText(/Replayed status for/)).toBeInTheDocument()
  })

  it('replay status with verified basis shows reconstruction note', () => {
    const status: ReplayStatus = {
      ...makeReplayStatus('closed'),
      basis: 'verified',
    }
    render(
      <BeachDetail
        beach={createBeach()}
        status={status}
        {...baseProps}
        replayDay="2026-07-10"
      />
    )

    expect(screen.getByText(/Reconstructed from dated news coverage/)).toBeInTheDocument()
  })

  it('no status shows "No status read yet" in live mode', () => {
    render(
      <BeachDetail
        beach={createBeach()}
        status={undefined}
        {...baseProps}
      />
    )

    expect(screen.getByText('No status read yet')).toBeInTheDocument()
    expect(screen.getByText(/No government source has been read/)).toBeInTheDocument()
  })

  it('no status in replay mode shows "No record for" the day', () => {
    render(
      <BeachDetail
        beach={createBeach()}
        status={undefined}
        {...baseProps}
        replayDay="2026-07-10"
      />
    )

    expect(screen.getByText(/No record for/)).toBeInTheDocument()
  })

  it('no rendered text asserts the water is safe', () => {
    const statuses: (StatusView | undefined)[] = [
      makeLiveStatus('open'),
      makeLiveStatus('advisory'),
      makeLiveStatus('closed'),
      undefined,
    ]

    statuses.forEach((status) => {
      const { unmount } = render(
        <BeachDetail
          beach={createBeach()}
          status={status}
          {...baseProps}
        />
      )

      const article = document.querySelector('article')
      expect(article?.textContent).not.toMatch(/water is safe/i)
      unmount()
    })
  })

  it('facts section shows lifeguards, water type, and authority', () => {
    render(
      <BeachDetail
        beach={createBeach({ water: 'fresh', authority: 'province' })}
        status={undefined}
        {...baseProps}
      />
    )

    expect(screen.getByText('Scheduled')).toBeInTheDocument()
    expect(screen.getByText(/Fresh water/)).toBeInTheDocument()
    expect(screen.getByText('Nova Scotia Parks')).toBeInTheDocument()
  })

  it('HRM beach shows "Halifax Regional Municipality" as authority', () => {
    render(
      <BeachDetail
        beach={createBeach({ authority: 'hrm' })}
        status={undefined}
        {...baseProps}
      />
    )

    expect(screen.getByText('Halifax Regional Municipality')).toBeInTheDocument()
  })

  it('government page link points at beach.sourceUrl', () => {
    const sourceUrl = 'https://example.com/beach-status'
    render(
      <BeachDetail
        beach={createBeach({ sourceUrl })}
        status={undefined}
        {...baseProps}
      />
    )

    const link = screen.getByRole('link', { name: /government page for this beach/i })
    expect(link).toHaveAttribute('href', sourceUrl)
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('back button calls onBack', async () => {
    const user = userEvent.setup()
    render(
      <BeachDetail
        beach={createBeach()}
        status={undefined}
        {...baseProps}
      />
    )

    const backButton = screen.getByRole('button', { name: /back to the list/i })
    await user.click(backButton)

    expect(mockOnBack).toHaveBeenCalledOnce()
  })

  it('history strip renders the correct number of day cells', () => {
    render(
      <BeachDetail
        beach={createBeach()}
        status={undefined}
        {...baseProps}
        historyFrom="2026-07-01"
        historyTo="2026-07-14"
      />
    )

    const cells = document.querySelectorAll('ol li')
    expect(cells).toHaveLength(14)
  })
})
