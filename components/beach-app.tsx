'use client'

import dynamic from 'next/dynamic'
import { useCallback, useMemo, useState } from 'react'

import { BeachDetail } from '@/components/beach-detail'
import { Legend } from '@/components/legend'
import { NearbySheet } from '@/components/nearby-sheet'
import { ReplayBanner } from '@/components/replay-banner'
import { ReplayControl } from '@/components/replay-control'
import type { PinState } from '@/components/status-pin'
import { formatDay, formatPosted } from '@/lib/dates'
import type { PageData } from '@/lib/db/queries'
import { buildHref } from '@/lib/url-state'

const BeachMap = dynamic(() => import('@/components/beach-map'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center bg-[#0b1220] text-sm text-white/60">
      Loading the map…
    </div>
  ),
})

export type BeachAppProps = PageData

/**
 * The client root. Selection is local state — picking a beach only moves the
 * camera and opens the detail, so the URL follows with `replaceState` and
 * nothing navigates. Picking a replay day is the one real navigation.
 */
export function BeachApp(data: BeachAppProps) {
  const { beaches, status, health, history, days, historyFrom, historyTo, replayDay, storeKind } =
    data
  const [selectedId, setSelectedId] = useState<string | null>(data.initialBeachId ?? null)

  const pinState = useMemo(() => {
    const out: Record<string, PinState> = {}
    for (const b of beaches) out[b.id] = status[b.id]?.state ?? 'unknown'
    return out
  }, [beaches, status])

  const selected = useMemo(
    () => beaches.find((b) => b.id === selectedId) ?? null,
    [beaches, selectedId],
  )

  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id)
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', buildHref({ day: replayDay, beach: id ?? undefined }))
      }
    },
    [replayDay],
  )

  const footer = replayDay
    ? `Replayed: ${formatDay(replayDay)}`
    : storeKind === 'seed'
      ? 'Not connected to a database — no source has been read yet'
      : health.length === 0
        ? 'No source has been read yet'
        : health
            .map((h) =>
              h.lastSuccessAt && h.lastSuccessAt === h.lastAttemptAt
                ? `${LABEL[h.source]} checked ${formatPosted(h.lastAttemptAt)}`
                : h.lastSuccessAt
                  ? `${LABEL[h.source]} last confirmed ${formatPosted(h.lastSuccessAt)} · couldn’t reach it since`
                  : `${LABEL[h.source]} never read`,
            )
            .join(' · ')

  const panel = selected ? (
    <BeachDetail
      beach={selected}
      status={status[selected.id]}
      history={history[selected.id] ?? []}
      historyFrom={historyFrom}
      historyTo={historyTo}
      replayDay={replayDay}
      onBack={() => select(null)}
    />
  ) : (
    <NearbySheet beaches={beaches} pinState={pinState} selectedId={selectedId} onSelect={select} />
  )

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#0b1220] lg:grid lg:grid-cols-[384px_1fr]">
      {/* Wide: the left column. Phone: the bottom panel. Same children. */}
      <aside className="absolute inset-x-0 bottom-0 z-20 flex max-h-[46dvh] flex-col gap-3 rounded-t-2xl bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_24px_rgba(0,0,0,0.25)] lg:static lg:max-h-none lg:rounded-none lg:border-r lg:border-neutral-200 lg:p-4">
        <div className="hidden lg:block">
          <h1 className="text-base font-semibold text-neutral-900">Is the beach open?</h1>
          <p className="text-xs text-neutral-500">
            {beaches.length} monitored beaches in Nova Scotia
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{panel}</div>
        <p className="border-t border-neutral-200 pt-2 text-[11px] leading-snug text-neutral-500">
          {footer}
        </p>
      </aside>

      <div className="relative h-full min-h-0">
        <BeachMap
          beaches={beaches}
          status={pinState}
          selectedId={selectedId}
          onSelect={select}
        />

        <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-2 p-3">
          <div className="rounded-xl bg-white/92 px-4 py-2.5 text-center shadow-lg backdrop-blur-sm lg:hidden">
            <h1 className="text-sm font-semibold text-neutral-900">Is the beach open?</h1>
            <p className="text-xs text-neutral-500">
              {beaches.length} monitored beaches in Nova Scotia
            </p>
          </div>
          {replayDay ? (
            <ReplayBanner replayDay={replayDay} beachId={selectedId} className="pointer-events-auto" />
          ) : null}
        </header>

        <ReplayControl
          days={days}
          replayDay={replayDay}
          beachId={selectedId}
          className="absolute top-3 right-3 z-10"
        />

        <Legend className="absolute bottom-[calc(46dvh+0.75rem)] left-3 z-10 max-w-[calc(100%-1.5rem)] sm:max-w-xs lg:bottom-3" />
      </div>
    </main>
  )
}

const LABEL = { hrm: 'HRM', parks: 'Province', algae: 'Algae feed' } as const
