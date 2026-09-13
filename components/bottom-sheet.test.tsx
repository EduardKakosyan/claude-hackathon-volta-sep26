import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  BottomSheet,
  PEEK_PX,
  SHEET_MEDIA,
  SHEET_VISIBLE,
  resolvePeek,
  restOffsets,
  settle,
  type Snap,
} from '@/components/bottom-sheet'

/** The sheet's height in every test: half rests at 336 (42%), peek at 800 - 96 = 704. */
const HEIGHT = 800

function setPhone(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn((query: string) => ({
      matches: query === SHEET_MEDIA && matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

function renderSheet(snap: Snap, onSnapChange = vi.fn()) {
  const utils = render(
    <BottomSheet
      snap={snap}
      onSnapChange={onSnapChange}
      aria-label="Beach directory"
      heading={
        <div className="beach-shell-panel-heading">
          <h2>Find your next shore</h2>
          <button type="button">Back to beaches</button>
        </div>
      }
      footer={<footer>footer</footer>}
    >
      <ul>
        <li>
          <button type="button" data-beach-id="one">
            One
          </button>
        </li>
      </ul>
    </BottomSheet>,
  )
  const aside = utils.container.querySelector<HTMLElement>('.beach-sheet')!
  const grab = utils.container.querySelector<HTMLElement>('.beach-sheet-grab')!
  const body = utils.container.querySelector<HTMLElement>('.beach-sheet-body')!
  return { ...utils, aside, grab, body, onSnapChange }
}

/** One pointer gesture on `target`: down at `from`, moves through `steps`, up at the last step. */
function drag(target: HTMLElement, from: number, steps: number[], { pointerId = 7 } = {}) {
  fireEvent.pointerDown(target, { clientY: from, pointerId, pointerType: 'touch', button: 0, isPrimary: true })
  for (const y of steps) {
    fireEvent.pointerMove(target, { clientY: y, pointerId, pointerType: 'touch' })
  }
  fireEvent.pointerUp(target, { clientY: steps[steps.length - 1] ?? from, pointerId, pointerType: 'touch' })
}

describe('BottomSheet', () => {
  let heightSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    setPhone(true)
    heightSpy = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(HEIGHT)
  })

  afterEach(() => {
    heightSpy.mockRestore()
    vi.useRealTimers()
  })

  describe('geometry', () => {
    it('rests at 0 / half / height minus the peek', () => {
      expect(restOffsets(800, PEEK_PX)).toEqual({ full: 0, half: 336, peek: 800 - PEEK_PX })
      expect(restOffsets(800, PEEK_PX + 34)).toEqual({ full: 0, half: 336, peek: 800 - PEEK_PX - 34 })
      expect(restOffsets(100, 200).peek).toBe(0)
    })

    it('reads the peek from --sheet-peek when the stylesheet resolved it, else falls back to the constant', () => {
      const el = document.createElement('aside')
      document.body.append(el)
      expect(resolvePeek(el)).toBe(PEEK_PX)
      el.style.paddingBottom = '34px'
      expect(resolvePeek(el)).toBe(PEEK_PX + 34)
      const spy = vi.spyOn(window, 'getComputedStyle').mockReturnValue({
        getPropertyValue: () => '72px',
        paddingBottom: '34px',
      } as unknown as CSSStyleDeclaration)
      expect(resolvePeek(el)).toBe(72)
      spy.mockRestore()
      el.remove()
    })

    it('settles on the nearest rest, and a flick carries it past the midpoint', () => {
      const rests = restOffsets(800, PEEK_PX)
      expect(settle(150, 0, rests)).toBe('full')
      expect(settle(250, 0, rests)).toBe('half')
      expect(settle(600, 0, rests)).toBe('peek')
      // 300px is nearer half, but a fast upward release (-2 px/ms over 120 ms) lands at full.
      expect(settle(300, -2, rests)).toBe('full')
      expect(settle(500, 2, rests)).toBe('peek')
    })

    it('exposes how much of the workspace each snap covers', () => {
      expect(SHEET_VISIBLE).toEqual({ peek: 'var(--sheet-peek)', half: '58%', full: '100%' })
    })
  })

  describe('markup', () => {
    it('renders the snap as data-snap and locks the body scroll unless full', () => {
      const { aside, body, rerender, onSnapChange } = renderSheet('half')
      expect(aside).toHaveAttribute('data-snap', 'half')
      expect(aside).toHaveAttribute('data-dragging', 'false')
      expect(body).toHaveAttribute('data-scroll', 'false')
      expect(screen.getByRole('complementary', { name: 'Beach directory' })).toBe(aside)

      rerender(
        <BottomSheet snap="full" onSnapChange={onSnapChange} heading={<h2>h</h2>}>
          <p>body</p>
        </BottomSheet>,
      )
      expect(aside).toHaveAttribute('data-snap', 'full')
      expect(body).toHaveAttribute('data-scroll', 'true')
    })

    it('keeps the heading in the grab area and the footer after the body', () => {
      const { grab, body, aside } = renderSheet('half')
      expect(grab.querySelector('h2')).toHaveTextContent('Find your next shore')
      expect(grab.querySelector('.beach-sheet-handle')).not.toBeNull()
      expect(body.querySelector('[data-beach-id="one"]')).not.toBeNull()
      expect(aside.lastElementChild?.tagName).toBe('FOOTER')
    })

    it('hands the body element to bodyRef', () => {
      const ref = { current: null as HTMLDivElement | null }
      render(
        <BottomSheet snap="half" onSnapChange={vi.fn()} heading={<h2>h</h2>} bodyRef={ref}>
          <p>body</p>
        </BottomSheet>,
      )
      expect(ref.current?.className).toBe('beach-sheet-body')
    })
  })

  describe('drag on the grab area', () => {
    it('a drag down from half releases at peek', () => {
      const { grab, onSnapChange } = renderSheet('half')
      drag(grab, 400, [450, 520, 600])
      expect(onSnapChange).toHaveBeenCalledWith('peek')
    })

    it('a drag up from half releases at full', () => {
      const { grab, onSnapChange } = renderSheet('half')
      drag(grab, 400, [350, 250, 100])
      expect(onSnapChange).toHaveBeenCalledWith('full')
    })

    it('a long drag up from peek goes straight to full', () => {
      const { grab, onSnapChange } = renderSheet('peek')
      drag(grab, 720, [600, 300, 60])
      expect(onSnapChange).toHaveBeenCalledWith('full')
    })

    it('follows the finger with an inline transform while dragging, then clears it', () => {
      const { aside, grab } = renderSheet('half')
      const pointerId = 3
      fireEvent.pointerDown(grab, { clientY: 400, pointerId, pointerType: 'touch', button: 0 })
      fireEvent.pointerMove(grab, { clientY: 460, pointerId, pointerType: 'touch' })
      expect(aside).toHaveAttribute('data-dragging', 'true')
      // The rest is 336; the finger moved 60 down.
      expect(aside.style.transform).toBe('translateY(396px)')
      fireEvent.pointerUp(grab, { clientY: 460, pointerId, pointerType: 'touch' })
      expect(aside).toHaveAttribute('data-dragging', 'false')
      expect(aside.style.transform).toBe('')
    })

    it('never drags above full or below peek', () => {
      const { aside, grab } = renderSheet('half')
      const pointerId = 4
      fireEvent.pointerDown(grab, { clientY: 400, pointerId, pointerType: 'touch', button: 0 })
      fireEvent.pointerMove(grab, { clientY: -200, pointerId, pointerType: 'touch' })
      expect(aside.style.transform).toBe('translateY(0px)')
      fireEvent.pointerMove(grab, { clientY: 1500, pointerId, pointerType: 'touch' })
      expect(aside.style.transform).toBe(`translateY(${HEIGHT - PEEK_PX}px)`)
    })

    it('a small wobble is not a drag and settles nowhere', () => {
      const { aside, grab, onSnapChange } = renderSheet('half')
      drag(grab, 400, [402, 403])
      expect(aside).toHaveAttribute('data-dragging', 'false')
      expect(onSnapChange).not.toHaveBeenCalled()
    })

    it('a short but fast flick up from half reaches full', () => {
      vi.useFakeTimers()
      const { grab, onSnapChange } = renderSheet('half')
      const pointerId = 5
      fireEvent.pointerDown(grab, { clientY: 400, pointerId, pointerType: 'touch', button: 0 })
      vi.advanceTimersByTime(16)
      fireEvent.pointerMove(grab, { clientY: 370, pointerId, pointerType: 'touch' })
      vi.advanceTimersByTime(16)
      fireEvent.pointerMove(grab, { clientY: 330, pointerId, pointerType: 'touch' })
      fireEvent.pointerUp(grab, { clientY: 330, pointerId, pointerType: 'touch' })
      // 266 is nearer half (336) than full (0); the velocity is what carries it.
      expect(onSnapChange).toHaveBeenCalledWith('full')
    })

    it('a cancelled pointer settles by position only', () => {
      const { grab, onSnapChange } = renderSheet('half')
      const pointerId = 6
      fireEvent.pointerDown(grab, { clientY: 400, pointerId, pointerType: 'touch', button: 0 })
      fireEvent.pointerMove(grab, { clientY: 480, pointerId, pointerType: 'touch' })
      fireEvent.pointerCancel(grab, { clientY: 480, pointerId, pointerType: 'touch' })
      expect(onSnapChange).not.toHaveBeenCalled()
    })

    it('follows a pointer whose moves land outside the sheet, and stops listening after the release', () => {
      const { aside, grab, onSnapChange } = renderSheet('half')
      const pointerId = 8
      fireEvent.pointerDown(grab, { clientY: 400, pointerId, pointerType: 'mouse', button: 0 })
      // The first move after a press near the top edge lands on the map; the sheet must still see it.
      fireEvent.pointerMove(document.body, { clientY: 300, pointerId, pointerType: 'mouse' })
      expect(aside).toHaveAttribute('data-dragging', 'true')
      expect(aside.style.transform).toBe('translateY(236px)')
      fireEvent.pointerUp(document.body, { clientY: 100, pointerId, pointerType: 'mouse' })
      expect(onSnapChange).toHaveBeenCalledWith('full')

      // Released: a stray move on the page is no longer a drag.
      fireEvent.pointerMove(document.body, { clientY: 700, pointerId, pointerType: 'mouse' })
      expect(aside).toHaveAttribute('data-dragging', 'false')
      expect(aside.style.transform).toBe('')
    })

    it('ignores a second pointer while one is down', () => {
      const { aside, grab } = renderSheet('half')
      fireEvent.pointerDown(grab, { clientY: 400, pointerId: 1, pointerType: 'touch', button: 0 })
      fireEvent.pointerMove(grab, { clientY: 300, pointerId: 2, pointerType: 'touch' })
      expect(aside.style.transform).toBe('')
    })
  })

  describe('drag on the body', () => {
    it('at half, pulling the list up moves the sheet to full instead of scrolling', () => {
      const { body, onSnapChange } = renderSheet('half')
      const rowButton = body.querySelector<HTMLElement>('[data-beach-id="one"]')!
      drag(rowButton, 500, [420, 300, 150])
      expect(onSnapChange).toHaveBeenCalledWith('full')
    })

    it('at full, the body is the scroller and a pointer drag on it does nothing', () => {
      const { aside, body, onSnapChange } = renderSheet('full')
      drag(body, 300, [400, 500, 600])
      expect(aside).toHaveAttribute('data-dragging', 'false')
      expect(onSnapChange).not.toHaveBeenCalled()
    })

    it('at full, a touch pull down from the top of the list drops the sheet to half', () => {
      const { body, onSnapChange } = renderSheet('full')
      fireEvent.touchStart(body, { touches: [{ clientY: 200 }] })
      fireEvent.touchMove(body, { touches: [{ clientY: 210 }] })
      expect(onSnapChange).not.toHaveBeenCalled()
      fireEvent.touchMove(body, { touches: [{ clientY: 260 }] })
      fireEvent.touchMove(body, { touches: [{ clientY: 300 }] })
      expect(onSnapChange).toHaveBeenCalledTimes(1)
      expect(onSnapChange).toHaveBeenCalledWith('half')
    })

    it('at full, a pull down while scrolled keeps scrolling', () => {
      const { body, onSnapChange } = renderSheet('full')
      Object.defineProperty(body, 'scrollTop', { configurable: true, value: 120 })
      fireEvent.touchStart(body, { touches: [{ clientY: 200 }] })
      fireEvent.touchMove(body, { touches: [{ clientY: 320 }] })
      expect(onSnapChange).not.toHaveBeenCalled()
    })
  })

  describe('heading tap', () => {
    it('cycles peek → half → full → half', async () => {
      const user = userEvent.setup()
      const onSnapChange = vi.fn()
      const { grab, rerender } = renderSheet('peek', onSnapChange)
      const heading = () => grab.querySelector('h2')!

      await user.click(heading())
      expect(onSnapChange).toHaveBeenLastCalledWith('half')

      rerender(
        <BottomSheet snap="half" onSnapChange={onSnapChange} heading={<h2>h</h2>}>
          <p>body</p>
        </BottomSheet>,
      )
      await user.click(heading())
      expect(onSnapChange).toHaveBeenLastCalledWith('full')

      rerender(
        <BottomSheet snap="full" onSnapChange={onSnapChange} heading={<h2>h</h2>}>
          <p>body</p>
        </BottomSheet>,
      )
      await user.click(heading())
      expect(onSnapChange).toHaveBeenLastCalledWith('half')
      expect(onSnapChange).toHaveBeenCalledTimes(3)
    })

    it('a control inside the heading row keeps its own job', async () => {
      const user = userEvent.setup()
      const { onSnapChange } = renderSheet('half')
      await user.click(screen.getByRole('button', { name: 'Back to beaches' }))
      expect(onSnapChange).not.toHaveBeenCalled()
    })

    it('the click that ends a drag is not a tap', () => {
      const { grab, onSnapChange } = renderSheet('half')
      drag(grab, 400, [450, 520, 600])
      fireEvent.click(grab.querySelector('h2')!)
      expect(onSnapChange).toHaveBeenCalledTimes(1)
      expect(onSnapChange).toHaveBeenCalledWith('peek')
    })
  })

  describe('above the phone breakpoint', () => {
    beforeEach(() => setPhone(false))

    it('is a plain column: drags and heading taps change nothing', async () => {
      const user = userEvent.setup()
      const { aside, grab, onSnapChange } = renderSheet('half')
      drag(grab, 400, [450, 520, 600])
      await user.click(grab.querySelector('h2')!)
      expect(aside).toHaveAttribute('data-dragging', 'false')
      expect(aside.style.transform).toBe('')
      expect(onSnapChange).not.toHaveBeenCalled()
    })
  })
})
