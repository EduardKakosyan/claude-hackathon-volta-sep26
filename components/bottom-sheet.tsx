'use client'

import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
  type TouchEvent as ReactTouchEvent,
} from 'react'

/**
 * The directory's container. On a phone (SHEET_MEDIA) it is a sheet over the map
 * with three resting positions; elsewhere it is the plain panel column. The
 * three rests are CSS (`.beach-sheet[data-snap]` in beach-shell.css), so the
 * only inline style this component ever writes is the finger-follow transform
 * while a drag is in progress. Every state is a DOM attribute so the rig can
 * assert on `data-snap` and never on pixels.
 */
export type Snap = 'peek' | 'half' | 'full'

/**
 * How much of the workspace the sheet covers at each snap, as a CSS length the
 * map's floating controls add 12px to. `BeachApp` sets it as `--sheet-visible`
 * on the workspace; `--sheet-peek` is defined in beach-shell.css.
 */
export const SHEET_VISIBLE: Record<Snap, string> = {
  peek: 'var(--sheet-peek)',
  half: '50%',
  full: '100%',
}

/**
 * Height of the peek position before the home-indicator inset, used only when
 * `--sheet-peek` cannot be read from CSS (jsdom). The stylesheet is the source
 * of truth: it registers `--sheet-peek` with `@property` so its computed value
 * is a resolved length, and the landscape rule shortens it.
 */
export const PEEK_PX = 96
/** Movement before a press becomes a drag; below it a press is a tap. */
export const DRAG_SLOP_PX = 6
/** Release velocity (px/ms) is projected this far ahead before choosing the nearest rest. */
export const FLICK_MS = 120
/** A finger that has been still this long releases with no velocity. */
export const STILL_MS = 100
/** At full, pulling the list down this far from its top drops the sheet to half. */
export const PULL_PX = 32
/**
 * The phone layout's media query, mirrored from beach-shell.css: a narrow
 * viewport, or a short one that is not tablet-wide (a phone in landscape lays
 * out 852–956 px wide in Mobile Safari). Outside it the sheet is a plain column
 * and gestures are inert.
 */
export const SHEET_MEDIA = '(max-width: 760px), (max-height: 600px) and (max-width: 1000px)'

/** Tapping the heading row: peek → half → full → half. */
export const NEXT_ON_TAP: Record<Snap, Snap> = { peek: 'half', half: 'full', full: 'half' }

const SNAPS: readonly Snap[] = ['full', 'half', 'peek']

export function isSheetLayout(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(SHEET_MEDIA).matches
}

/** Resting translateY in px for each snap, given the sheet's height and how much of it shows at peek. */
export function restOffsets(height: number, peek: number): Record<Snap, number> {
  return { full: 0, half: height / 2, peek: Math.max(0, height - peek) }
}

/**
 * The peek height in px, read from the `--sheet-peek` the stylesheet resolves
 * for this viewport (portrait or landscape, with the home-indicator inset). Falls
 * back to the constant plus the sheet's own bottom padding when the property is
 * not a resolved length, which is the case in jsdom.
 */
export function resolvePeek(sheet: HTMLElement): number {
  const style = getComputedStyle(sheet)
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(style.getPropertyValue('--sheet-peek').trim())
  if (match) return parseFloat(match[1])
  return PEEK_PX + (parseFloat(style.paddingBottom) || 0)
}

/** True when nothing between `from` and `until` (inclusive) has been scrolled down. */
function scrolledToTop(from: EventTarget | null, until: HTMLElement | null): boolean {
  let node: HTMLElement | null = from instanceof HTMLElement ? from : null
  while (node) {
    if (node.scrollTop > 0) return false
    if (node === until) break
    node = node.parentElement
  }
  return true
}

/** The snap whose rest is nearest to `offset` once the release velocity is projected ahead. */
export function settle(offset: number, velocity: number, rests: Record<Snap, number>): Snap {
  const projected = offset + velocity * FLICK_MS
  let best: Snap = 'half'
  let bestDistance = Infinity
  for (const snap of SNAPS) {
    const distance = Math.abs(rests[snap] - projected)
    if (distance < bestDistance) {
      best = snap
      bestDistance = distance
    }
  }
  return best
}

export interface BottomSheetProps {
  snap: Snap
  onSnapChange: (next: Snap) => void
  /** The heading row. It sits in the grab area with the handle, so it drags and taps. */
  heading: ReactNode
  /** Pinned under the body: the freshness footer. */
  footer?: ReactNode
  /** The scrolling body: the directory or the detail. */
  children: ReactNode
  /** The body element, for scroll-to-top and focus return in `BeachApp`. */
  bodyRef?: Ref<HTMLDivElement>
  'aria-label'?: string
}

interface Gesture {
  pointerId: number
  startY: number
  startOffset: number
  offset: number
  rests: Record<Snap, number>
  lastY: number
  lastT: number
  velocity: number
  dragging: boolean
}

interface Pull {
  startY: number
  atTop: boolean
  fired: boolean
}

