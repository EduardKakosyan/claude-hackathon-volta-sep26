// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { HALIFAX } from '@/lib/geo'
import { BEACHES } from '@/lib/seed/beaches'
import { GroupedBeachList } from './grouped-beach-list'
import { NearbyList } from './nearby-list'

const rowIds = () => screen.getAllByRole('listitem').map((li) => li.getAttribute('data-beach-id'))

describe('NearbyList', () => {
  it('renders the four nearest from Halifax with distances and the fallback header', () => {
    render(<NearbyList beaches={BEACHES} status={{}} origin={HALIFAX} originKind="halifax" selectedId={null} onSelect={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Closest to Halifax' })).toBeTruthy()
    expect(rowIds()).toEqual(['hrm-chocolate-lake', 'hrm-cunard-pond', 'hrm-birch-cove', 'hrm-albro-lake'])
    expect(screen.getAllByRole('listitem')[0].textContent).toContain('3.6 km')
  })

  it('says "Closest to you" for a user origin and re-orders around Dartmouth', () => {
    render(<NearbyList beaches={BEACHES} status={{}} origin={{ lat: 44.6714, lon: -63.5772 }} originKind="user" selectedId={null} onSelect={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Closest to you' })).toBeTruthy()
    expect(rowIds()[0]).toBe('hrm-birch-cove')
  })

  it('appends the selected beach when it is not among the nearest', () => {
    render(<NearbyList beaches={BEACHES} status={{}} origin={HALIFAX} originKind="halifax" selectedId="ns-dominion" onSelect={() => {}} />)
    const ids = rowIds()
    expect(ids).toHaveLength(5)
    expect(ids.at(-1)).toBe('ns-dominion')
    expect(screen.getByRole('button', { current: true }).textContent).toContain('Dominion Beach')
  })

  it('calls onSelect with the id, nothing else', async () => {
    const onSelect = vi.fn()
    const replaceState = vi.spyOn(window.history, 'replaceState')
    render(<NearbyList beaches={BEACHES} status={{ 'hrm-cunard-pond': 'advisory' }} origin={HALIFAX} originKind="halifax" selectedId={null} onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: /Cunard Pond Beach/ }))
    expect(onSelect).toHaveBeenCalledWith('hrm-cunard-pond')
    expect(replaceState).not.toHaveBeenCalled()
    expect(within(screen.getAllByRole('listitem')[1]).getByText('Advisory')).toBeTruthy()
  })

  it('renders unknown for missing status and uses a custom renderStatus', () => {
    render(
      <NearbyList
        beaches={BEACHES}
        status={{}}
        origin={HALIFAX}
        originKind="halifax"
        selectedId={null}
        onSelect={() => {}}
        renderStatus={(state) => <em data-testid="custom">{state}</em>}
      />,
    )
    expect(screen.getAllByTestId('custom').map((e) => e.textContent)).toEqual(['unknown', 'unknown', 'unknown', 'unknown'])
  })
})

describe('GroupedBeachList', () => {
  it('renders six regions with 35 rows in roster order', () => {
    render(<GroupedBeachList beaches={BEACHES} status={{}} origin={HALIFAX} selectedId={null} onSelect={() => {}} />)
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Halifax · 19',
      'Eastern Shore · 4',
      'South Shore · 3',
      'Valley · 3',
      'North Shore · 4',
      'Cape Breton · 2',
    ])
    expect(screen.getAllByRole('listitem')).toHaveLength(35)
  })
})
