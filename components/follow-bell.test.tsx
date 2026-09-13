import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FOLLOW_ERROR_HINT, FOLLOW_HINT, FollowBell } from '@/components/follow-bell'
import type { FollowState } from '@/hooks/use-follow'

const bell = () => screen.getByRole('button')
const hint = () => document.querySelector('.beach-detail-follow-hint')

describe('FollowBell', () => {
  it('off: reads "Follow", not pressed, and a tap toggles', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(<FollowBell beachName="Chocolate Lake Beach" state="off" onToggle={onToggle} />)

    expect(bell()).toHaveTextContent('Follow')
    expect(bell()).toHaveAttribute('aria-pressed', 'false')
    expect(bell().title).toMatch(/Chocolate Lake Beach/)
    await user.click(bell())
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(hint()).toBeNull()
  })

  it('on: reads "Following", pressed, and a tap toggles', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(<FollowBell beachName="Chocolate Lake Beach" state="on" onToggle={onToggle} />)

    expect(screen.getByRole('button', { name: 'Following' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(bell())
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it.each<[Exclude<FollowState, 'off' | 'on'>]>([['needs-install'], ['unsupported']])(
    '%s: a tap opens the hint instead of toggling, and a second tap closes it',
    async (state) => {
      const user = userEvent.setup()
      const onToggle = vi.fn()
      const { container } = render(<FollowBell beachName="Rissers Beach" state={state} onToggle={onToggle} />)

      expect(container.querySelector('.beach-detail-follow')).toHaveAttribute('data-state', state)
      expect(bell()).toHaveAttribute('aria-pressed', 'false')
      expect(hint()).toBeNull()

      await user.click(bell())
      expect(onToggle).not.toHaveBeenCalled()
      expect(screen.getByRole('status')).toHaveTextContent(FOLLOW_HINT[state])
      expect(bell()).toHaveAttribute('aria-describedby', screen.getByRole('status').id)

      await user.click(bell())
      expect(hint()).toBeNull()
    },
  )

  it('blocked: reached only by a refused prompt, so its hint shows at once and stays', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(<FollowBell beachName="Rissers Beach" state="blocked" onToggle={onToggle} />)
    expect(screen.getByRole('status')).toHaveTextContent(FOLLOW_HINT.blocked)
    expect(bell()).toHaveAttribute('aria-pressed', 'false')
    await user.click(bell())
    expect(onToggle).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent(FOLLOW_HINT.blocked)
  })

  it('the iPhone hint is the two steps: Share, then Add to Home Screen', () => {
    expect(FOLLOW_HINT['needs-install']).toMatch(/Share, then Add to Home Screen/)
  })

  it('busy: the bell is disabled and marked busy', () => {
    render(<FollowBell beachName="x" state="off" busy onToggle={() => {}} />)
    expect(bell()).toBeDisabled()
    expect(bell()).toHaveAttribute('aria-busy', 'true')
  })

  it('an error from the last attempt is explained under the bell, which stays off', () => {
    render(<FollowBell beachName="x" state="off" error="follow: POST answered 503" onToggle={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent(FOLLOW_ERROR_HINT)
    expect(bell()).toHaveTextContent('Follow')
  })

  it('never claims the water is safe', () => {
    for (const text of [...Object.values(FOLLOW_HINT), FOLLOW_ERROR_HINT]) expect(text).not.toMatch(/\bsafe\b/i)
  })
})
