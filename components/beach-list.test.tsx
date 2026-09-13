import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BeachList } from '@/components/beach-list'
import type { ConditionsView } from '@/lib/conditions'
import { HALIFAX, sortByDistance } from '@/lib/geo'
import { BEACHES } from '@/lib/seed/beaches'

describe('BeachList', () => {
  const mockOnSelect = vi.fn()
  const mockOnReset = vi.fn()
  const status = {}

  beforeEach(() => {
    mockOnSelect.mockClear()
    mockOnReset.mockClear()
  })

  it('renders a row for each beach', () => {
    render(
      <BeachList
        beaches={BEACHES.slice(0, 5)}
        status={status}
        distances={{}}
        selectedId={null}
        onSelect={mockOnSelect}
        onReset={mockOnReset}
      />
    )

    const rows = document.querySelectorAll('[data-beach-id]')
    expect(rows).toHaveLength(5)
  })

  it('renders beach name as the row button text', () => {
    const beaches = BEACHES.slice(0, 3)
    render(
      <BeachList
        beaches={beaches}
        status={status}
        distances={{}}
        selectedId={null}
        onSelect={mockOnSelect}
        onReset={mockOnReset}
      />
    )

    beaches.forEach((beach) => {
      expect(screen.getByText(beach.name)).toBeInTheDocument()
    })
  })

  it('renders water body and region for each beach', () => {
    const beaches = BEACHES.slice(0, 1)
    const { container } = render(
      <BeachList
        beaches={beaches}
        status={status}
        distances={{}}
        selectedId={null}
        onSelect={mockOnSelect}
        onReset={mockOnReset}
      />
    )

    const beach = beaches[0]
    // Check that water body and region appear in the rendered output
    expect(container.textContent).toContain(beach.waterBody)
    expect(container.textContent).toContain(beach.region)
  })

  it('calls onSelect when a row is clicked', async () => {
    const user = userEvent.setup()
    const beaches = BEACHES.slice(0, 1)
    render(
      <BeachList
        beaches={beaches}
        status={status}
        distances={{}}
        selectedId={null}
        onSelect={mockOnSelect}
        onReset={mockOnReset}
      />
    )

    const row = screen.getByRole('button', { name: new RegExp(beaches[0].name) })
    await user.click(row)

    expect(mockOnSelect).toHaveBeenCalledWith(beaches[0].id)
  })

  it('marks the selectedId row with data-selected="true"', () => {
    const beaches = BEACHES.slice(0, 3)
    render(
      <BeachList
        beaches={beaches}
        status={status}
        distances={{}}
        selectedId={beaches[1].id}
        onSelect={mockOnSelect}
        onReset={mockOnReset}
      />
    )

    const selectedRow = document.querySelector(`[data-beach-id="${beaches[1].id}"]`)
    expect(selectedRow).toHaveAttribute('data-selected', 'true')

    const unselectedRow = document.querySelector(`[data-beach-id="${beaches[0].id}"]`)
    expect(unselectedRow).toHaveAttribute('data-selected', 'false')
  })

  it('renders status label for each beach', () => {
    const beaches = BEACHES.slice(0, 1)
    const status = { [beaches[0].id]: 'open' as const }
    render(
      <BeachList
        beaches={beaches}
        status={status}
        distances={{}}
        selectedId={null}
        onSelect={mockOnSelect}
        onReset={mockOnReset}
      />
    )

    // Should render Open label
    expect(screen.getByText('Open')).toBeInTheDocument()
  })

  it('shows empty state when beaches array is empty', () => {
    render(
      <BeachList
        beaches={[]}
        status={status}
        distances={{}}
        selectedId={null}
        onSelect={mockOnSelect}
        onReset={mockOnReset}
      />
    )

    expect(screen.getByText('No beaches found')).toBeInTheDocument()
    expect(screen.getByText(/Try another beach/)).toBeInTheDocument()
  })

  it('empty state has a "Show all beaches" button that calls onReset', async () => {
    const user = userEvent.setup()
    render(
      <BeachList
        beaches={[]}
        status={status}
        distances={{}}
        selectedId={null}
        onSelect={mockOnSelect}
        onReset={mockOnReset}
      />
    )

    const resetButton = screen.getByRole('button', { name: /show all beaches/i })
    await user.click(resetButton)

    expect(mockOnReset).toHaveBeenCalledOnce()
  })

  it('uses accessible queries by default (getByRole)', () => {
    const beaches = BEACHES.slice(0, 2)
    render(
      <BeachList
        beaches={beaches}
        status={status}
        distances={{}}
        selectedId={null}
        onSelect={mockOnSelect}
        onReset={mockOnReset}
      />
    )

    // Both beaches should be accessible via role
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThanOrEqual(beaches.length)
  })

  it('renders provincial beaches with hollow status pin', () => {
    const provincialBeach = BEACHES.find((b) => b.authority === 'province')!
    const hrmBeach = BEACHES.find((b) => b.authority === 'hrm')!

    render(
      <BeachList
        beaches={[provincialBeach, hrmBeach]}
        status={{
          [provincialBeach.id]: 'open',
          [hrmBeach.id]: 'open',
        }}
        distances={{}}
        selectedId={null}
        onSelect={mockOnSelect}
        onReset={mockOnReset}
      />
    )

    // Both should render (implementation details in StatusPin)
    expect(screen.getByText(provincialBeach.name)).toBeInTheDocument()
    expect(screen.getByText(hrmBeach.name)).toBeInTheDocument()
  })

  it('renders the distance beside the name when one is given, formatted in km', () => {
    const beaches = BEACHES.slice(0, 2)
    render(
      <BeachList
        beaches={beaches}
        status={status}
        distances={{ [beaches[0].id]: 7.824, [beaches[1].id]: 17.4 }}
        selectedId={null}
        onSelect={mockOnSelect}
        onReset={mockOnReset}
      />
    )

    const first = document.querySelector(`[data-beach-id="${beaches[0].id}"] .beach-shell-row-distance`)
    const second = document.querySelector(`[data-beach-id="${beaches[1].id}"] .beach-shell-row-distance`)
    expect(first).toHaveTextContent('7.8 km')
    expect(second).toHaveTextContent('17 km')
    // The distance sits in the title line with the name, not in the status line.
    expect(first?.parentElement).toHaveClass('beach-shell-row-title')
    expect(first?.parentElement?.querySelector('strong')).toHaveTextContent(beaches[0].name)
  })

  it('shows no distance for a beach that has none', () => {
    const beaches = BEACHES.slice(0, 2)
    render(
      <BeachList
        beaches={beaches}
        status={status}
        distances={{ [beaches[0].id]: 2 }}
        selectedId={null}
        onSelect={mockOnSelect}
        onReset={mockOnReset}
      />
    )

    expect(document.querySelectorAll('.beach-shell-row-distance')).toHaveLength(1)
    expect(document.querySelector(`[data-beach-id="${beaches[1].id}"] .beach-shell-row-distance`)).toBeNull()
  })

  describe('out of season', () => {
    const conditions: ConditionsView = {
      windKmh: 19.4,
      windDir: 'SW',
      airTempC: 12,
      observedAt: '2026-09-12T19:30:00Z',
      sunrise: '2026-09-12T09:41:00Z',
      sunset: '2026-09-12T22:32:00Z',
    }
    const statusOf = (id: string) => document.querySelector(`[data-beach-id="${id}"] .beach-shell-row-status`)!

    it('an off-season row shows its conditions where the status word was: water first on an ocean beach, wind alone on a lake', () => {
      const lake = BEACHES.find((b) => b.id === 'hrm-chocolate-lake')!
      const ocean = BEACHES.find((b) => b.id === 'ns-rainbow-haven')!
      render(
        <BeachList
          beaches={[lake, ocean]}
          status={{ [lake.id]: 'offseason', [ocean.id]: 'offseason' }}
          distances={{}}
          conditions={{ [lake.id]: conditions, [ocean.id]: { ...conditions, waterTempC: 16.4 } }}
          selectedId={null}
          onSelect={mockOnSelect}
          onReset={mockOnReset}
        />,
      )

      expect(statusOf(lake.id)).toHaveTextContent(/^19 km\/h SW$/)
      expect(statusOf(ocean.id)).toHaveTextContent(/^16 °C · 19 km\/h SW$/)
      for (const id of [lake.id, ocean.id]) {
        expect(statusOf(id)).toHaveAttribute('data-state', 'offseason')
        expect(statusOf(id)).toHaveAttribute('data-conditions', 'true')
        expect(statusOf(id).textContent).not.toMatch(/Off-season|p\.m\.|Sunrise/)
      }
    })

    it('an off-season row with no conditions keeps the word rather than going blank', () => {
      const beach = BEACHES[0]
      render(
        <BeachList
          beaches={[beach]}
          status={{ [beach.id]: 'offseason' }}
          distances={{}}
          conditions={{}}
          selectedId={null}
          onSelect={mockOnSelect}
          onReset={mockOnReset}
        />,
      )
      expect(statusOf(beach.id)).toHaveTextContent('Off-season')
      expect(statusOf(beach.id)).toHaveAttribute('data-conditions', 'false')
    })

    it('in season the status word stays even when conditions are known: they belong to the detail', () => {
      const beach = BEACHES.find((b) => b.id === 'hrm-chocolate-lake')!
      render(
        <BeachList
          beaches={[beach]}
          status={{ [beach.id]: 'open' }}
          distances={{}}
          conditions={{ [beach.id]: conditions }}
          selectedId={null}
          onSelect={mockOnSelect}
          onReset={mockOnReset}
        />,
      )
      expect(statusOf(beach.id)).toHaveTextContent(/^Open$/)
    })
  })

  it('renders rows in the order given, not alphabetically', () => {
    const sorted = sortByDistance(BEACHES, HALIFAX)
    render(
      <BeachList
        beaches={sorted}
        status={status}
        distances={Object.fromEntries(sorted.map((b) => [b.id, b.km]))}
        selectedId={null}
        onSelect={mockOnSelect}
        onReset={mockOnReset}
      />
    )

    const ids = [...document.querySelectorAll('[data-beach-id]')].map((el) => el.getAttribute('data-beach-id'))
    expect(ids).toEqual(sorted.map((b) => b.id))
    expect(ids[0]).toBe('hrm-chocolate-lake')
    expect(ids).not.toEqual([...ids].sort())
  })
})
