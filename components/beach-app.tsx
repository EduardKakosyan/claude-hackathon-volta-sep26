'use client'

import dynamic from 'next/dynamic'
import { ArrowLeft, ChevronDown, Waves } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { BeachDetail } from '@/components/beach-detail'
import { BeachList } from '@/components/beach-list'
import { BeachToolbar } from '@/components/beach-toolbar'
import { MapKey } from '@/components/map-key'
import { MapUnavailable } from '@/components/map-unavailable'
import {
  countByState,
  filterBeaches,
  resolveState,
  type StatusFilter,
} from '@/lib/beach-filter'
import { UNKNOWN_CAVEAT, type PinState } from '@/lib/beach-status'
import type { Beach } from '@/lib/seed/beaches'

import './beach-shell.css'

const BeachMap = dynamic(() => import('@/components/beach-map'), {
  ssr: false,
  loading: () => (
    <div className="beach-shell-map-loading" role="status">
      <Waves size={32} aria-hidden="true" />
      <span>Opening the satellite map...</span>
    </div>
  ),
})

export interface BeachAppProps {
  beaches: Beach[]
  /** Keyed by beach id. A missing entry renders as `unknown`, never as a colour. */
  status: Record<string, PinState | undefined>
}

/** Where focus goes when the detail view closes. */
type SelectionOrigin = 'list' | 'map'

export function BeachApp({ beaches, status }: BeachAppProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [isPanelExpanded, setPanelExpanded] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  /** Bumped on retry so a failed map remounts instead of re-rendering its corpse. */
  const [mapAttempt, setMapAttempt] = useState(0)

  const panelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const originRef = useRef<SelectionOrigin | null>(null)
  const lastSelectedId = useRef<string | null>(null)
  const restoreFocus = useRef(false)

  // One derivation feeds both the map and the directory, so their counts always agree.
  const visible = useMemo(
    () => filterBeaches({ beaches, status, query, filter }),
    [beaches, status, query, filter],
  )
  const selected = useMemo(
    () => beaches.find((b) => b.id === selectedId) ?? null,
    [beaches, selectedId],
  )
  const counts = useMemo(() => countByState(beaches, status), [beaches, status])
  const isFiltered = query.trim().length > 0 || filter !== 'all'

  const selectBeach = useCallback((id: string, origin: SelectionOrigin) => {
    originRef.current = origin
    lastSelectedId.current = id
    setSelectedId(id)
    panelRef.current?.scrollTo({ top: 0 })
  }, [])

  const closeDetail = useCallback(() => {
    restoreFocus.current = true
    setSelectedId(null)
  }, [])

  /**
   * The panel is not modal, so nothing is trapped: closing just returns focus to the
   * control that opened the detail. A marker has no equivalent after the roster
   * re-renders, so map selections fall back to search.
   */
  useEffect(() => {
    if (selectedId || !restoreFocus.current) return
    restoreFocus.current = false
    const id = lastSelectedId.current
    if (originRef.current === 'list' && id) {
      const row = panelRef.current?.querySelector<HTMLButtonElement>(`[data-beach-id="${id}"]`)
      if (row) {
        row.focus({ preventScroll: true })
        row.scrollIntoView({ block: 'nearest' })
        return
      }
    }
    searchRef.current?.focus({ preventScroll: true })
  }, [selectedId])

  // Narrowing the roster must not leave a beach selected that is no longer on screen.
  function changeQuery(next: string) {
    setQuery(next)
    setSelectedId(null)
  }

  function changeFilter(next: StatusFilter) {
    setFilter(next)
    setSelectedId(null)
  }

  function resetSearch() {
    setQuery('')
    setFilter('all')
    setSelectedId(null)
    searchRef.current?.focus()
  }

  function retryMap() {
    setMapError(null)
    setMapAttempt((attempt) => attempt + 1)
  }

  return (
    <main
      className="beach-shell"
      data-expanded={isPanelExpanded}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && selected) closeDetail()
      }}
    >
      <BeachToolbar
        beachCount={beaches.length}
        query={query}
        onQueryChange={changeQuery}
        filter={filter}
        onFilterChange={changeFilter}
        searchRef={searchRef}
      />

      <div className="beach-shell-workspace">
        <section className="beach-shell-map" aria-label="Satellite map of Nova Scotia beaches">
          {mapError ? (
            <MapUnavailable message={mapError} onRetry={retryMap} />
          ) : (
            <>
              <BeachMap
                key={mapAttempt}
                beaches={visible}
                status={status}
                selectedId={selectedId}
                onSelect={(id) => selectBeach(id, 'map')}
                onFatalError={setMapError}
              />
              <MapKey />
            </>
          )}
        </section>

        <aside className="beach-shell-panel" aria-label={selected ? 'Selected beach' : 'Beach directory'}>
          <button
            className="beach-shell-sheet-toggle"
            type="button"
            aria-expanded={isPanelExpanded}
            aria-controls="beach-shell-panel-content"
            onClick={() => setPanelExpanded((expanded) => !expanded)}
          >
            <span className="beach-shell-handle" />
            <span>
              {isPanelExpanded ? 'Show more map' : 'Show more of the list'}
              <ChevronDown size={14} aria-hidden="true" />
            </span>
          </button>

          <div className="beach-shell-panel-heading">
            {selected ? (
              <button type="button" className="beach-shell-back" onClick={closeDetail}>
                <ArrowLeft size={16} aria-hidden="true" /> Back to beaches
              </button>
            ) : (
              <h2>{isFiltered ? 'Your results' : 'Find your next shore'}</h2>
            )}
            <p className="beach-shell-count" role="status">
              {selected
                ? `1 of ${beaches.length} beaches`
                : `${visible.length} of ${beaches.length} beaches`}
            </p>
          </div>

          <div className="beach-shell-panel-scroll" ref={panelRef} id="beach-shell-panel-content">
            {selected ? (
              <BeachDetail
                key={selected.id}
                beach={selected}
                state={resolveState(status, selected.id)}
                onClose={closeDetail}
              />
            ) : (
              <>
                <p className="beach-shell-list-note">
                  Alphabetical directory <span>Choose a beach to explore</span>
                </p>
                <BeachList
                  beaches={visible}
                  status={status}
                  selectedId={selectedId}
                  onSelect={(id) => selectBeach(id, 'list')}
                  onReset={resetSearch}
                />
              </>
            )}
          </div>

          <footer className="beach-shell-footer">
            {counts.unknown > 0 && (
              <p>
                <strong>
                  {counts.unknown} {counts.unknown === 1 ? 'beach has' : 'beaches have'} no status
                  available.
                </strong>{' '}
                {UNKNOWN_CAVEAT}
              </p>
            )}
            <p>Not an official government service. Follow posted signs and lifeguard instructions.</p>
          </footer>
        </aside>
      </div>
    </main>
  )
}
