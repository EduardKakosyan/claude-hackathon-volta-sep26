'use client'

import { Search, Waves, X } from 'lucide-react'
import { type RefObject } from 'react'

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
 */
export function BeachToolbar({
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
          <Waves className="beach-shell-brand-mark" size={34} strokeWidth={1.3} aria-hidden="true" />
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
}
