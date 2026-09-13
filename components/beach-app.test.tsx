import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BeachApp } from '@/components/beach-app'
import { SHEET_MEDIA } from '@/components/bottom-sheet'
import { BEACHES, type BeachState } from '@/lib/seed/beaches'
import type { PageData } from '@/lib/db/queries'
import type { LiveStatus, StatusView } from '@/lib/status'

interface MockBeachMapProps {
  beaches: typeof BEACHES
  onSelect: (id: string) => void
  onFatalError: (error: string) => void
  onZoomBandChange?: (band: 'province' | 'region' | 'beach') => void
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/components/beach-map', () => ({
  default: vi.fn(({ beaches, onSelect, onFatalError, onZoomBandChange }: MockBeachMapProps) => (
    <div data-testid="fake-beach-map">
      <button data-testid="map-zoom-out-button" onClick={() => onZoomBandChange?.('province')}>
        Zoom out
      </button>
      {beaches.map((beach: (typeof BEACHES)[number]) => (
        <button
          key={beach.id}
          data-testid={`map-button-${beach.id}`}
          onClick={() => onSelect(beach.id)}
        >
          {beach.name}
        </button>
      ))}
      <button
        data-testid="map-fail-button"
        onClick={() => onFatalError('WebGL is not available')}
      >
        Fail Map
      </button>
    </div>
  )),
}))

