'use client'

import { useCallback, useEffect, useRef } from 'react'
import Map, { Marker, type MapRef } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'

import {
  BEACH_VIEW,
  GLOBE_VIEW,
  HALIFAX_VIEW,
  SATELLITE_TERRAIN_STYLE,
} from '@/lib/map-style'
import type { Beach } from '@/lib/seed/beaches'
import { StatusPin, type PinState } from '@/components/status-pin'

export interface BeachMapProps {
  beaches: Beach[]
  status: Record<string, PinState | undefined>
  selectedId: string | null
  onSelect: (id: string) => void
}

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
}: BeachMapProps) {
  const mapRef = useRef<MapRef | null>(null)
  const hasFlownIn = useRef(false)

  // The opening shot: a globe that drops into a tilted Halifax.
  const handleLoad = useCallback(() => {
    if (hasFlownIn.current) return
    hasFlownIn.current = true
    window.setTimeout(() => {
      mapRef.current?.flyTo({ ...HALIFAX_VIEW, speed: 0.7, curve: 1.6, essential: true })
    }, 800)
  }, [])

  // Picking a beach only moves the camera; the data never changes.
  useEffect(() => {
    if (!selectedId) return
    const beach = beaches.find((b) => b.id === selectedId)
    if (!beach) return
    hasFlownIn.current = true
    mapRef.current?.flyTo({
      center: [beach.lon, beach.lat],
      ...BEACH_VIEW,
      speed: 0.9,
      curve: 1.4,
      essential: true,
    })
  }, [selectedId, beaches])

  return (
    <Map
      ref={mapRef}
      initialViewState={GLOBE_VIEW}
      mapStyle={SATELLITE_TERRAIN_STYLE}
      projection="globe"
      terrain={{ source: 'dem', exaggeration: 1.6 }}
      attributionControl={{ compact: true }}
      onLoad={handleLoad}
      style={{ position: 'absolute', inset: 0 }}
    >
      {beaches.map((beach) => (
        <Marker
          key={beach.id}
          longitude={beach.lon}
          latitude={beach.lat}
          anchor="center"
          onClick={() => onSelect(beach.id)}
        >
          <StatusPin
            state={status[beach.id] ?? 'unknown'}
            hollow={beach.authority === 'province'}
            selected={beach.id === selectedId}
            label={beach.name}
            className="cursor-pointer"
          />
        </Marker>
      ))}
    </Map>
  )
}
