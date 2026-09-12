'use client'

import { ArrowUpRight, Waves } from 'lucide-react'

import { StatusPin } from '@/components/status-pin'
import { resolveState } from '@/lib/beach-filter'
import { statusPresentation, type PinState } from '@/lib/beach-status'
import type { Beach } from '@/lib/seed/beaches'

export interface BeachListProps {
  beaches: Beach[]
  status: Record<string, PinState | undefined>
  selectedId: string | null
  onSelect: (id: string) => void
  onReset: () => void
}

/**
 * The alphabetical directory. Every row is a button so a beach can be reached
 * without touching the map, and `data-beach-id` lets the shell put focus back on
 * the row the visitor left from when the detail view closes.
 */
export function BeachList({ beaches, status, selectedId, onSelect, onReset }: BeachListProps) {
  if (beaches.length === 0) {
    return (
      <div className="beach-shell-empty">
        <Waves size={30} strokeWidth={1.2} aria-hidden="true" />
        <h3>No beaches found</h3>
        <p>Try another beach, water body or community, or choose a different status.</p>
        <button type="button" onClick={onReset}>
          Show all beaches
        </button>
      </div>
    )
  }

  return (
    <ul className="beach-shell-list">
      {beaches.map((beach) => {
        const state = resolveState(status, beach.id)
        const { label } = statusPresentation(state, beach.authority)
        return (
          <li key={beach.id}>
            <button
              type="button"
              className="beach-shell-row"
              data-beach-id={beach.id}
              data-selected={beach.id === selectedId}
              onClick={() => onSelect(beach.id)}
            >
              <span className="beach-shell-row-pin" aria-hidden="true">
                <StatusPin state={state} hollow={beach.authority === 'province'} />
              </span>
              <span className="beach-shell-row-copy">
                <strong>{beach.name}</strong>
                <span>
                  {beach.waterBody} · {beach.region}
                </span>
                <span className="beach-shell-row-status" data-state={state}>
                  {label}
                </span>
              </span>
              <ArrowUpRight className="beach-shell-row-arrow" size={17} aria-hidden="true" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
