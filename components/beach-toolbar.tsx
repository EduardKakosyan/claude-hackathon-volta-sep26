'use client'

import Image from 'next/image'
import { Search, X } from 'lucide-react'
import { memo, type RefObject } from 'react'

import { FILTER_LABEL, STATUS_FILTERS, type StatusFilter } from '@/lib/beach-filter'

export interface BeachToolbarProps {
  beachCount: number
  query: string
  onQueryChange: (query: string) => void
  filter: StatusFilter
  onFilterChange: (filter: StatusFilter) => void
  searchRef: RefObject<HTMLInputElement | null>
}

/**
 * The masthead plus the two controls that derive the visible roster. Both of them
 * feed one filter pass in `BeachApp`, so the map and the directory can never
 * disagree about which beaches are on screen.
 *
 * Memoised, and `BeachApp` hands it stable callbacks, so it only re-renders
 * when the query or the filter change. That matters right after hydration: a
 * controlled input snaps back to its React value on any re-render, so a
 * re-render of the toolbar for an unrelated reason (a hook reading the browser
 * after hydration, say) would wipe whatever a person had typed before React
 * was listening. Left alone, the typed text survives until its own event lands.
 */
export const BeachToolbar = memo(function BeachToolbar({
  beachCount,
  query,
  onQueryChange,
  filter,
  onFilterChange,
  searchRef,
}: BeachToolbarProps) {
  return (
    <header className="beach-shell-header">
      <div className="beach-shell-masthead">
        <div className="beach-shell-brand">
          <Image src="/logo.png" alt="" width={38} height={38} className="beach-shell-brand-mark" aria-hidden="true" />
          <div>
            <p className="beach-shell-eyebrow">Nova Scotia / Beach guide</p>
            <h1>Is the beach open?</h1>
          </div>
        </div>
        <p className="beach-shell-edition">{beachCount} monitored beaches. One coastline.</p>
      </div>

      <div className="beach-shell-toolbar">
        <div className="beach-shell-search">
          <Search size={19} aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            aria-label="Search by beach, water body, or community"
            placeholder="Find a beach, lake or community"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                onQueryChange('')
                searchRef.current?.focus()
              }}
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="beach-shell-filters" role="group" aria-label="Filter beaches by status">
          {STATUS_FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => onFilterChange(value)}
            >
              {FILTER_LABEL[value]}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
})
