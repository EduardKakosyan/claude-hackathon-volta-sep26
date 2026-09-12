'use client'

import { useMemo } from 'react'

import { DiscoveryRow, type RenderStatus } from '@/components/discovery/discovery-row'
import type { PinState } from '@/components/status-pin'
import { groupByRegion, type LatLon } from '@/lib/geo'
import type { Beach } from '@/lib/seed/beaches'

export interface GroupedBeachListProps {
  beaches: readonly Beach[]
  status: Readonly<Record<string, PinState | undefined>>
  origin: LatLon
  selectedId: string | null
  onSelect: (id: string) => void
  renderStatus?: RenderStatus
  className?: string
}

/** All 35, by region in REGION_ORDER, each region nearest-first. */
export function GroupedBeachList({ beaches, status, origin, selectedId, onSelect, renderStatus, className }: GroupedBeachListProps) {
  const groups = useMemo(() => groupByRegion(beaches, origin), [beaches, origin])
  return (
    <div data-slot="grouped-beach-list" className={className}>
      {groups.map((group) => (
        <section key={group.region} aria-labelledby={`region-${group.region}`} className="mt-3 first:mt-0">
          <h3
            id={`region-${group.region}`}
            className="px-2 text-[11px] font-medium uppercase tracking-[0.04em] text-neutral-500"
          >
            {group.region} <span className="font-normal">· {group.beaches.length}</span>
          </h3>
          <ul className="mt-1 divide-y divide-neutral-100">
            {group.beaches.map((b) => (
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
      ))}
    </div>
  )
}
