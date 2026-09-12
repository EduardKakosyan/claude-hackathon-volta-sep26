'use client'

import { Marker } from 'react-map-gl/maplibre'

import type { LatLon } from '@/lib/geo'

/** The blue "you" dot from docs/mockup-main-screen.html:29. */
export function UserMarker({ position }: { position: LatLon }) {
  return (
    <Marker longitude={position.lon} latitude={position.lat} anchor="center">
      <span
        data-slot="user-marker"
        title="Your location"
        className="block size-4 rounded-full border-[3px] border-white bg-blue-600 shadow-[0_0_0_6px_rgba(37,99,235,0.2)]"
      />
    </Marker>
  )
}
