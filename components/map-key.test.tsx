import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MapKey } from '@/components/map-key'

describe('MapKey', () => {
  it('lists all five states with their labels', async () => {
    const user = userEvent.setup()
    render(<MapKey />)

    // Open the details element
    const summary = screen.getByText('Map key')
    await user.click(summary)

    // Check that all five state rows are present by looking for the list structure
    const listItems = document.querySelectorAll('.beach-shell-key-content > ul > li')
    expect(listItems).toHaveLength(5)

    // Verify key labels appear
    expect(screen.getByText(/Open \/ no advisory/)).toBeInTheDocument()
    const advisoryMatches = screen.getAllByText(/Advisory/)
    expect(advisoryMatches.length).toBeGreaterThan(0)
    const closedMatches = screen.getAllByText(/Closed/)
    expect(closedMatches.length).toBeGreaterThan(0)
    expect(screen.getByText(/Off-season/)).toBeInTheDocument()
  })

  it('includes the hollow-pin explanation', async () => {
    const user = userEvent.setup()
    render(<MapKey />)

    const summary = screen.getByText('Map key')
    await user.click(summary)

    expect(screen.getByText(/hollow pin.*provincial beach/i)).toBeInTheDocument()
    expect(screen.getByText(/No advisory posted is not a confirmed clean sample/i)).toBeInTheDocument()
  })

  it('includes the unknown caveat', async () => {
    const user = userEvent.setup()
    render(<MapKey />)

    const summary = screen.getByText('Map key')
    await user.click(summary)

    expect(screen.getByText(/No status available means we have not read an official status/i)).toBeInTheDocument()
    expect(screen.getByText(/Unknown does not mean open/i)).toBeInTheDocument()
  })

  it('renders status pins for all states', async () => {
    const user = userEvent.setup()
    render(<MapKey />)

    const summary = screen.getByText('Map key')
    await user.click(summary)

    // All five states should have pins visible in the list
    const stateItems = screen.getByText(/Open \/ no advisory/).closest('li')
    expect(stateItems).toBeInTheDocument()

    // Check that all states are rendered as list items
    const listItems = document.querySelectorAll('.beach-shell-key-content li')
    expect(listItems.length).toBeGreaterThanOrEqual(5)
  })

  it('is initially closed (details element)', () => {
    render(<MapKey />)

    const details = screen.getByText('Map key').closest('details')
    expect(details).toHaveProperty('open', false)
  })
})
