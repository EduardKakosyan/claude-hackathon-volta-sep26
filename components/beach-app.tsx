'use client'

import dynamic from 'next/dynamic'
import Image from 'next/image'
import { ArrowLeft, ChevronDown } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import { BeachDetail } from '@/components/beach-detail'
import { BeachList } from '@/components/beach-list'
import { BeachToolbar } from '@/components/beach-toolbar'
import { BottomSheet, SHEET_VISIBLE, type Snap } from '@/components/bottom-sheet'
import { DayScrubber } from '@/components/day-scrubber'
import { LocateButton } from '@/components/locate-button'
import { MapKey } from '@/components/map-key'
import { MapUnavailable } from '@/components/map-unavailable'
import {
  countByState,
  filterBeaches,
  type StatusFilter,
} from '@/lib/beach-filter'
import { UNKNOWN_CAVEAT, type PinState } from '@/lib/beach-status'
import { formatFreshness, offseasonLabel } from '@/lib/copy'
import { formatDay } from '@/lib/dates'
import type { PageData } from '@/lib/db/queries'
import { OPEN_METEO_CREDIT_URL } from '@/lib/ingest/sources/open-meteo'
import { SMARTATLANTIC_CREDIT_URL } from '@/lib/ingest/sources/smartatlantic'
import { resolveOrigin, sortByDistance } from '@/lib/geo'
import type { GeolocationProvider } from '@/lib/geolocation'
import { useFollow, type UseFollowDeps } from '@/hooks/use-follow'
import { LATE_ARRIVAL_MS, useGeolocation } from '@/hooks/use-geolocation'
import { HALIFAX_VIEW, zoomBand, type ZoomBand } from '@/lib/map-style'
import { offseasonAuthorities } from '@/lib/season'
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

export type BeachAppProps = PageData & {
  /**
   * Injected by tests. `undefined` is `navigator.geolocation`; `null` is a
   * browser with none (the list sorts from downtown Halifax).
   */
  geolocation?: GeolocationProvider | null
  /** Injected by tests: the push port, the follow client and the storage behind the bell. */
  push?: UseFollowDeps
}

type SelectionOrigin = 'list' | 'map'

/**
 * Where "Suggest one" in the footer goes: a new issue on the public repository,
 * pre-filled from .github/ISSUE_TEMPLATE/suggestion.md. Nothing runs inside the
 * app and nothing needs moderating; swap this one address for a hosted form if
 * needing a GitHub account turns out to be a barrier.
 */
export const REPO_URL = 'https://github.com/EduardKakosyan/claude-hackathon-volta-sep26'
export const SUGGEST_URL = `${REPO_URL}/issues/new?template=suggestion.md`

/** What the directory is sorted from, as the heading says it. */
const ORIGIN_HEADING = { user: 'Closest to you', halifax: 'Near Halifax' } as const

/** The one quiet line under the heading when the origin needs explaining. */
const ORIGIN_NOTE = {
  far: 'The nearest monitored beach is far.',
  halifax: 'Showing distances from downtown Halifax.',
} as const

