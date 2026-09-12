'use client'

import dynamic from 'next/dynamic'
import { useMemo, useState } from 'react'

import { Legend } from '@/components/legend'
import { STATUS_LABEL, type PinState } from '@/components/status-pin'
import type { Beach } from '@/lib/seed/beaches'

const BeachMap = dynamic(() => import('@/components/beach-map'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center bg-[#0b1220] text-sm text-white/60">
      Loading the map…
    </div>
  ),
})

export interface BeachAppProps {
  beaches: Beach[]
  /** Keyed by beach id. A missing entry renders as `unknown`, never as a colour. */
  status: Record<string, PinState | undefined>
}

/**
 * The client root. Selection is local state — picking a beach only moves the camera,
 * so nothing here navigates. The sheet, the detail, and the URL follow in Phase 2.
 */
export function BeachApp({ beaches, status }: BeachAppProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = useMemo(
    () => beaches.find((b) => b.id === selectedId) ?? null,
    [beaches, selectedId],
  )

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#0b1220]">
      <BeachMap
        beaches={beaches}
        status={status}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-3">
        <div className="rounded-xl bg-white/92 px-4 py-2.5 text-center shadow-lg backdrop-blur-sm">
          <h1 className="text-sm font-semibold text-neutral-900">
            Is the beach open?
          </h1>
          <p className="text-xs text-neutral-500">
            {beaches.length} monitored beaches in Nova Scotia
          </p>
        </div>
      </header>

      <Legend className="absolute bottom-3 left-3 z-10 max-w-[calc(100%-1.5rem)] sm:max-w-xs" />

      {selected ? (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex justify-end sm:inset-x-auto sm:right-3">
          <div className="rounded-xl bg-white/92 px-4 py-2.5 text-right shadow-lg backdrop-blur-sm">
            <p className="text-sm font-semibold text-neutral-900">
              {selected.name}
            </p>
            <p className="text-xs text-neutral-500">
              {selected.waterBody} ·{' '}
              {STATUS_LABEL[status[selected.id] ?? 'unknown']}
            </p>
          </div>
        </div>
      ) : null}
    </main>
  )
}
