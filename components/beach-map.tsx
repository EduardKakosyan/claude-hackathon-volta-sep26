'use client'

import { setWorkerUrl } from 'maplibre-gl'
import { useCallback, useEffect, useRef, useState } from 'react'
import Map, { Marker, type MapRef, type ViewStateChangeEvent } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'

import { StatusPin } from '@/components/status-pin'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { statusAccessibleName, type PinState } from '@/lib/beach-status'
import { resolveState } from '@/lib/beach-filter'
import { BEACH_VIEW, HALIFAX_VIEW, PAPER_STYLE, zoomBand, type ZoomBand } from '@/lib/map-style'
import { MAPLIBRE_WORKER_URL } from '@/lib/maplibre-worker'
import type { Beach } from '@/lib/seed/beaches'

// Under Turbopack MapLibre's default worker URL resolves to '' — this document —
// and every worker dies parsing HTML. Start them from the copy in public/ instead.
setWorkerUrl(MAPLIBRE_WORKER_URL)

export interface BeachMapProps {
  /** The visible roster. The shell filters once; the map and the directory show the same beaches. */
  beaches: Beach[]
  status: Record<string, PinState | undefined>
  selectedId: string | null
  onSelect: (id: string) => void
  /** Fires once when the map cannot run at all. A failed tile is not a failed map. */
  onFatalError: (message: string) => void
  /** Fires as the camera moves between the three zoom bands; the shell scales the pins by it. */
  onZoomBandChange?: (band: ZoomBand) => void
}

/**
 * A tile, glyph or sprite that fails to load is normal when the network is slow
 * or blocked; only a dead map is fatal. MapLibre wraps every failed request as
 * `AJAXError: … (status): url`.
 */
const TILE_NOISE = /tile|ajaxerror|failed to fetch|status code|networkerror|sprite|glyph/i

/**
 * How much of the map the phone sheet covers, in px, read from the probe whose
 * height is `--sheet-visible`. Capped below the map height so the camera maths
 * stays sane; 0 on desktop, where the panel is a column beside the map.
 */
function insetOf(probe: HTMLElement | null): number {
  const container = probe?.parentElement
  if (!probe || !container) return 0
  return Math.max(0, Math.min(probe.offsetHeight, Math.floor(container.clientHeight * 0.8)))
}

/**
 * MapLibre needs `window`, so this module is only ever reached through
 * `dynamic(..., { ssr: false })` in `beach-app.tsx`.
 *
 * The map is the paper style from lib/map-style, flat and north-up. Markers are
 * DOM elements that MapLibre screen-anchors, so a pin is a real button the
 * keyboard can reach. Thirty-five of them cost nothing; a GeoJSON circle layer
 * would only pay off at hundreds.
 */
export default function BeachMap({
  beaches,
  status,
  selectedId,
  onSelect,
  onFatalError,
  onZoomBandChange,
}: BeachMapProps) {
  const mapRef = useRef<MapRef | null>(null)
  const isReady = useRef(false)
  /** A selection made before the map loads is replayed in `onLoad`, never dropped. */
  const pendingId = useRef<string | null>(null)
  /** The camera only moves for a *new* selection, so searching never re-flies the map. */
  const flownToId = useRef<string | null>(null)
  const hasReportedFatal = useRef(false)
  /** A zero-width element whose height is `--sheet-visible`, so the phone sheet's cover resolves to pixels. */
  const probeRef = useRef<HTMLDivElement | null>(null)
  /**
   * The sheet's cover at mount, in px. react-map-gl reads `initialViewState`
   * once, when it creates the map, so the opening frame is padded up front for
   * Halifax to land in the uncovered part; the map only renders once the probe
   * has been measured, which its callback ref does the moment it is attached.
   */
  const [sheetInset, setSheetInset] = useState<number | null>(null)
  const reducedMotion = useReducedMotion()

  const attachProbe = useCallback((node: HTMLDivElement | null) => {
    probeRef.current = node
    if (node) setSheetInset(insetOf(node))
  }, [])

  /** On a phone a selected pin has to land in the part of the map the sheet leaves uncovered. */
  const sheetPadding = useCallback((): number => insetOf(probeRef.current), [])

  const flyToBeach = useCallback(
    (id: string) => {
      const beach = beaches.find((b) => b.id === id)
      const map = mapRef.current
      if (!beach || !map) return
      flownToId.current = id
      const center: [number, number] = [beach.lon, beach.lat]
      const padding = { top: 0, right: 0, left: 0, bottom: sheetPadding() }
      // Reduced motion still needs the camera to arrive — it just gets there without the flight.
      if (reducedMotion) map.jumpTo({ center, padding, ...BEACH_VIEW })
      else map.flyTo({ center, padding, ...BEACH_VIEW, speed: 0.9, curve: 1.4, essential: true })
    },
    [beaches, reducedMotion, sheetPadding],
  )

  const handleLoad = useCallback(() => {
    isReady.current = true
    const pending = pendingId.current
    pendingId.current = null
    if (pending) flyToBeach(pending)
  }, [flyToBeach])

  const handleMove = useCallback(
    (event: ViewStateChangeEvent) => {
      onZoomBandChange?.(zoomBand(event.viewState.zoom))
    },
    [onZoomBandChange],
  )

  useEffect(() => {
    // Clearing the selection returns to the directory; it must not fly the camera anywhere.
    if (!selectedId) {
      flownToId.current = null
      return
    }
    if (selectedId === flownToId.current) return
    if (!isReady.current) {
      pendingId.current = selectedId
      return
    }
    flyToBeach(selectedId)
  }, [selectedId, flyToBeach])

  const handleError = useCallback(
    (event: { error?: Error; sourceId?: string }) => {
      if (hasReportedFatal.current) return
      // A source-scoped error is one broken layer, not a map that cannot run.
      if (event.sourceId) return
      const message = event.error?.message ?? ''
      if (TILE_NOISE.test(message)) return
      hasReportedFatal.current = true
      onFatalError(message || 'The map could not start in this browser.')
    },
    [onFatalError],
  )

  return (
    <>
      {sheetInset !== null && (
        <Map
          ref={mapRef}
          initialViewState={{
            ...HALIFAX_VIEW,
            padding: { top: 0, right: 0, left: 0, bottom: sheetInset },
          }}
          mapStyle={PAPER_STYLE}
          attributionControl={{ compact: true }}
          onLoad={handleLoad}
          onMove={handleMove}
          onError={handleError}
          style={{ position: 'absolute', inset: 0 }}
        >
          {beaches.map((beach) => {
            const state = resolveState(status, beach.id)
            return (
              <Marker key={beach.id} longitude={beach.lon} latitude={beach.lat} anchor="center">
                {/* A button, not a span: a pin is a control, so it has to be reachable by keyboard. */}
                <button
                  type="button"
                  className="beach-map-pin"
                  aria-label={statusAccessibleName(beach.name, state, beach.authority)}
                  aria-pressed={beach.id === selectedId}
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelect(beach.id)
                  }}
                >
                  <StatusPin
                    state={state}
                    hollow={beach.authority === 'province'}
                    selected={beach.id === selectedId}
                    label={beach.name}
                  />
                </button>
              </Marker>
            )
          })}
        </Map>
      )}
      <div ref={attachProbe} className="beach-map-probe" aria-hidden="true" />
    </>
  )
}
