'use client'

import { NavigationIcon, Share2Icon } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { Button } from '@/components/ui/button'
import {
  buildBeachUrl,
  detectPlatform,
  directionsUrl,
  shareUrl,
  type Platform,
  type ShareNavigator,
  type ShareOutcome,
} from '@/lib/navigation'
import type { Beach } from '@/lib/seed/beaches'
import { cn } from '@/lib/utils'

export interface DirectionsButtonProps {
  beach: Pick<Beach, 'lat' | 'lon' | 'name'>
  /** Detected from the user agent after mount when omitted; SSR renders the universal Google Maps link. */
  platform?: Platform
  className?: string
}

/** No live updates to subscribe to; the user agent does not change mid-session. */
function subscribeToNothing() {
  return () => {}
}

function readUserAgentPlatform(): Platform {
  return detectPlatform(navigator.userAgent)
}

function readServerPlatform(): Platform {
  return 'other'
}

/**
 * `navigator` does not exist during SSR, so the platform is read through
 * `useSyncExternalStore`: the server snapshot ('other', the universal Google
 * Maps link) matches the client's first render, and the real platform swaps in
 * once React reconciles against the browser — no `setState` inside an effect.
 */
function useDetectedPlatform(): Platform {
  return useSyncExternalStore(subscribeToNothing, readUserAgentPlatform, readServerPlatform)
}

export function DirectionsButton({ beach, platform, className }: DirectionsButtonProps) {
  const detected = useDetectedPlatform()
  const href = directionsUrl(beach, platform ?? detected)
  return (
    <Button asChild variant="default" className={cn('flex-1', className)}>
      <a href={href} target="_blank" rel="noopener noreferrer" data-platform={platform ?? detected}>
        <NavigationIcon data-icon="inline-start" />
        Directions
      </a>
    </Button>
  )
}

export interface ShareButtonProps {
  beach: Pick<Beach, 'id' | 'name' | 'waterBody'>
  /** Defaults to the current page URL with `beach` set — so `day` and anything else survive. */
  getUrl?: () => string
  /** Defaults to `navigator`. */
  nav?: ShareNavigator
  onOutcome?: (outcome: ShareOutcome, url: string) => void
  className?: string
}

const FEEDBACK: Record<ShareOutcome, string> = {
  shared: 'Shared',
  copied: 'Link copied',
  cancelled: 'Share',
  failed: 'Copy the link below',
}

export function ShareButton({ beach, getUrl, nav, onOutcome, className }: ShareButtonProps) {
  const [outcome, setOutcome] = useState<ShareOutcome | null>(null)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const timer = useRef<number | null>(null)
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current)
  }, [])

  async function onClick() {
    const url = getUrl ? getUrl() : buildBeachUrl(window.location.href, beach.id)
    const result = await shareUrl(
      { title: `${beach.name} — Is the Beach Open`, text: `Today's status for ${beach.name} (${beach.waterBody})`, url },
      nav ?? (navigator as ShareNavigator),
    )
    setOutcome(result)
    setFailedUrl(result === 'failed' ? url : null)
    onOutcome?.(result, url)
    if (timer.current) window.clearTimeout(timer.current)
    if (result !== 'failed') timer.current = window.setTimeout(() => setOutcome(null), 2000)
  }

  return (
    <div className={cn('flex flex-1 flex-col gap-1.5', className)}>
      <Button type="button" variant="outline" onClick={onClick} aria-live="polite" data-outcome={outcome ?? undefined}>
        <Share2Icon data-icon="inline-start" />
        {outcome ? FEEDBACK[outcome] : 'Share'}
      </Button>
      {failedUrl ? (
        <input
          readOnly
          value={failedUrl}
          aria-label="Link to this beach"
          onFocus={(e) => e.currentTarget.select()}
          className="h-8 w-full rounded-lg border border-neutral-200 px-2 text-xs text-neutral-700"
        />
      ) : null}
    </div>
  )
}

export interface BeachActionsProps {
  beach: Beach
  platform?: Platform
  getUrl?: () => string
  nav?: ShareNavigator
  onShare?: (outcome: ShareOutcome, url: string) => void
  className?: string
}

/** The two buttons at the bottom of the detail sheet (docs/mockup-beach-detail.html:100). */
export function BeachActions({ beach, platform, getUrl, nav, onShare, className }: BeachActionsProps) {
  return (
    <div data-slot="beach-actions" className={cn('flex items-start gap-2', className)}>
      <DirectionsButton beach={beach} platform={platform} />
      <ShareButton beach={beach} getUrl={getUrl} nav={nav} onOutcome={onShare} />
    </div>
  )
}
