'use client'

import { useRouter } from 'next/navigation'

import { formatDay } from '@/lib/dates'
import { buildHref } from '@/lib/url-state'

export interface ReplayControlProps {
  days: string[]
  replayDay?: string
  /** Kept in the URL across the navigation. */
  beachId: string | null
  className?: string
}

/**
 * "Replay a day". Picking a day changes which rows the page needs, so it is a
 * real navigation and the server renders again from `status_day`.
 */
export function ReplayControl({ days, replayDay, beachId, className }: ReplayControlProps) {
  const router = useRouter()
  if (days.length === 0) return null

  return (
    <label className={className}>
      <span className="sr-only">Replay a day</span>
      <select
        value={replayDay ?? ''}
        onChange={(e) => {
          const day = e.target.value || undefined
          router.push(buildHref({ day, beach: beachId ?? undefined }))
        }}
        className="rounded-xl bg-white/92 px-3 py-2 text-xs font-medium text-neutral-900 shadow-lg backdrop-blur-sm"
      >
        <option value="">Today</option>
        {days.map((d) => (
          <option key={d} value={d}>
            Replay {formatDay(d)}
          </option>
        ))}
      </select>
    </label>
  )
}