interface PanelHeadingProps {
  selected: boolean
  /** "Closest to you" or "Near Halifax"; a filtered directory says "Your results" instead. */
  heading: string
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
function PanelHeading({ selected, heading, isFiltered, visibleCount, total, onBack }: PanelHeadingProps) {
  return (
    <div className="beach-shell-panel-heading">
      {selected ? (
        <button type="button" className="beach-shell-back" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" /> Back to beaches
        </button>
      ) : (
        <h2>{isFiltered ? 'Your results' : heading}</h2>
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
    conditions,
    days,
    historyFrom,
    historyTo,
    today,
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
  /** Every locate tap owes the camera one more flight to the user. */
  const [locateTaps, setLocateTaps] = useState(0)

  // The page asks the moment it mounts and is useful either way: sorted from
  // downtown Halifax at once, re-sorted and flown to the visitor if a position
  // arrives in time. A late position re-sorts silently and leaves the camera alone.
  const geo = useGeolocation({ provider: data.geolocation, auto: true, timeoutMs: LATE_ARRIVAL_MS })
  // Nothing happens on load: the service worker and the permission prompt wait for the first bell tap.
  const follow = useFollow(data.push)

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
  const origin = useMemo(() => resolveOrigin(geo.position), [geo.position])
  /** The directory order: closest-first from the origin, with a distance on every row. */
  const sorted = useMemo(() => sortByDistance(visible, origin.point), [visible, origin.point])
  const distances = useMemo(
    () => Object.fromEntries(sorted.map((beach) => [beach.id, beach.km])) as Record<string, number>,
    [sorted],
  )
  const heading = ORIGIN_HEADING[origin.kind]
  const note = origin.far ? ORIGIN_NOTE.far : origin.kind === 'halifax' ? ORIGIN_NOTE.halifax : null
  /**
   * The on-load position is one flight if it came in time and the page did not
   * open on a beach from a link (that beach's camera wins); every locate tap is
   * another. The map flies once per value and never for 0.
   */
  const autoFlight = geo.status === 'granted' && !geo.lateArrival && !data.initialBeachId ? 1 : 0
  const flyToUser = autoFlight + locateTaps
  const selected = useMemo(
    () => beaches.find((b) => b.id === selectedId) ?? null,
    [beaches, selectedId],
  )
  const counts = useMemo(() => countByState(beaches, pinState), [beaches, pinState])
  /** The authorities the refresh has closed for the season: read from the rows, so the footer agrees with them. */
  const offseason = useMemo(() => offseasonAuthorities(beaches, status), [beaches, status])
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

  // Stable, so the memoised toolbar re-renders only when the query or filter change (see BeachToolbar).
  const changeQuery = useCallback((next: string) => {
    setQuery(next)
    setSelectedId(null)
  }, [])

  const changeFilter = useCallback((next: StatusFilter) => {
    setFilter(next)
    setSelectedId(null)
  }, [])

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

  function locate() {
    setLocateTaps((taps) => taps + 1)
    geo.request()
  }

  // The fixture day says what it is rather than when it was "checked"; out of
  // season it still says which authorities the calendar has closed, so the
  // off-season screens read the same in fixture mode as against the database.
  const footer = replayDay
    ? `Replaying ${formatDay(replayDay)} — not today’s status`
    : storeKind === 'fixture'
      ? ['Showing a fixture day, not live status', ...offseason.map(offseasonLabel)].join(' · ')
      : formatFreshness(health, offseason)

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
                userPosition={geo.position}
                flyToUser={flyToUser}
              />
              <MapKey />
              <LocateButton status={geo.status} onRequest={locate} />

              <DayScrubber
                days={days}
                today={today}
                replayDay={replayDay}
                beachId={selectedId}
                className="beach-shell-replay"
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
              heading={heading}
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
              {/*
                The rest is one collapsed line: on a laptop-height window a
                six-line footer pinned under the list hid all but two rows.
                What stays open is what changes hour to hour (the freshness
                line) or day to day (the unknown count); the disclaimer, the
                credits and the suggestion link are a tap away.
              */}
              <details className="beach-shell-footer-more">
                <summary>
                  Not an official government service · Sources and credits
                  <ChevronDown size={12} aria-hidden="true" />
                </summary>
                <p>Not an official government service. Follow posted signs and lifeguard instructions.</p>
                <p className="beach-shell-credits">
                  Wind from{' '}
                  <a href={OPEN_METEO_CREDIT_URL} target="_blank" rel="noreferrer">
                    Open-Meteo
                  </a>
                  ; water temperature from the{' '}
                  <a href={SMARTATLANTIC_CREDIT_URL} target="_blank" rel="noreferrer">
                    SmartAtlantic
                  </a>{' '}
                  Halifax buoy. Both CC BY 4.0.
                </p>
                <p>
                  Ideas or problems?{' '}
                  <a href={SUGGEST_URL} target="_blank" rel="noreferrer">
                    Suggest one
                  </a>
                </p>
              </details>
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
              distanceKm={distances[selected.id]}
              conditions={conditions[selected.id]}
              follow={{
                state: follow.stateOf(selected.id),
                busy: follow.busy,
                error: follow.error,
                onToggle: () => void follow.toggle(selected.id),
              }}
            />
          ) : (
            <>
              <p className="beach-shell-list-note" data-origin={origin.kind} data-far={origin.far}>
                <span className="beach-shell-list-note-order">Closest first</span>
                {note ? <span className="beach-shell-list-note-origin">{note}</span> : null}
              </p>
              <BeachList
                beaches={sorted}
                status={pinState}
                distances={distances}
                conditions={conditions}
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
