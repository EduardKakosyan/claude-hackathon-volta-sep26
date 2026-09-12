import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BeachDetail } from '@/components/beach-detail'
import type { Beach } from '@/lib/seed/beaches'
import type { PinState } from '@/lib/beach-status'

describe('BeachDetail', () => {
  const mockOnClose = vi.fn()

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

  beforeEach(() => {
    mockOnClose.mockClear()
  })

  describe('all states × both authorities', () => {
    const states: PinState[] = ['open', 'advisory', 'closed', 'offseason', 'unknown']
    const authorities = ['hrm', 'province'] as const

    states.forEach((state) => {
      authorities.forEach((authority) => {
        it(`renders ${state} for ${authority} with non-empty label and explanation`, () => {
          const beach = createBeach({ authority })
          render(
            <BeachDetail
              beach={beach}
              state={state}
              onClose={mockOnClose}
            />
          )

          // All states should have a label in the status section
          const statusDiv = document.querySelector('[data-state]')
          expect(statusDiv).toBeInTheDocument()
          const heading = statusDiv?.querySelector('h3')
          expect(heading?.textContent).toBeTruthy()
          expect(heading?.textContent).not.toBe('')

          // All states should have an explanation paragraph
          const paragraphs = statusDiv?.querySelectorAll('p') || []
          expect(paragraphs.length).toBeGreaterThan(0)
        })
      })
    })
  })

  it('provincial open shows "No advisory posted" and the provincial caveat', () => {
    const beach = createBeach({ authority: 'province' })
    render(
      <BeachDetail
        beach={beach}
        state="open"
        onClose={mockOnClose}
      />
    )

    expect(screen.getByText('No advisory posted')).toBeInTheDocument()
    expect(screen.getByText(/hollow pin identifies a provincial beach/)).toBeInTheDocument()
  })

  it('unknown shows "No status available" and wording containing "does not mean open"', () => {
    const beach = createBeach()
    const { container } = render(
      <BeachDetail
        beach={beach}
        state="unknown"
        onClose={mockOnClose}
      />
    )

    const statusDiv = container.querySelector('[data-state="unknown"]')
    expect(statusDiv?.textContent).toContain('No status available')
    expect(statusDiv?.textContent).toContain('Unknown does not mean open')
  })

  it('no rendered text asserts the water is safe', () => {
    const states: PinState[] = ['open', 'advisory', 'closed', 'offseason', 'unknown']

    states.forEach((state) => {
      const { unmount } = render(
        <BeachDetail
          beach={createBeach()}
          state={state}
          onClose={mockOnClose}
        />
      )

      const section = document.querySelector('section[class*="beach-detail"]')
      const allText = section?.textContent || ''
      expect(allText).not.toMatch(/water is safe/i)
      unmount()
    })
  })

  it('official source link points at beach.sourceUrl, opens in a new tab with rel="noopener noreferrer"', () => {
    const sourceUrl = 'https://example.com/beach-status'
    const beach = createBeach({ sourceUrl })
    render(
      <BeachDetail
        beach={beach}
        state="open"
        onClose={mockOnClose}
      />
    )

    const sourceLink = screen.getByRole('link', { name: /official hrm beach status/i })
    expect(sourceLink).toHaveAttribute('href', sourceUrl)
    expect(sourceLink).toHaveAttribute('target', '_blank')
    expect(sourceLink).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('provincial beach also gets the provincial advisories link', () => {
    const beach = createBeach({ authority: 'province' })
    render(
      <BeachDetail
        beach={beach}
        state="open"
        onClose={mockOnClose}
      />
    )

    const provincialLink = screen.getByRole('link', { name: /provincial park advisories/i })
    expect(provincialLink).toHaveAttribute('href', 'https://parks.novascotia.ca/advisories')
    expect(provincialLink).toHaveAttribute('target', '_blank')
    expect(provincialLink).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('hrm beach does not have the provincial advisories link', () => {
    const beach = createBeach({ authority: 'hrm' })
    render(
      <BeachDetail
        beach={beach}
        state="open"
        onClose={mockOnClose}
      />
    )

    expect(screen.queryByRole('link', { name: /provincial park advisories/i })).not.toBeInTheDocument()
  })

  it('the directions link targets the beach\'s own coordinates', () => {
    const beach = createBeach({ lat: 44.5, lon: -63.3 })
    render(
      <BeachDetail
        beach={beach}
        state="open"
        onClose={mockOnClose}
      />
    )

    const directionsLink = screen.getByRole('link', { name: /get directions/i })
    expect(directionsLink).toHaveAttribute(
      'href',
      expect.stringContaining('44.5')
    )
    expect(directionsLink).toHaveAttribute(
      'href',
      expect.stringContaining('-63.3')
    )
  })

  it('the "no readings" section states history/measurements are unavailable', () => {
    const beach = createBeach()
    render(
      <BeachDetail
        beach={beach}
        state="open"
        onClose={mockOnClose}
      />
    )

    expect(screen.getByText('No readings to show')).toBeInTheDocument()
    expect(screen.getByText(/Sample measurements and 14-day history are unavailable/)).toBeInTheDocument()
  })

  it('for offseason state the "no readings" section also says a last in-season status is unavailable', () => {
    const beach = createBeach()
    render(
      <BeachDetail
        beach={beach}
        state="offseason"
        onClose={mockOnClose}
      />
    )

    expect(screen.getByText(/A last in-season status is not available either/)).toBeInTheDocument()
  })

  it('close button calls onClose', async () => {
    const user = userEvent.setup()
    const beach = createBeach()
    render(
      <BeachDetail
        beach={beach}
        state="open"
        onClose={mockOnClose}
      />
    )

    const closeButton = screen.getByRole('button', { name: /close beach details/i })
    await user.click(closeButton)

    expect(mockOnClose).toHaveBeenCalledOnce()
  })

  it('pressing Escape calls onClose', async () => {
    const user = userEvent.setup()
    const beach = createBeach()
    const { container } = render(
      <BeachDetail
        beach={beach}
        state="open"
        onClose={mockOnClose}
      />
    )

    const section = container.querySelector('section')
    if (section) {
      section.focus()
    }
    await user.keyboard('{Escape}')

    expect(mockOnClose).toHaveBeenCalledOnce()
  })

  it('heading receives focus on mount', () => {
    const beach = createBeach()
    render(
      <BeachDetail
        beach={beach}
        state="open"
        onClose={mockOnClose}
      />
    )

    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading).toHaveFocus()
  })
})
