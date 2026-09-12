'use client'

import { LoaderCircleIcon, LocateFixedIcon, LocateIcon, LocateOffIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { GeolocationStatus } from '@/lib/geolocation'
import { cn } from '@/lib/utils'

export interface LocateButtonProps {
  status: GeolocationStatus
  onRequest: () => void
  className?: string
}

const COPY: Record<GeolocationStatus, { label: string; title: string }> = {
  idle: { label: 'Use my location', title: 'Sort the list by distance from you' },
  requesting: { label: 'Finding your location…', title: 'Finding your location…' },
  granted: { label: 'Location on', title: 'Sorted by distance from you. Press to refresh.' },
  denied: {
    label: 'Location declined',
    title: 'Location was declined — distances are from Halifax. Allow location in your browser settings to change this.',
  },
  unavailable: {
    label: 'Location unavailable',
    title: "Couldn't get your location — distances are from Halifax. Press to try again.",
  },
}

/**
 * Opt-in only: the button asks, nothing else does. Denied is disabled because the
 * browser will not re-prompt; unavailable (timeout, no fix) stays pressable.
 */
export function LocateButton({ status, onRequest, className }: LocateButtonProps) {
  const Icon =
    status === 'requesting'
      ? LoaderCircleIcon
      : status === 'granted'
        ? LocateFixedIcon
        : status === 'denied' || status === 'unavailable'
          ? LocateOffIcon
          : LocateIcon
  const { label, title } = COPY[status]
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-lg"
      aria-label={label}
      aria-pressed={status === 'granted'}
      aria-busy={status === 'requesting'}
      title={title}
      disabled={status === 'denied' || status === 'requesting'}
      data-status={status}
      onClick={onRequest}
      className={cn('size-11 rounded-xl border-0 bg-white/92 shadow-lg backdrop-blur-sm', className)}
    >
      <Icon className={cn('size-5', status === 'requesting' && 'animate-spin', status === 'granted' && 'text-blue-600')} />
    </Button>
  )
}
