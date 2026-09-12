'use client'

import { StatusChip } from '@/components/status-chip'
import { StatusPin, type PinState } from '@/components/status-pin'
import type { Beach } from '@/lib/seed/beaches'
import { cn } from '@/lib/utils'

export interface BeachRowProps {
  beach: Beach
  state: PinState
  selected: boolean
  /** Distance label, e.g. "4.8 km". Optional so the row works without a location. */
  distance?: string
  onSelect: (id: string) => void
}

/** dot · name · water body · chip. Tapping it only selects; it never navigates. */
export function BeachRow({ beach, state, selected, distance, onSelect }: BeachRowProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(beach.id)}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-neutral-100',
        selected && 'bg-neutral-100',
      )}
    >
      <StatusPin
        state={state}
        hollow={beach.authority === 'province'}
        className="size-3.5 shrink-0 border-2 shadow-none"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-neutral-900">{beach.name}</span>
        <span className="block truncate text-xs text-neutral-500">
          {beach.waterBody}
          {distance ? ` · ${distance}` : ''}
        </span>
      </span>
      <StatusChip state={state} />
    </button>
  )
}
