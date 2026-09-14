'use client'

import { Navigation, Share2 } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

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

/**
 * Directions and Share: the two things a person standing in Halifax does next
 * once the status has answered "is it open?". They sit above the fold of the
 * detail on every layout and are styled on the shell's tokens
 * (`.beach-detail-action` in beach-shell.css), never on a component library.
 */

export interface DirectionsButtonProps {
  beach: Pick<Beach, 'lat' | 'lon' | 'name'>
  /** Detected from the user agent after mount when omitted; SSR renders the universal Google Maps link. */
  platform?: Platform
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

/** Opens the phone's maps app on the beach: Apple Maps, `geo:` on Android, Google Maps elsewhere. */
export function DirectionsButton({ beach, platform }: DirectionsButtonProps) {
  const detected = useDetectedPlatform()
  const resolved = platform ?? detected
  return (
    <a
      className="beach-detail-action"
      data-variant="primary"
      data-platform={resolved}
      href={directionsUrl(beach, resolved)}
      target="_blank"
      rel="noopener noreferrer"
    >
      <Navigation size={16} strokeWidth={1.8} aria-hidden="true" />
      Directions
    </a>
  )
}

export interface ShareButtonProps {
  beach: Pick<Beach, 'id' | 'name' | 'waterBody'>
  /** Defaults to the current page URL with `beach` set — so `day` and anything else survive. */
  getUrl?: () => string
  /** Defaults to `navigator`. */
  nav?: ShareNavigator
  onOutcome?: (outcome: ShareOutcome, url: string) => void
}

/** What the button reads after a tap. Success and a dismissed sheet both settle back to "Share". */
const FEEDBACK: Record<ShareOutcome, string> = {
  shared: 'Shared',
  copied: 'Link copied',
  cancelled: 'Share',
  failed: 'Copy the link below',
}

/** How long a success message stays before the button reads "Share" again. */
const FEEDBACK_MS = 2000

/**
 * The system share sheet where there is one, the clipboard where there is not,
 * and the bare URL in a field when neither works, so the link can always be
 * handed on.
 */
export function ShareButton({ beach, getUrl, nav, onOutcome }: ShareButtonProps) {
  const [outcome, setOutcome] = useState<ShareOutcome | null>(null)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const timer = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current)
    },
    [],
  )

  async function onClick() {
    const url = getUrl ? getUrl() : buildBeachUrl(window.location.href, beach.id)
    const result = await shareUrl(
      {
        title: `${beach.name} — Is the Beach Open`,
        text: `Check the status of ${beach.name} (${beach.waterBody})`,
        url,
      },
      nav ?? (navigator as ShareNavigator),
    )
    setOutcome(result)
    setFailedUrl(result === 'failed' ? url : null)
    onOutcome?.(result, url)
    if (timer.current) window.clearTimeout(timer.current)
    if (result !== 'failed') timer.current = window.setTimeout(() => setOutcome(null), FEEDBACK_MS)
  }

  return (
    <div className="beach-detail-share">
      <button
        type="button"
        className="beach-detail-action"
        data-variant="secondary"
        data-outcome={outcome ?? undefined}
        aria-live="polite"
        onClick={onClick}
      >
        <Share2 size={16} strokeWidth={1.8} aria-hidden="true" />
        {outcome ? FEEDBACK[outcome] : 'Share'}
      </button>
      {failedUrl ? (
        <input
          readOnly
          className="beach-detail-share-url"
          value={failedUrl}
          aria-label="Link to this beach"
          onFocus={(event) => event.currentTarget.select()}
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
}

/** Directions on the left, Share on the right, each half the width. */
export function BeachActions({ beach, platform, getUrl, nav, onShare }: BeachActionsProps) {
  return (
    <div className="beach-detail-actions" data-slot="beach-actions">
      <DirectionsButton beach={beach} platform={platform} />
      <ShareButton beach={beach} getUrl={getUrl} nav={nav} onOutcome={onShare} />
    </div>
  )
}
