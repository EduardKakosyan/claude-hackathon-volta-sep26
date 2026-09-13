'use client'

import { Marker } from 'react-map-gl/maplibre'

import type { LatLon } from '@/lib/geo'

/**
 * The blue "you are here" dot. Blue on purpose: it is the one colour the map
 * and the status vocabulary never use, so it can never be read as a beach.
 */
export function UserMarker({ position }: { position: LatLon }) {
  return (
    <Marker longitude={position.lon} latitude={position.lat} anchor="center">
      <span data-slot="user-marker" title="Your location" className="beach-map-user" />
    </Marker>
  )
}
