'use client'

import dynamic from 'next/dynamic'
import Image from 'next/image'
import { ArrowLeft } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import { BeachDetail } from '@/components/beach-detail'
import { BeachList } from '@/components/beach-list'
import { BeachToolbar } from '@/components/beach-toolbar'
import { BottomSheet, SHEET_VISIBLE, type Snap } from '@/components/bottom-sheet'
import { MapKey } from '@/components/map-key'
import { MapUnavailable } from '@/components/map-unavailable'
import { ReplayBanner } from '@/components/replay-banner'
import { ReplayControl } from '@/components/replay-control'
import {
  countByState,
  filterBeaches,
  type StatusFilter,
} from '@/lib/beach-filter'
import { UNKNOWN_CAVEAT, type PinState } from '@/lib/beach-status'
import { formatPosted } from '@/lib/dates'
import type { PageData } from '@/lib/db/queries'
import { HALIFAX_VIEW, zoomBand, type ZoomBand } from '@/lib/map-style'
import { buildHref } from '@/lib/url-state'

import './beach-shell.css'

const BeachMap = dynamic(() => import('@/components/beach-map'), {
  ssr: false,
  loading: () => (
    <div className="beach-shell-map-loading" role="status">
      <Image src="/logo.png" alt="" width={32} height={32} aria-hidden="true" />
      <span>Opening the map...</span>
    </div>
  ),
})

export type BeachAppProps = PageData

type SelectionOrigin = 'list' | 'map'

const LABEL = { hrm: 'HRM', parks: 'Province', algae: 'Algae feed' } as const

interface PanelHeadingProps {
  selected: boolean
  isFiltered: boolean
  visibleCount: number
  total: number
  onBack: () => void
}

/**
 * The row at the top of the panel: the single back control when a beach is
 * open, the directory title otherwise, and the count. On a phone it lives in
 * the sheet's grab area, so tapping it cycles the snap.
 */
function PanelHeading({ selected, isFiltered, visibleCount, total, onBack }: PanelHeadingProps) {
  return (
    <div className="beach-shell-panel-heading">
      {selected ? (
        <button type="button" className="beach-shell-back" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" /> Back to beaches
        </button>
      ) : (
        <h2>{isFiltered ? 'Your results' : 'Find your next shore'}</h2>
      )}
      <p className="beach-shell-count" role="status">
        {selected ? `1 of ${total} beaches` : `${visibleCount} of ${total} beaches`}
      </p>
    </div>
  )
}

