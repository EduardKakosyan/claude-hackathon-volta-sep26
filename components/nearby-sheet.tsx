'use client'

import { useMemo } from 'react'

import { BeachRow } from '@/components/beach-row'
import type { PinState } from '@/components/status-pin'
import type { Beach } from '@/lib/seed/beaches'

/** Downtown Halifax; the sort origin until a location is offered. */
export const HALIFAX: { lat: number; lon: number } = { lat: 44.6488, lon: -63.5752 }

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * r * Math.asin(Math.sqrt(h))
}

export function formatKm(km: number): string {
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`
}

export interface NearbySheetProps {
  beaches: Beach[]
  pinState: Record<string, PinState>
  selectedId: string | null
  onSelect: (id: string) => void
  /** Where distances are measured from. Defaults to Halifax. */
  origin?: { lat: number; lon: number }
  title?: string
}

/**
 * The list. Controlled entirely by props so the same component sits in the
 * bottom panel on a phone and the left column on a wide screen.
 */
export function NearbySheet({
  beaches,
  pinState,
  selectedId,
  onSelect,
  origin = HALIFAX,
  title = 'Closest to Halifax',
}: NearbySheetProps) {
  const rows = useMemo(
    () =>
      beaches
        .map((b) => ({ beach: b, km: haversineKm(origin, b) }))
        .sort((a, b) => a.km - b.km),
    [beaches, origin],
  )

  return (
    <section aria-label={title} className="flex min-h-0 flex-col">
      <h2 className="px-2 pb-1 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
        {title}
      </h2>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {rows.map(({ beach, km }) => (
          <li key={beach.id}>
            <BeachRow
              beach={beach}
              state={pinState[beach.id] ?? 'unknown'}
              selected={beach.id === selectedId}
              distance={formatKm(km)}
              onSelect={onSelect}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
