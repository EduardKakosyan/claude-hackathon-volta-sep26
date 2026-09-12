'use client'

import type { ReactNode } from 'react'

import { DiscoveryStatusChip } from '@/components/discovery/discovery-status-chip'
import { StatusPin, type PinState } from '@/components/status-pin'
import { formatDistance } from '@/lib/geo'
import type { Beach } from '@/lib/seed/beaches'
import { cn } from '@/lib/utils'

export type RenderStatus = (state: PinState, beach: Beach) => ReactNode

export interface DiscoveryRowProps {
  beach: Beach
  state: PinState
  /** Omit to hide the distance column (e.g. when no origin makes sense). */
  km?: number
  selected?: boolean
  onSelect: (id: string) => void
  /** Phase 2 passes its StatusChip here; the default is the Phase 4 fallback chip. */
  renderStatus?: RenderStatus
  className?: string
}

const defaultRenderStatus: RenderStatus = (state) => <DiscoveryStatusChip state={state} />

/** dot · name / water body · distance · chip — one button, the whole row is the target. */
export function DiscoveryRow({
  beach,
  state,
  km,
  selected = false,
  onSelect,
  renderStatus = defaultRenderStatus,
  className,
}: DiscoveryRowProps) {
  return (
    <li data-slot="discovery-row" data-beach-id={beach.id} data-state={state}>
      <button
        type="button"
        aria-current={selected ? 'true' : undefined}
        onClick={() => onSelect(beach.id)}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors',
          'hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400',
          selected && 'bg-neutral-100',
          className,
        )}
      >
        <StatusPin
          state={state}
          hollow={beach.authority === 'province'}
          className="size-3 border-[2.5px] shadow-none transition-none"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-neutral-900">{beach.name}</span>
          <span className="block truncate text-xs text-neutral-500">{beach.waterBody}</span>
        </span>
        {km !== undefined ? (
          <span className="shrink-0 text-xs tabular-nums text-neutral-500">{formatDistance(km)}</span>
        ) : null}
        {renderStatus(state, beach)}
      </button>
    </li>
  )
}
