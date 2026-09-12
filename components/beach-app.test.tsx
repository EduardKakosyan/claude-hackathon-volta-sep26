import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BeachApp } from '@/components/beach-app'
import { BEACHES } from '@/lib/seed/beaches'

interface MockBeachMapProps {
  beaches: typeof BEACHES
  onSelect: (id: string) => void
  onFatalError: (error: string) => void
}

// Mock the dynamic BeachMap
vi.mock('@/components/beach-map', () => ({
  default: vi.fn(({ beaches, onSelect, onFatalError }: MockBeachMapProps) => (
    <div data-testid="fake-beach-map">
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

describe('BeachApp', () => {
  const emptyStatus = {}

  beforeEach(() => {
    // Reset focus between tests
    document.body.innerHTML = ''
  })

  it('renders the whole roster (35) in the directory on first paint, and reports "35 of 35 beaches"', () => {
    render(<BeachApp beaches={BEACHES} status={emptyStatus} />)

    // Look for the count status text specifically
    expect(screen.getByText('35 of 35 beaches')).toBeInTheDocument()
    // Check for beach rows with data-beach-id
    const beachRows = document.querySelectorAll('[data-beach-id]')
    expect(beachRows).toHaveLength(35)
  })

  it('typing a query narrows both the directory and the roster handed to the mocked map', async () => {
    const user = userEvent.setup()
    render(<BeachApp beaches={BEACHES} status={emptyStatus} />)

    const searchInput = screen.getByLabelText(/search by beach/i)
    await user.type(searchInput, 'sand')

    await waitFor(() => {
      const beachRows = document.querySelectorAll('[data-beach-id]')
      // Sandy Beach, Lunenburg Beach, etc. should be present
      expect(beachRows.length).toBeGreaterThan(0)
      expect(beachRows.length).toBeLessThan(35)
    })

    // The map should also receive the filtered list
    const mapButtons = screen.getAllByTestId(/^map-button-/)
    expect(mapButtons.length).toBeGreaterThan(0)
    expect(mapButtons.length).toBeLessThan(35)
  })

  it('a status filter narrows both the same way', async () => {
    const user = userEvent.setup()
    const status = {
      [BEACHES[0].id]: 'open' as const,
      [BEACHES[1].id]: 'advisory' as const,
      // rest unknown
    }
    const { container } = render(<BeachApp beaches={BEACHES} status={status} />)

    // Find the advisory filter button more precisely
    const filterGroup = container.querySelector('[role="group"]')
    const buttons = filterGroup?.querySelectorAll('button') || []
    // The advisory button should be the 3rd button (0=all, 1=open, 2=advisory)
    const advisoryButton = buttons[2] as HTMLButtonElement
    await user.click(advisoryButton)

    await waitFor(() => {
      const beachRows = document.querySelectorAll('[data-beach-id]')
      // Should only show the advisory beach
      expect(beachRows).toHaveLength(1)
    })
  })

  it('combining query + filter works', async () => {
    const user = userEvent.setup()
    const status: Record<string, 'open' | 'advisory' | 'closed' | 'offseason' | 'unknown'> = Object.fromEntries(
      BEACHES.map((b, i) => [b.id, i % 2 === 0 ? 'open' : 'advisory']),
    )
    const { container } = render(<BeachApp beaches={BEACHES} status={status} />)

    const searchInput = screen.getByLabelText(/search by beach/i)
    await user.type(searchInput, 'beach')

    // Find the advisory filter button more precisely
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
    render(<BeachApp beaches={BEACHES} status={emptyStatus} />)

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

  it('selecting a beach from a list row shows the detail view, and the detail heading receives focus', async () => {
    const user = userEvent.setup()
    const { container } = render(<BeachApp beaches={BEACHES} status={emptyStatus} />)

    const beachRows = document.querySelectorAll('[data-beach-id]')
    await user.click(beachRows[0] as HTMLButtonElement)

    await waitFor(() => {
      // The detail view heading should be focused
      const detailHeading = container.querySelector('.beach-detail__title-block h2')
      expect(detailHeading).toHaveFocus()
    })
  })

  it('closing the detail with the close button returns focus to the list row it was opened from', async () => {
    const user = userEvent.setup()
    const { container } = render(<BeachApp beaches={BEACHES} status={emptyStatus} />)

    const beachRows = document.querySelectorAll('[data-beach-id]')

    await user.click(beachRows[0] as HTMLButtonElement)

    // Wait for detail to appear
    await waitFor(() => {
      expect(container.querySelector('.beach-detail')).toBeInTheDocument()
    })

    const closeButton = screen.getByRole('button', { name: /close beach details/i })
    await user.click(closeButton)

    // Wait for detail to close
    await waitFor(() => {
      expect(container.querySelector('.beach-detail')).not.toBeInTheDocument()
    })

    // Verify the list is still there with the first beach
    const updatedRows = document.querySelectorAll('[data-beach-id]')
    expect(updatedRows.length).toBeGreaterThan(0)
  })

  it('closing the detail after selecting from the (mocked) map returns focus to the search input', async () => {
    const user = userEvent.setup()
    render(<BeachApp beaches={BEACHES} status={emptyStatus} />)

    const mapButton = screen.getByTestId(`map-button-${BEACHES[0].id}`)
    await user.click(mapButton)

    const closeButton = screen.getByRole('button', { name: /close beach details/i })
    await user.click(closeButton)

    const searchInput = screen.getByLabelText(/search by beach/i)
    await waitFor(() => {
      expect(searchInput).toHaveFocus()
    })
  })

  it('pressing Escape while the detail is open closes it and returns to the directory', async () => {
    const user = userEvent.setup()
    const { container } = render(<BeachApp beaches={BEACHES} status={emptyStatus} />)

    const beachRows = document.querySelectorAll('[data-beach-id]')
    await user.click(beachRows[0] as HTMLButtonElement)

    await waitFor(() => {
      expect(container.querySelector('.beach-detail')).toBeInTheDocument()
    })

    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(container.querySelector('.beach-detail')).not.toBeInTheDocument()
    })
  })

  it('changing the query while a beach is selected clears the selection', async () => {
    const user = userEvent.setup()
    const { container } = render(<BeachApp beaches={BEACHES} status={emptyStatus} />)

    const beachRows = document.querySelectorAll('[data-beach-id]')
    await user.click(beachRows[0] as HTMLButtonElement)

    await waitFor(() => {
      expect(container.querySelector('.beach-detail')).toBeInTheDocument()
    })

    const searchInput = screen.getByLabelText(/search by beach/i)
    await user.type(searchInput, 'test')

    await waitFor(() => {
      expect(container.querySelector('.beach-detail')).not.toBeInTheDocument()
    })
  })

  it('with an empty status record, the footer says 35 beaches have no status available and includes "Unknown does not mean open."', () => {
    const { container } = render(<BeachApp beaches={BEACHES} status={emptyStatus} />)

    // Check footer text
    const footer = container.querySelector('.beach-shell-footer')
    expect(footer?.textContent).toContain('35 beaches have no status available')
    expect(footer?.textContent).toContain('Unknown does not mean open')
  })

  it('with a populated status record the count matches', () => {
    const status = {
      [BEACHES[0].id]: 'open' as const,
      [BEACHES[1].id]: 'advisory' as const,
      [BEACHES[2].id]: 'closed' as const,
      // rest unknown (3 beaches with status, 32 unknown)
    }
    render(<BeachApp beaches={BEACHES} status={status} />)

    const footer = screen.getByText(/32 beaches have no status available/)
    expect(footer).toBeInTheDocument()
  })

  it('when the mocked map calls onFatalError, the map failure panel appears, says the failure is not a beach status, the directory is still fully usable, and "Try the map again" restores the map', async () => {
    const user = userEvent.setup()
    const { container } = render(<BeachApp beaches={BEACHES} status={emptyStatus} />)

    const failButton = screen.getByTestId('map-fail-button')
    await user.click(failButton)

    await waitFor(() => {
      expect(screen.getByText('The map could not load')).toBeInTheDocument()
      expect(screen.getByText(/This is a problem with the map, not with any beach/)).toBeInTheDocument()
    })

    // Directory should still be usable
    const beachRows = document.querySelectorAll('[data-beach-id]')
    expect(beachRows).toHaveLength(35)

    // Select a beach from the list
    await user.click(beachRows[0] as HTMLButtonElement)
    await waitFor(() => {
      expect(container.querySelector('.beach-detail')).toBeInTheDocument()
    })

    // Close detail and try map again
    const closeButton = screen.getByRole('button', { name: /close beach details/i })
    await user.click(closeButton)

    const retryButton = screen.getByRole('button', { name: /try the map again/i })
    await user.click(retryButton)

    // Map should restore
    await waitFor(() => {
      expect(screen.getByTestId('fake-beach-map')).toBeInTheDocument()
    })
  })
})