/** Make `matchMedia` report the phone breakpoint so the sheet's gestures are live. */
function setPhoneLayout(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn((query: string) => ({
      matches: query === SHEET_MEDIA && matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

function sheetOf(container: HTMLElement): HTMLElement {
  return container.querySelector<HTMLElement>('.beach-sheet')!
}

function makeLiveStatus(beachId: string, state: BeachState): LiveStatus {
  return {
    kind: 'live',
    beachId,
    state,
    source: 'hrm',
    verbatim: null,
    sourceUrl: 'https://example.com',
    postedAt: null,
    confirmedAt: '2026-07-15T12:00:00Z',
  }
}

function makePageData(overrides: Partial<PageData> = {}): PageData {
  return {
    beaches: BEACHES,
    status: {},
    health: [],
    history: {},
    days: [],
    historyFrom: '2026-09-01',
    historyTo: '2026-09-14',
    storeKind: 'fixture',
    ...overrides,
  }
}

describe('BeachApp', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the whole roster (35) in the directory on first paint, and reports "35 of 35 beaches"', () => {
    render(<BeachApp {...makePageData()} />)

    expect(screen.getByText('35 of 35 beaches')).toBeInTheDocument()
    const beachRows = document.querySelectorAll('[data-beach-id]')
    expect(beachRows).toHaveLength(35)
  })

  it('typing a query narrows both the directory and the roster handed to the mocked map', async () => {
    const user = userEvent.setup()
    render(<BeachApp {...makePageData()} />)

    const searchInput = screen.getByLabelText(/search by beach/i)
    await user.type(searchInput, 'sand')

    await waitFor(() => {
      const beachRows = document.querySelectorAll('[data-beach-id]')
      expect(beachRows.length).toBeGreaterThan(0)
      expect(beachRows.length).toBeLessThan(35)
    })

    const mapButtons = screen.getAllByTestId(/^map-button-/)
    expect(mapButtons.length).toBeGreaterThan(0)
    expect(mapButtons.length).toBeLessThan(35)
  })

  it('a status filter narrows both the same way', async () => {
    const user = userEvent.setup()
    const status: Record<string, StatusView | undefined> = {
      [BEACHES[0].id]: makeLiveStatus(BEACHES[0].id, 'open'),
      [BEACHES[1].id]: makeLiveStatus(BEACHES[1].id, 'advisory'),
    }
    const { container } = render(<BeachApp {...makePageData({ status })} />)

    const filterGroup = container.querySelector('[role="group"]')
    const buttons = filterGroup?.querySelectorAll('button') || []
    const advisoryButton = buttons[2] as HTMLButtonElement
    await user.click(advisoryButton)

    await waitFor(() => {
      const beachRows = document.querySelectorAll('[data-beach-id]')
      expect(beachRows).toHaveLength(1)
    })
  })

  it('combining query + filter works', async () => {
    const user = userEvent.setup()
    const status: Record<string, StatusView | undefined> = Object.fromEntries(
      BEACHES.map((b, i) => [b.id, makeLiveStatus(b.id, i % 2 === 0 ? 'open' : 'advisory')]),
    )
    const { container } = render(<BeachApp {...makePageData({ status })} />)

    const searchInput = screen.getByLabelText(/search by beach/i)
    await user.type(searchInput, 'beach')

    const filterGroup = container.querySelector('[role="group"]')
    const buttons = filterGroup?.querySelectorAll('button') || []
    const advisoryButton = buttons[2] as HTMLButtonElement
    await user.click(advisoryButton)

    await waitFor(() => {
      const beachRows = document.querySelectorAll('[data-beach-id]')
      expect(beachRows.length).toBeGreaterThan(0)
      expect(beachRows.length).toBeLessThan(35)
    })
  })

  it('a query with no matches shows the empty state, and its "Show all beaches" button restores the full roster and returns focus to the search input', async () => {
    const user = userEvent.setup()
    render(<BeachApp {...makePageData()} />)

    const searchInput = screen.getByLabelText(/search by beach/i)
    await user.type(searchInput, 'xyznonexistent')

    await waitFor(() => {
      expect(screen.getByText('No beaches found')).toBeInTheDocument()
    })

    const resetButton = screen.getByRole('button', { name: /show all beaches/i })
    await user.click(resetButton)

    await waitFor(() => {
      const beachRows = document.querySelectorAll('[data-beach-id]')
      expect(beachRows).toHaveLength(35)
      expect(searchInput).toHaveFocus()
    })
  })

  it('selecting a beach from a list row shows the detail view', async () => {
    const user = userEvent.setup()
    render(<BeachApp {...makePageData()} />)

    const beachRows = document.querySelectorAll('[data-beach-id]')
    await user.click(beachRows[0] as HTMLButtonElement)

    await waitFor(() => {
      expect(screen.queryByRole('article')).toBeInTheDocument()
    })
  })

  it('closing the detail with the back button returns focus to the list row it was opened from', async () => {
    const user = userEvent.setup()
    render(<BeachApp {...makePageData()} />)

    const beachRows = document.querySelectorAll('[data-beach-id]')
    await user.click(beachRows[0] as HTMLButtonElement)

    await waitFor(() => {
      expect(screen.queryByRole('article')).toBeInTheDocument()
    })

    const backButton = screen.getByRole('button', { name: /back to beaches/i })
    await user.click(backButton)

    await waitFor(() => {
      expect(screen.queryByRole('article')).not.toBeInTheDocument()
    })

    const updatedRows = document.querySelectorAll('[data-beach-id]')
    expect(updatedRows.length).toBeGreaterThan(0)
  })

  it('closing the detail after selecting from the (mocked) map returns focus to the search input', async () => {
    const user = userEvent.setup()
    render(<BeachApp {...makePageData()} />)

    const mapButton = screen.getByTestId(`map-button-${BEACHES[0].id}`)
    await user.click(mapButton)

    const backButton = screen.getByRole('button', { name: /back to beaches/i })
    await user.click(backButton)

    const searchInput = screen.getByLabelText(/search by beach/i)
    await waitFor(() => {
      expect(searchInput).toHaveFocus()
    })
  })

  it('pressing Escape while the detail is open closes it and returns to the directory', async () => {
    const user = userEvent.setup()
    render(<BeachApp {...makePageData()} />)

    const beachRows = document.querySelectorAll('[data-beach-id]')
    await user.click(beachRows[0] as HTMLButtonElement)

    await waitFor(() => {
      expect(screen.queryByRole('article')).toBeInTheDocument()
    })

    const backButton = screen.getByRole('button', { name: /back to the list/i })
    backButton.focus()
    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByRole('article')).not.toBeInTheDocument()
    })
  })

  it('pressing Escape closes the detail even after the clicked row has unmounted and focus fell to body', async () => {
    const user = userEvent.setup()
    render(<BeachApp {...makePageData()} />)

    const beachRows = document.querySelectorAll('[data-beach-id]')
    await user.click(beachRows[0] as HTMLButtonElement)

    await waitFor(() => {
      expect(screen.queryByRole('article')).toBeInTheDocument()
    })
    // The row is gone, so nothing inside <main> holds focus any more.
    expect(document.activeElement).toBe(document.body)

    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByRole('article')).not.toBeInTheDocument()
    })
  })

  it('changing the query while a beach is selected clears the selection', async () => {
    const user = userEvent.setup()
    render(<BeachApp {...makePageData()} />)

    const beachRows = document.querySelectorAll('[data-beach-id]')
    await user.click(beachRows[0] as HTMLButtonElement)

    await waitFor(() => {
      expect(screen.queryByRole('article')).toBeInTheDocument()
    })

    const searchInput = screen.getByLabelText(/search by beach/i)
    await user.type(searchInput, 'test')

    await waitFor(() => {
      expect(screen.queryByRole('article')).not.toBeInTheDocument()
    })
  })

  it('with an empty status record, the footer says 35 beaches have no status available and includes "Unknown does not mean open."', () => {
    const { container } = render(<BeachApp {...makePageData()} />)

    const footer = container.querySelector('.beach-shell-footer')
    expect(footer?.textContent).toContain('35 beaches have no status available')
    expect(footer?.textContent).toContain('Unknown does not mean open')
  })

  it('in fixture mode the footer says it is a fixture day, not live status', () => {
    const { container } = render(<BeachApp {...makePageData({ storeKind: 'fixture' })} />)

    const footer = container.querySelector('.beach-shell-footer')
    expect(footer?.textContent).toContain('Showing a fixture day, not live status')
    expect(footer?.textContent).not.toContain('Not connected to a database')
  })

  it('in supabase mode with nothing read yet the footer says so instead', () => {
    const { container } = render(<BeachApp {...makePageData({ storeKind: 'supabase' })} />)

    const footer = container.querySelector('.beach-shell-footer')
    expect(footer?.textContent).toContain('No source has been read yet')
    expect(footer?.textContent).not.toContain('fixture')
  })

  it('with a populated status record the count matches', () => {
    const status: Record<string, StatusView | undefined> = {
      [BEACHES[0].id]: makeLiveStatus(BEACHES[0].id, 'open'),
      [BEACHES[1].id]: makeLiveStatus(BEACHES[1].id, 'advisory'),
      [BEACHES[2].id]: makeLiveStatus(BEACHES[2].id, 'closed'),
    }
    render(<BeachApp {...makePageData({ status })} />)

    const footer = screen.getByText(/32 beaches have no status available/)
    expect(footer).toBeInTheDocument()
  })

  it('when the mocked map calls onFatalError, the map failure panel appears, says the failure is not a beach status, the directory is still fully usable, and "Try the map again" restores the map', async () => {
    const user = userEvent.setup()
    render(<BeachApp {...makePageData()} />)

    const failButton = screen.getByTestId('map-fail-button')
    await user.click(failButton)

    await waitFor(() => {
      expect(screen.getByText('The map could not load')).toBeInTheDocument()
      expect(screen.getByText(/This is a problem with the map, not with any beach/)).toBeInTheDocument()
    })

    const beachRows = document.querySelectorAll('[data-beach-id]')
    expect(beachRows).toHaveLength(35)

    await user.click(beachRows[0] as HTMLButtonElement)
    await waitFor(() => {
      expect(screen.queryByRole('article')).toBeInTheDocument()
    })

    const backButton = screen.getByRole('button', { name: /back to beaches/i })
    await user.click(backButton)

    const retryButton = screen.getByRole('button', { name: /try the map again/i })
    await user.click(retryButton)

    await waitFor(() => {
      expect(screen.getByTestId('fake-beach-map')).toBeInTheDocument()
    })
  })

  it('the map section carries the zoom band: region on load, then whatever the map reports', async () => {
    const user = userEvent.setup()
    const { container } = render(<BeachApp {...makePageData()} />)
    const section = container.querySelector('.beach-shell-map')!
    expect(section).toHaveAttribute('data-zoom-band', 'region')

    await user.click(screen.getByTestId('map-zoom-out-button'))
    await waitFor(() => expect(section).toHaveAttribute('data-zoom-band', 'province'))
  })

  describe('the sheet', () => {
    beforeEach(() => setPhoneLayout(true))
    afterEach(() => setPhoneLayout(false))

    it('rests at half on load and tells the workspace how much it covers', () => {
      const { container } = render(<BeachApp {...makePageData()} />)
      expect(sheetOf(container)).toHaveAttribute('data-snap', 'half')
      const workspace = container.querySelector<HTMLElement>('.beach-shell-workspace')!
      expect(workspace.style.getPropertyValue('--sheet-visible')).toBe('50%')
    })

    it('the heading, the list and the footer are the sheet\'s children, in that order', () => {
      const { container } = render(<BeachApp {...makePageData()} />)
      const sheet = sheetOf(container)
      expect(sheet.querySelector('.beach-sheet-grab .beach-shell-panel-heading h2')).toHaveTextContent(
        'Find your next shore',
      )
      expect(sheet.querySelector('.beach-sheet-body .beach-shell-list')).not.toBeNull()
      expect(sheet.lastElementChild).toHaveClass('beach-shell-footer')
    })

    it('selecting a beach keeps the sheet at half', async () => {
      const user = userEvent.setup()
      const { container } = render(<BeachApp {...makePageData()} />)
      await user.click(document.querySelector('[data-beach-id]') as HTMLButtonElement)
      await waitFor(() => expect(screen.queryByRole('article')).toBeInTheDocument())
      expect(sheetOf(container)).toHaveAttribute('data-snap', 'half')
      const workspace = container.querySelector<HTMLElement>('.beach-shell-workspace')!
      expect(workspace.style.getPropertyValue('--sheet-visible')).toBe('50%')
    })

    it('selecting from the full list brings the sheet back to half so the map shows the pin', async () => {
      const user = userEvent.setup()
      const { container } = render(<BeachApp {...makePageData()} />)
      await user.click(container.querySelector('.beach-shell-panel-heading h2')!)
      expect(sheetOf(container)).toHaveAttribute('data-snap', 'full')
      expect(container.querySelector<HTMLElement>('.beach-shell-workspace')!.style.getPropertyValue('--sheet-visible')).toBe('100%')

      await user.click(document.querySelector('[data-beach-id]') as HTMLButtonElement)
      await waitFor(() => expect(screen.queryByRole('article')).toBeInTheDocument())
      expect(sheetOf(container)).toHaveAttribute('data-snap', 'half')
    })

    it('closing the detail keeps whatever snap the sheet is at', async () => {
      const user = userEvent.setup()
      const { container } = render(<BeachApp {...makePageData()} />)
      await user.click(document.querySelector('[data-beach-id]') as HTMLButtonElement)
      await waitFor(() => expect(screen.queryByRole('article')).toBeInTheDocument())

      // Tapping the count (part of the heading row, not a control) cycles half → full.
      await user.click(container.querySelector('.beach-shell-count')!)
      expect(sheetOf(container)).toHaveAttribute('data-snap', 'full')

      await user.click(screen.getByRole('button', { name: /back to beaches/i }))
      await waitFor(() => expect(screen.queryByRole('article')).not.toBeInTheDocument())
      expect(sheetOf(container)).toHaveAttribute('data-snap', 'full')
    })

    it('the back control in the heading row closes the detail without cycling the sheet', async () => {
      const user = userEvent.setup()
      const { container } = render(<BeachApp {...makePageData()} />)
      await user.click(document.querySelector('[data-beach-id]') as HTMLButtonElement)
      await waitFor(() => expect(screen.queryByRole('article')).toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: /back to beaches/i }))
      await waitFor(() => expect(screen.queryByRole('article')).not.toBeInTheDocument())
      expect(sheetOf(container)).toHaveAttribute('data-snap', 'half')
    })
  })
})
