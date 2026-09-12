'use client'

import { useRef, type ReactNode, type TouchEvent } from 'react'

import { cn } from '@/lib/utils'

export interface DiscoveryDockProps {
  /** SearchBox. Floats over the map on phones; first row of the panel at lg+. */
  search: ReactNode
  /** LocateButton (and friends), rendered beside the search box. */
  controls?: ReactNode
  /** Collapsed content: the NearbyList. */
  list: ReactNode
  /** Expanded content: the GroupedBeachList. Under `list` at lg+ when expanded. */
  expandedList: ReactNode
  /** Legend for the expanded sheet on phones (hidden at lg+, where the legend floats over the map). */
  legend?: ReactNode
  /** Selected beach detail; Phase 2 may keep its own sheet and pass nothing. */
  detail?: ReactNode
  /** Freshness footer. */
  footer?: ReactNode
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  title?: string
  subtitle?: string
  className?: string
}

const SWIPE_PX = 40

export function DiscoveryDock({
  search,
  controls,
  list,
  expandedList,
  legend,
  detail,
  footer,
  expanded,
  onExpandedChange,
  title = 'Is the beach open?',
  subtitle,
  className,
}: DiscoveryDockProps) {
  const touchStartY = useRef<number | null>(null)

  function onTouchStart(e: TouchEvent) {
    touchStartY.current = e.touches[0]?.clientY ?? null
  }
  function onTouchEnd(e: TouchEvent) {
    const start = touchStartY.current
    touchStartY.current = null
    const end = e.changedTouches[0]?.clientY
    if (start === null || end === undefined) return
    const dy = end - start
    if (dy < -SWIPE_PX && !expanded) onExpandedChange(true)
    if (dy > SWIPE_PX && expanded) onExpandedChange(false)
  }

  return (
    <aside
      data-slot="discovery-dock"
      data-expanded={expanded}
      aria-label="Find a beach"
      className={cn(
        // phone: bottom sheet
        'absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.12)]',
        'pb-[env(safe-area-inset-bottom)] transition-[max-height] duration-200 ease-out',
        expanded ? 'max-h-[85dvh]' : 'max-h-[45dvh]',
        // desktop: left panel
        'lg:inset-y-0 lg:right-auto lg:left-0 lg:max-h-none lg:w-96 lg:rounded-none lg:border-r lg:border-neutral-200 lg:shadow-[4px_0_20px_rgba(0,0,0,0.08)]',
        className,
      )}
    >
      {/* Search: fixed over the map on phones, in-flow on desktop. */}
      <div className="fixed inset-x-3 top-3 z-20 flex items-start gap-2 lg:static lg:inset-auto lg:px-4 lg:pt-4">
        <div className="min-w-0 flex-1">{search}</div>
        {controls}
      </div>

      <header className="px-4 pt-2 lg:pt-3" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="discovery-dock-body"
          onClick={() => onExpandedChange(!expanded)}
          className="mx-auto block h-4 w-full lg:hidden"
        >
          <span className="mx-auto block h-1 w-10 rounded-full bg-neutral-300" />
          <span className="sr-only">{expanded ? 'Show nearest beaches' : 'Show all beaches'}</span>
        </button>
        <div className="mt-1 hidden lg:block">
          <h1 className="text-sm font-semibold text-neutral-900">{title}</h1>
          {subtitle ? <p className="text-xs text-neutral-500">{subtitle}</p> : null}
        </div>
      </header>

      <div id="discovery-dock-body" className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {expanded ? (
          <>
            <div className="lg:hidden">{legend}</div>
            <div className="lg:hidden">{expandedList}</div>
            <div className="hidden lg:block">{list}</div>
            <div className="hidden lg:mt-3 lg:block">{expandedList}</div>
          </>
        ) : (
          <>
            {list}
            <button
              type="button"
              onClick={() => onExpandedChange(true)}
              className="mt-2 w-full rounded-lg px-2 py-1.5 text-left text-xs font-medium text-neutral-600 hover:bg-neutral-100"
            >
              All beaches by region →
            </button>
          </>
        )}
        {detail ? <div className="mt-3 border-t border-neutral-100 pt-3">{detail}</div> : null}
      </div>

      {footer ? <div className="border-t border-neutral-100 px-4 py-2 text-[11px] text-neutral-500">{footer}</div> : null}
    </aside>
  )
}
