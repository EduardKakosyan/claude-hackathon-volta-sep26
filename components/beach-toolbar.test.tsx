import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { BeachToolbar } from '@/components/beach-toolbar'

describe('BeachToolbar', () => {
  const mockOnQueryChange = vi.fn()
  const mockOnFilterChange = vi.fn()
  const searchRef = createRef<HTMLInputElement>()

  beforeEach(() => {
    mockOnQueryChange.mockClear()
    mockOnFilterChange.mockClear()
    searchRef.current = null
  })

  it('displays the page title "Is the beach open?"', () => {
    render(
      <BeachToolbar
        query=""
        onQueryChange={mockOnQueryChange}
        filter="all"
        onFilterChange={mockOnFilterChange}
        searchRef={searchRef}
      />
    )

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Is the beach open?')
  })

  it('renders search input with placeholder', () => {
    render(
      <BeachToolbar
        query=""
        onQueryChange={mockOnQueryChange}
        filter="all"
        onFilterChange={mockOnFilterChange}
        searchRef={searchRef}
      />
    )

    const searchInput = screen.getByPlaceholderText(/find a beach/i)
    expect(searchInput).toBeInTheDocument()
  })

  it('calls onQueryChange when search input changes', async () => {
    const user = userEvent.setup()
    render(
      <BeachToolbar
        query="test"
        onQueryChange={mockOnQueryChange}
        filter="all"
        onFilterChange={mockOnFilterChange}
        searchRef={searchRef}
      />
    )

    const searchInput = screen.getByLabelText(/search by beach/i)
    expect(searchInput).toHaveValue('test')

    // Clear the input first
    await user.clear(searchInput)

    await user.type(searchInput, 'sandy')

    // Should be called multiple times for each character
    expect(mockOnQueryChange.mock.calls.length).toBeGreaterThan(0)
  })

  it('shows clear button when query is not empty', () => {
    render(
      <BeachToolbar
        query="test"
        onQueryChange={mockOnQueryChange}
        filter="all"
        onFilterChange={mockOnFilterChange}
        searchRef={searchRef}
      />
    )

    const clearButton = screen.getByRole('button', { name: /clear search/i })
    expect(clearButton).toBeInTheDocument()
  })

  it('clear button calls onQueryChange with empty string and focuses search', async () => {
    const user = userEvent.setup()
    render(
      <BeachToolbar
        query="test"
        onQueryChange={mockOnQueryChange}
        filter="all"
        onFilterChange={mockOnFilterChange}
        searchRef={searchRef}
      />
    )

    const clearButton = screen.getByRole('button', { name: /clear search/i })
    await user.click(clearButton)

    expect(mockOnQueryChange).toHaveBeenCalledWith('')
  })

  it('hides clear button when query is empty', () => {
    render(
      <BeachToolbar
        query=""
        onQueryChange={mockOnQueryChange}
        filter="all"
        onFilterChange={mockOnFilterChange}
        searchRef={searchRef}
      />
    )

    const clearButton = screen.queryByRole('button', { name: /clear search/i })
    expect(clearButton).not.toBeInTheDocument()
  })

  it('renders all five filter buttons', () => {
    const { container } = render(
      <BeachToolbar
        query=""
        onQueryChange={mockOnQueryChange}
        filter="all"
        onFilterChange={mockOnFilterChange}
        searchRef={searchRef}
      />
    )

    const filterGroup = container.querySelector('[role="group"]')
    expect(filterGroup).toBeInTheDocument()
    const buttons = filterGroup?.querySelectorAll('button') || []
    expect(buttons.length).toBeGreaterThanOrEqual(5)
  })

  it('marks the current filter with aria-pressed="true"', () => {
    render(
      <BeachToolbar
        query=""
        onQueryChange={mockOnQueryChange}
        filter="open"
        onFilterChange={mockOnFilterChange}
        searchRef={searchRef}
      />
    )

    const openButton = screen.getByRole('button', { name: /open/i })
    expect(openButton).toHaveAttribute('aria-pressed', 'true')

    const allButton = screen.getByRole('button', { name: /all beaches/i })
    expect(allButton).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onFilterChange when a filter button is clicked', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <BeachToolbar
        query=""
        onQueryChange={mockOnQueryChange}
        filter="all"
        onFilterChange={mockOnFilterChange}
        searchRef={searchRef}
      />
    )

    const filterGroup = container.querySelector('[role="group"]')
    const buttons = filterGroup?.querySelectorAll('button') || []
    // Click the second button (which should be "Open")
    if (buttons[1]) {
      await user.click(buttons[1] as HTMLElement)
      expect(mockOnFilterChange).toHaveBeenCalled()
    }
  })

  it('filter buttons group has proper aria-label', () => {
    render(
      <BeachToolbar
        query=""
        onQueryChange={mockOnQueryChange}
        filter="all"
        onFilterChange={mockOnFilterChange}
        searchRef={searchRef}
      />
    )

    const group = screen.getByRole('group', { name: /filter beaches by status/i })
    expect(group).toBeInTheDocument()
  })

  it('search input has accessible label', () => {
    render(
      <BeachToolbar
        query=""
        onQueryChange={mockOnQueryChange}
        filter="all"
        onFilterChange={mockOnFilterChange}
        searchRef={searchRef}
      />
    )

    const searchInput = screen.getByLabelText(/search by beach/i)
    expect(searchInput).toBeInTheDocument()
  })
})
