'use client'

import { ArrowUpRight, Waves } from 'lucide-react'

import { StatusPin } from '@/components/status-pin'
import { resolveState } from '@/lib/beach-filter'
import { statusPresentation, type PinState } from '@/lib/beach-status'
import type { ConditionsView } from '@/lib/conditions'
import { formatConditions } from '@/lib/copy'
import { formatDistance } from '@/lib/geo'
import type { Beach } from '@/lib/seed/beaches'

export interface BeachListProps {
  /** Rendered in this order: the shell has already sorted them closest-first. */
  beaches: Beach[]
  status: Record<string, PinState | undefined>
  /** Kilometres from the origin per beach id; a beach with no entry shows no distance. */
  distances: Record<string, number | undefined>
  /**
   * Current conditions per beach id. Out of season they take the status
   * word's place on the row, since there is no status to give; in season the
   * detail carries them.
   */
  conditions?: Record<string, ConditionsView | undefined>
  selectedId: string | null
  onSelect: (id: string) => void
  onReset: () => void
}

/**
 * The directory. Every row is a button so a beach can be reached without
 * touching the map, and `data-beach-id` lets the shell put focus back on the
 * row the visitor left from when the detail view closes. Order is the caller's:
 * closest-first from the user or from downtown Halifax.
 */
export function BeachList({ beaches, status, distances, conditions = {}, selectedId, onSelect, onReset }: BeachListProps) {
  if (beaches.length === 0) {
    return (
      <div className="beach-shell-empty">
        <Waves size={30} strokeWidth={1.2} aria-hidden="true" />
        <h3>No beaches found</h3>
        <p>Try a different beach, lake or community, or change the status filter.</p>
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
        const km = distances[beach.id]
        const distance = km === undefined ? '' : formatDistance(km)
        // Off-season the right-hand column is the conditions, short form; with
        // nothing to show it falls back to the word rather than go blank.
        const current = state === 'offseason' ? conditions[beach.id] : undefined
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
                <span className="beach-shell-row-title">
                  <strong>{beach.name}</strong>
                  {distance ? (
                    <span className="beach-shell-row-distance">{distance}</span>
                  ) : null}
                </span>
                <span>
                  {beach.waterBody} · {beach.region}
                </span>
                <span className="beach-shell-row-status" data-state={state} data-conditions={current !== undefined}>
                  {current ? formatConditions(current, { short: true }) : label}
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
