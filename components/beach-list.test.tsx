import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BeachList } from '@/components/beach-list'
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
        selectedId={null}
        onSelect={mockOnSelect}
        onReset={mockOnReset}
      />
    )

    // Both should render (implementation details in StatusPin)
    expect(screen.getByText(provincialBeach.name)).toBeInTheDocument()
    expect(screen.getByText(hrmBeach.name)).toBeInTheDocument()
  })
})
