// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BEACHES } from '@/lib/seed/beaches'
import { SearchBox } from './search-box'

afterEach(() => vi.restoreAllMocks())

function setup(status: Record<string, 'open' | 'advisory' | 'closed' | 'offseason'> = {}) {
  const onSelect = vi.fn()
  const pushState = vi.spyOn(window.history, 'pushState')
  const replaceState = vi.spyOn(window.history, 'replaceState')
  render(<SearchBox beaches={BEACHES} status={status} onSelect={onSelect} />)
  return { onSelect, pushState, replaceState, user: userEvent.setup() }
}

describe('SearchBox', () => {
  it('shows the roster size in the placeholder', () => {
    setup()
    expect(screen.getByPlaceholderText('Search 35 monitored beaches')).toBeTruthy()
  })

  it('lists Kinap for "porters" and selects it on click without navigating', async () => {
    const { onSelect, pushState, replaceState, user } = setup({ 'hrm-kinap': 'closed' })
    await user.type(screen.getByRole('combobox'), 'porters')
    const list = screen.getByRole('listbox')
    const options = within(list).getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0].getAttribute('data-beach-id')).toBe('hrm-kinap')
    expect(options[0].textContent).toContain('on Porters Lake')
    await user.click(options[0])
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('hrm-kinap')
    expect(pushState).not.toHaveBeenCalled()
    expect(replaceState).not.toHaveBeenCalled()
    expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('"Grand Lake" lists Oakfield Park Beach only', async () => {
    const { user } = setup()
    await user.type(screen.getByRole('combobox'), 'Grand Lake')
    const options = screen.getAllByRole('option')
    expect(options.map((o) => o.getAttribute('data-beach-id'))).toEqual(['hrm-oakfield-park'])
  })

  it('supports arrow keys and Enter', async () => {
    const { onSelect, user } = setup()
    await user.type(screen.getByRole('combobox'), 'Dartmouth')
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onSelect).toHaveBeenCalledTimes(1)
    const ordered = ['hrm-albro-lake', 'hrm-birch-cove', 'hrm-penhorn-lake', 'hrm-shubie-park']
    expect(onSelect.mock.calls[0][0]).toBe(ordered[1])
  })

  it('shows an empty state and never calls onSelect for no matches', async () => {
    const { onSelect, user } = setup()
    await user.type(screen.getByRole('combobox'), 'xyz')
    expect(screen.getByText(/No beaches match/)).toBeTruthy()
    await user.keyboard('{Enter}')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('closes on Escape and clears with the clear button', async () => {
    const { user } = setup()
    const input = screen.getByRole('combobox')
    await user.type(input, 'lake')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect((input as HTMLInputElement).value).toBe('')
  })
})
