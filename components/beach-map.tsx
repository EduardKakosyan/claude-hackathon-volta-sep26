'use client'

import { setWorkerUrl } from 'maplibre-gl'
import { useCallback, useEffect, useRef } from 'react'
import Map, { Marker, type MapRef } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'

import { StatusPin } from '@/components/status-pin'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { statusAccessibleName, type PinState } from '@/lib/beach-status'
import { resolveState } from '@/lib/beach-filter'
import { BEACH_VIEW, NOVA_SCOTIA_VIEW, SATELLITE_TERRAIN_STYLE } from '@/lib/map-style'
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
}

/** A tile that 404s or times out is normal on a raster basemap; only a dead map is fatal. */
const TILE_NOISE = /tile|ajaxerror|failed to fetch|status code|networkerror/i

/**
 * MapLibre needs `window`, so this module is only ever reached through
 * `dynamic(..., { ssr: false })` in `beach-app.tsx`.
 *
 * Markers are DOM elements that MapLibre screen-anchors, so a pin stays upright and
 * legible at 65 degrees of pitch without any `pitch-alignment` work. Thirty-five of
 * them cost nothing; a GeoJSON circle layer would only pay off at hundreds.
 */
export default function BeachMap({
  beaches,
  status,
  selectedId,
  onSelect,
  onFatalError,
}: BeachMapProps) {
  const mapRef = useRef<MapRef | null>(null)
  const isReady = useRef(false)
  /** A selection made before the map loads is replayed in `onLoad`, never dropped. */
  const pendingId = useRef<string | null>(null)
  /** The camera only moves for a *new* selection, so searching never re-flies the map. */
  const flownToId = useRef<string | null>(null)
  const hasReportedFatal = useRef(false)
  const reducedMotion = useReducedMotion()

  const flyToBeach = useCallback(
    (id: string) => {
      const beach = beaches.find((b) => b.id === id)
      const map = mapRef.current
      if (!beach || !map) return
      flownToId.current = id
      const center: [number, number] = [beach.lon, beach.lat]
      // Reduced motion still needs the camera to arrive — it just gets there without the flight.
      if (reducedMotion) map.jumpTo({ center, ...BEACH_VIEW })
      else map.flyTo({ center, ...BEACH_VIEW, speed: 0.9, curve: 1.4, essential: true })
    },
    [beaches, reducedMotion],
  )

  const handleLoad = useCallback(() => {
    isReady.current = true
    const pending = pendingId.current
    pendingId.current = null
    if (pending) flyToBeach(pending)
  }, [flyToBeach])

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
    <Map
      ref={mapRef}
      initialViewState={NOVA_SCOTIA_VIEW}
      mapStyle={SATELLITE_TERRAIN_STYLE}
      projection="globe"
      terrain={{ source: 'dem', exaggeration: 1.6 }}
      attributionControl={{ compact: true }}
      onLoad={handleLoad}
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
  )
}