const INTERACTIVE = 'button, a, input, select, textarea, summary, [role="button"]'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function BottomSheet({
  snap,
  onSnapChange,
  heading,
  footer,
  children,
  bodyRef,
  'aria-label': ariaLabel,
}: BottomSheetProps) {
  const asideRef = useRef<HTMLElement | null>(null)
  const innerBodyRef = useRef<HTMLDivElement | null>(null)
  const gesture = useRef<Gesture | null>(null)
  const pull = useRef<Pull | null>(null)
  /** A drag that just ended must not also count as a heading tap. */
  const suppressClick = useRef(false)
  /** Removes the window listeners of the gesture in progress, if any. */
  const detach = useRef<() => void>(() => {})
  const [dragging, setDragging] = useState(false)

  // The parent's ref sees the same body element this component drags against.
  useImperativeHandle(bodyRef, () => innerBodyRef.current as HTMLDivElement, [])

  // A gesture must not outlive the sheet.
  useEffect(() => () => detach.current(), [])

  /**
   * The rest of a gesture is read from `window` in the capture phase, not from
   * the sheet: the sheet follows the finger, but the first move after a press
   * near its top edge can land on the map, and a move the sheet never sees is a
   * drag that never starts. Once a drag is under way the pointer is captured so
   * the release lands here whatever is under it.
   */
  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    suppressClick.current = false
    if (!isSheetLayout()) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const aside = asideRef.current
    if (!aside) return
    // At full the body is the scroller; only the grab area moves the sheet.
    const inBody = innerBodyRef.current?.contains(event.target as Node) ?? false
    if (inBody && snap === 'full') return
    detach.current()
    const rests = restOffsets(aside.offsetHeight, resolvePeek(aside))
    gesture.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startOffset: rests[snap],
      offset: rests[snap],
      rests,
      lastY: event.clientY,
      lastT: event.timeStamp,
      velocity: 0,
      dragging: false,
    }
    const onMove = (e: PointerEvent) => move(e)
    const onUp = (e: PointerEvent) => finish(e, true)
    const onCancel = (e: PointerEvent) => finish(e, false)
    const options: AddEventListenerOptions = { capture: true }
    window.addEventListener('pointermove', onMove, options)
    window.addEventListener('pointerup', onUp, options)
    window.addEventListener('pointercancel', onCancel, options)
    detach.current = () => {
      window.removeEventListener('pointermove', onMove, options)
      window.removeEventListener('pointerup', onUp, options)
      window.removeEventListener('pointercancel', onCancel, options)
      detach.current = () => {}
    }
  }

  function move(event: PointerEvent) {
    const g = gesture.current
    const aside = asideRef.current
    if (!g || !aside || event.pointerId !== g.pointerId) return
    const dy = event.clientY - g.startY
    if (!g.dragging) {
      if (Math.abs(dy) < DRAG_SLOP_PX) return
      g.dragging = true
      try {
        aside.setPointerCapture?.(event.pointerId)
      } catch {
        // A synthetic pointer (tests) has no capture; the drag still follows the events it gets.
      }
      setDragging(true)
    }
    const dt = event.timeStamp - g.lastT
    if (dt > 0) g.velocity = (event.clientY - g.lastY) / dt
    g.lastY = event.clientY
    g.lastT = event.timeStamp
    g.offset = clamp(g.startOffset + dy, 0, g.rests.peek)
    aside.style.transform = `translateY(${g.offset}px)`
  }

  function finish(event: PointerEvent, withVelocity: boolean) {
    const g = gesture.current
    const aside = asideRef.current
    if (!g || !aside || event.pointerId !== g.pointerId) return
    gesture.current = null
    detach.current()
    if (!g.dragging) return
    try {
      aside.releasePointerCapture?.(event.pointerId)
    } catch {
      // see setPointerCapture above
    }
    aside.style.transform = ''
    setDragging(false)
    suppressClick.current = true
    const stale = event.timeStamp - g.lastT > STILL_MS
    const velocity = withVelocity && !stale ? g.velocity : 0
    const next = settle(g.offset, velocity, g.rests)
    if (next !== snap) onSnapChange(next)
  }

  function onGrabClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    if (!isSheetLayout()) return
    if ((event.target as HTMLElement).closest(INTERACTIVE)) return
    onSnapChange(NEXT_ON_TAP[snap])
  }

  // At full the body scrolls natively, which cancels the pointer stream, so the
  // pull-down-from-the-top gesture listens to touch events instead.
  function onBodyTouchStart(event: ReactTouchEvent<HTMLDivElement>) {
    if (snap !== 'full' || !isSheetLayout()) {
      pull.current = null
      return
    }
    const touch = event.touches[0]
    if (!touch) return
    // "At the top" means nothing under the finger is scrolled, not just the body:
    // until Phase 6 the detail still carries its own scroller inside the body.
    pull.current = {
      startY: touch.clientY,
      atTop: scrolledToTop(event.target, innerBodyRef.current),
      fired: false,
    }
  }

  function onBodyTouchMove(event: ReactTouchEvent<HTMLDivElement>) {
    const p = pull.current
    const touch = event.touches[0]
    if (!p || p.fired || !p.atTop || !touch) return
    if (touch.clientY - p.startY > PULL_PX) {
      p.fired = true
      onSnapChange('half')
    }
  }

  return (
    <aside
      ref={asideRef}
      className="beach-sheet"
      data-snap={snap}
      data-dragging={dragging}
      aria-label={ariaLabel}
      onPointerDown={onPointerDown}
    >
      <div className="beach-sheet-grab" onClick={onGrabClick}>
        <span className="beach-sheet-handle" aria-hidden="true" />
        {heading}
      </div>
      <div
        className="beach-sheet-body"
        data-scroll={snap === 'full'}
        ref={innerBodyRef}
        onTouchStart={onBodyTouchStart}
        onTouchMove={onBodyTouchMove}
      >
        {children}
      </div>
      {footer}
    </aside>
  )
}
