// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { BeachActions, DirectionsButton, ShareButton } from '@/components/beach-actions'
import { BEACHES_BY_ID } from '@/lib/seed/beaches'

const kinap = BEACHES_BY_ID['hrm-kinap']

describe('DirectionsButton', () => {
  it('links to Apple Maps when told the platform', () => {
    render(<DirectionsButton beach={kinap} platform="apple" />)
    const a = screen.getByRole('link', { name: /Directions/ })
    expect(a.getAttribute('href')).toBe('https://maps.apple.com/?daddr=44.68002,-63.30658&q=Kinap%20Beach')
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.getAttribute('rel')).toContain('noopener')
    expect(a).toHaveAttribute('data-platform', 'apple')
  })

  it('detects the platform from the user agent after mount', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile')
    render(<DirectionsButton beach={kinap} />)
    expect(screen.getByRole('link').getAttribute('href')).toMatch(/^geo:44\.68002,-63\.30658/)
  })

  it('is the primary action, on shell classes rather than a component library', () => {
    render(<DirectionsButton beach={kinap} platform="other" />)
    const a = screen.getByRole('link')
    expect(a).toHaveClass('beach-detail-action')
    expect(a).toHaveAttribute('data-variant', 'primary')
  })
})

describe('ShareButton', () => {
  const getUrl = () => 'https://x.test/?day=2026-08-14&beach=hrm-kinap'

  it('shares with Web Share and keeps the replay day in the URL', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const onOutcome = vi.fn()
    render(<ShareButton beach={kinap} getUrl={getUrl} nav={{ share }} onOutcome={onOutcome} />)
    await userEvent.click(screen.getByRole('button', { name: /Share/ }))
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://x.test/?day=2026-08-14&beach=hrm-kinap' }))
    expect(onOutcome).toHaveBeenCalledWith('shared', 'https://x.test/?day=2026-08-14&beach=hrm-kinap')
    expect(screen.getByRole('button').textContent).toContain('Shared')
    expect(screen.getByRole('button')).toHaveAttribute('data-outcome', 'shared')
  })

  it('copies when only the clipboard exists and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    render(<ShareButton beach={kinap} getUrl={getUrl} nav={{ clipboard: { writeText } }} />)
    await userEvent.click(screen.getByRole('button'))
    expect(writeText).toHaveBeenCalledWith(getUrl())
    expect(screen.getByRole('button').textContent).toContain('Link copied')
  })

  it('shows the URL for manual copy when everything fails', async () => {
    render(<ShareButton beach={kinap} getUrl={getUrl} nav={{}} />)
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button').textContent).toContain('Copy the link below')
    expect((screen.getByRole('textbox', { name: 'Link to this beach' }) as HTMLInputElement).value).toBe(getUrl())
  })

  it('treats a dismissed share sheet as nothing happened', async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' }))
    render(<ShareButton beach={kinap} getUrl={getUrl} nav={{ share }} />)
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button').textContent).toContain('Share')
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('builds the URL from window.location by default, preserving other params', async () => {
    window.history.replaceState(null, '', '/?day=2026-08-14')
    const share = vi.fn().mockResolvedValue(undefined)
    render(<ShareButton beach={kinap} nav={{ share }} />)
    await userEvent.click(screen.getByRole('button'))
    const url = new URL(share.mock.calls[0][0].url)
    expect(url.searchParams.get('day')).toBe('2026-08-14')
    expect(url.searchParams.get('beach')).toBe('hrm-kinap')
  })

  it('is the secondary action', () => {
    render(<ShareButton beach={kinap} nav={{}} />)
    const button = screen.getByRole('button')
    expect(button).toHaveClass('beach-detail-action')
    expect(button).toHaveAttribute('data-variant', 'secondary')
  })
})

describe('BeachActions', () => {
  it('renders both actions side by side', () => {
    const { container } = render(<BeachActions beach={kinap} platform="other" nav={{}} />)
    expect(container.querySelector('.beach-detail-actions')).not.toBeNull()
    expect(screen.getByRole('link', { name: /Directions/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Share/ })).toBeTruthy()
  })
})
