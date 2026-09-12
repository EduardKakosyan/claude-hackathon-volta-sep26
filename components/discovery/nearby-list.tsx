'use client'

import { useMemo } from 'react'

import { DiscoveryRow, type RenderStatus } from '@/components/discovery/discovery-row'
import type { PinState } from '@/components/status-pin'
import { haversineKm, nearest, type LatLon, type OriginKind } from '@/lib/geo'
import type { Beach } from '@/lib/seed/beaches'
import { cn } from '@/lib/utils'

export interface NearbyListProps {
  beaches: readonly Beach[]
  status: Readonly<Record<string, PinState | undefined>>
  origin: LatLon
  originKind: OriginKind
  /** From resolveOrigin(); adds a one-line note under the header. */
  farFromNovaScotia?: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  /** Default 4. The selected beach is appended when it is not among the nearest. */
  limit?: number
  renderStatus?: RenderStatus
  className?: string
}

export function NearbyList({
  beaches,
  status,
  origin,
  originKind,
  farFromNovaScotia = false,
  selectedId,
  onSelect,
  limit = 4,
  renderStatus,
  className,
}: NearbyListProps) {
  const rows = useMemo(() => {
    const top = nearest(beaches, origin, limit)
    if (selectedId && !top.some((b) => b.id === selectedId)) {
      const selected = beaches.find((b) => b.id === selectedId)
      if (selected) top.push({ ...selected, km: haversineKm(origin, selected) })
    }
    return top
  }, [beaches, origin, limit, selectedId])

  return (
    <section data-slot="nearby-list" aria-labelledby="nearby-heading" className={className}>
      <h3 id="nearby-heading" className="px-2 text-[11px] font-medium uppercase tracking-[0.04em] text-neutral-500">
        {originKind === 'user' ? 'Closest to you' : 'Closest to Halifax'}
      </h3>
      {farFromNovaScotia ? (
        <p className="px-2 pt-0.5 text-[11px] text-neutral-500">
          You’re outside Nova Scotia, so distances are measured from Halifax.
        </p>
      ) : null}
      <ul className={cn('mt-1 divide-y divide-neutral-100')}>
        {rows.map((b) => (
          <DiscoveryRow
            key={b.id}
            beach={b}
            state={status[b.id] ?? 'unknown'}
            km={b.km}
            selected={b.id === selectedId}
            onSelect={onSelect}
            renderStatus={renderStatus}
          />
        ))}
      </ul>
    </section>
  )
}
