'use client'

import { MapPinOff, RotateCw } from 'lucide-react'

export interface MapUnavailableProps {
  /** What MapLibre reported. Shown verbatim-ish so a bug report can quote it. */
  message: string
  onRetry: () => void
}

/**
 * A dead map is a failure of this page, not a fact about any beach. It says so in
 * those words: nothing here is allowed to read as "status unknown", because the
 * directory beside it still has every beach and every official link.
 */
export function MapUnavailable({ message, onRetry }: MapUnavailableProps) {
  return (
    <div className="beach-shell-map-failed" role="alert">
      <MapPinOff size={30} strokeWidth={1.3} aria-hidden="true" />
      <h2>The map could not load</h2>
      <p>
        You can still use the beach list to check statuses and find official updates. The map problem doesn&apos;t affect those listings.
      </p>
      <p className="beach-shell-map-failed-detail">{message}</p>
      <button type="button" onClick={onRetry}>
        <RotateCw size={15} aria-hidden="true" /> Try the map again
      </button>
    </div>
  )
}
