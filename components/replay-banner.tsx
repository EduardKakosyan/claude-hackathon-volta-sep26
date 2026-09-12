'use client'

import { XIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { formatDay } from '@/lib/dates'
import { buildHref } from '@/lib/url-state'

export interface ReplayBannerProps {
  replayDay: string
  /** Kept in the URL when the banner closes. */
  beachId: string | null
  className?: string
}

/** A replayed map cannot be mistaken for a live one: this says which day it is. */
export function ReplayBanner({ replayDay, beachId, className }: ReplayBannerProps) {
  const router = useRouter()
  return (
    <div
      role="status"
      className={className}
    >
      <div className="flex items-center gap-2 rounded-xl bg-amber-100/95 px-3 py-2 text-xs font-medium text-amber-900 shadow-lg backdrop-blur-sm">
        <span>
          Showing {formatDay(replayDay)} — not today’s status
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Back to today"
          className="-my-1 -mr-1 size-6 text-amber-900 hover:bg-amber-200/60"
          onClick={() => router.push(buildHref({ beach: beachId ?? undefined }))}
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
