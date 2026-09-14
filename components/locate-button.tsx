'use client'

import { LoaderCircle, LocateFixed, Locate, LocateOff } from 'lucide-react'

import type { GeolocationStatus } from '@/lib/geolocation'

export interface LocateButtonProps {
  status: GeolocationStatus
  onRequest: () => void
}

const COPY: Record<GeolocationStatus, { label: string; title: string }> = {
  idle: { label: 'Use my location', title: 'Find beaches near you' },
  requesting: { label: 'Finding your location…', title: 'Finding your location…' },
  granted: { label: 'Centre on my location', title: 'Move the map back to your location' },
  denied: {
    label: 'Location declined',
    title: 'Location access is off, so distances are from downtown Halifax. Turn it on for this site in your browser settings to see distances from you.',
  },
  unavailable: {
    label: 'Location unavailable',
    title: "Couldn't get your location — distances are from downtown Halifax. Press to try again.",
  },
}

const ICON: Record<GeolocationStatus, typeof Locate> = {
  idle: Locate,
  requesting: LoaderCircle,
  granted: LocateFixed,
  denied: LocateOff,
  unavailable: LocateOff,
}

/**
 * Floats on the map above the sheet edge (`.beach-shell-locate`). The page asks
 * for location on load; this button asks again, and once a position is known it
 * brings the camera back to it after a pan. Denied is disabled because the
 * browser will not re-prompt; unavailable (timeout, no fix) stays pressable.
 */
export function LocateButton({ status, onRequest }: LocateButtonProps) {
  const Icon = ICON[status]
  const { label, title } = COPY[status]
  return (
    <button
      type="button"
      className="beach-shell-locate"
      aria-label={label}
      aria-pressed={status === 'granted'}
      aria-busy={status === 'requesting'}
      title={title}
      disabled={status === 'denied' || status === 'requesting'}
      data-status={status}
      onClick={onRequest}
    >
      <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
    </button>
  )
}