export function BeachApp(data: BeachAppProps) {
  const {
    beaches,
    status,
    health,
    history,
    days,
    historyFrom,
    historyTo,
    replayDay,
    storeKind,
  } = data

  const [selectedId, setSelectedId] = useState<string | null>(data.initialBeachId ?? null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<StatusFilter>('all')
  /** Where the phone sheet rests. Ignored by the desktop column, which never moves. */
  const [snap, setSnap] = useState<Snap>('half')
  /** How far in the map is: the shell scales the pins by it so the Halifax cluster reads at province zoom. */
  const [band, setBand] = useState<ZoomBand>(() => zoomBand(HALIFAX_VIEW.zoom))
  const [mapError, setMapError] = useState<string | null>(null)
  const [mapAttempt, setMapAttempt] = useState(0)

  const panelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const originRef = useRef<SelectionOrigin | null>(null)
  const lastSelectedId = useRef<string | null>(null)
  const restoreFocus = useRef(false)

  const pinState = useMemo(() => {
    const out: Record<string, PinState> = {}
    for (const b of beaches) out[b.id] = status[b.id]?.state ?? 'unknown'
    return out
  }, [beaches, status])

  const visible = useMemo(
    () => filterBeaches({ beaches, status: pinState, query, filter }),
    [beaches, pinState, query, filter],
  )
  const selected = useMemo(
    () => beaches.find((b) => b.id === selectedId) ?? null,
    [beaches, selectedId],
  )
  const counts = useMemo(() => countByState(beaches, pinState), [beaches, pinState])
  const isFiltered = query.trim().length > 0 || filter !== 'all'

  const selectBeach = useCallback(
    (id: string, origin: SelectionOrigin) => {
      originRef.current = origin
      lastSelectedId.current = id
      setSelectedId(id)
      // The detail answers "is it open?" with the map still visible, so it always opens at half.
      setSnap('half')
      panelRef.current?.scrollTo({ top: 0 })
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', buildHref({ day: replayDay, beach: id }))
      }
    },
    [replayDay],
  )

  const closeDetail = useCallback(() => {
    restoreFocus.current = true
    setSelectedId(null)
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', buildHref({ day: replayDay }))
    }
  }, [replayDay])

  // Escape is listened for on the document, not on <main>: clicking a row unmounts
  // the row, focus falls to <body>, and a keydown there would never reach <main>.
  useEffect(() => {
    if (!selected) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeDetail()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [selected, closeDetail])

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

  const footer = replayDay
    ? `Replayed: ${formatPosted(replayDay)}`
    : storeKind === 'fixture'
      ? 'Showing a fixture day, not live status'
      : health.length === 0
        ? 'No source has been read yet'
        : health
            .map((h) =>
              h.lastSuccessAt && h.lastSuccessAt === h.lastAttemptAt
                ? `${LABEL[h.source]} checked ${formatPosted(h.lastAttemptAt)}`
                : h.lastSuccessAt
                  ? `${LABEL[h.source]} last confirmed ${formatPosted(h.lastSuccessAt)}; could not reach it since`
                  : `${LABEL[h.source]} never read`,
            )
            .join(' / ')

  return (
    <main className="beach-shell">
      <BeachToolbar
        beachCount={beaches.length}
        query={query}
        onQueryChange={changeQuery}
        filter={filter}
        onFilterChange={changeFilter}
        searchRef={searchRef}
      />

      <div
        className="beach-shell-workspace"
        style={{ '--sheet-visible': SHEET_VISIBLE[snap] } as CSSProperties}
      >
        <section className="beach-shell-map" aria-label="Map of Nova Scotia beaches" data-zoom-band={band}>
          {mapError ? (
            <MapUnavailable message={mapError} onRetry={retryMap} />
          ) : (
            <>
              <BeachMap
                key={mapAttempt}
                beaches={visible}
                status={pinState}
                selectedId={selectedId}
                onSelect={(id) => selectBeach(id, 'map')}
                onFatalError={setMapError}
                onZoomBandChange={setBand}
              />
              <MapKey />

              {replayDay ? (
                <ReplayBanner
                  replayDay={replayDay}
                  beachId={selectedId}
                  className="absolute inset-x-0 top-0 z-10 mx-3 mt-3"
                />
              ) : null}

              <ReplayControl
                days={days}
                replayDay={replayDay}
                beachId={selectedId}
                className="absolute top-3 right-3 z-10"
              />
            </>
          )}
        </section>

        <BottomSheet
          snap={snap}
          onSnapChange={setSnap}
          aria-label={selected ? 'Selected beach' : 'Beach directory'}
          bodyRef={panelRef}
          heading={
            <PanelHeading
              selected={selected !== null}
              isFiltered={isFiltered}
              visibleCount={visible.length}
              total={beaches.length}
              onBack={closeDetail}
            />
          }
          footer={
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
              <p>{footer}</p>
              <p>Not an official government service. Follow posted signs and lifeguard instructions.</p>
            </footer>
          }
        >
          {selected ? (
            <BeachDetail
              key={selected.id}
              beach={selected}
              status={status[selected.id]}
              history={history[selected.id] ?? []}
              historyFrom={historyFrom}
              historyTo={historyTo}
              replayDay={replayDay}
              onBack={closeDetail}
            />
          ) : (
            <>
              <p className="beach-shell-list-note">
                Alphabetical directory <span>Choose a beach to explore</span>
              </p>
              <BeachList
                beaches={visible}
                status={pinState}
                selectedId={selectedId}
                onSelect={(id) => selectBeach(id, 'list')}
                onReset={resetSearch}
              />
            </>
          )}
        </BottomSheet>
      </div>
    </main>
  )
}
