'use client'

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'

import {
  GEOLOCATION_OPTIONS,
  GeolocationError,
  INITIAL_GEOLOCATION_STATE,
  geolocationReducer,
  requestPosition,
  type GeolocationProvider,
  type GeolocationState,
} from '@/lib/geolocation'

/** How long the page waits for the on-load position before it stops moving the map for it. */
export const LATE_ARRIVAL_MS = 10_000

export interface UseGeolocationOptions {
  /**
   * Injected for tests and the harness. `undefined` means "use navigator.geolocation";
   * `null` means "there is no provider" (status becomes `unavailable` on request).
   */
  provider?: GeolocationProvider | null
  positionOptions?: PositionOptions
  /** Ask the moment the hook mounts, so the list is sorted from the user in the first second. */
  auto?: boolean
  /**
   * A position for the automatic request that lands later than this is a late
   * arrival: the browser's own timeout does not count the time a person takes to
   * answer the permission alert, so a slow "Allow" can arrive well after the map
   * has been panned somewhere else. Distances still update; the camera stays put.
   */
  timeoutMs?: number
}

export interface UseGeolocationResult extends GeolocationState {
  /** Ask (again). A call while a request is in flight is ignored. */
  request: () => void
  reset: () => void
  /** True once the automatic request's position arrived after `timeoutMs`. Never set by a manual request. */
  lateArrival: boolean
}

function defaultProvider(): GeolocationProvider | null {
  if (typeof navigator === 'undefined') return null
  return navigator.geolocation ?? null
}

export function useGeolocation({
  provider,
  positionOptions = GEOLOCATION_OPTIONS,
  auto = false,
  timeoutMs = LATE_ARRIVAL_MS,
}: UseGeolocationOptions = {}): UseGeolocationResult {
  const [state, dispatch] = useReducer(geolocationReducer, INITIAL_GEOLOCATION_STATE)
  const [lateArrival, setLateArrival] = useState(false)
  const mounted = useRef(true)
  /** The in-flight guard lives in a ref so an early `request()` (an effect) never reads a stale status. */
  const inFlight = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const ask = useCallback(
    (automatic: boolean) => {
      if (inFlight.current) return
      inFlight.current = true
      const p = provider === undefined ? defaultProvider() : provider
      const startedAt = Date.now()
      dispatch({ type: 'request' })
      requestPosition(p, positionOptions).then(
        (position) => {
          inFlight.current = false
          if (!mounted.current) return
          if (automatic && Date.now() - startedAt > timeoutMs) setLateArrival(true)
          dispatch({ type: 'granted', position })
        },
        (error: unknown) => {
          inFlight.current = false
          if (!mounted.current) return
          const kind = error instanceof GeolocationError ? error.kind : 'unavailable'
          dispatch({ type: 'failed', kind })
        },
      )
    },
    [provider, positionOptions, timeoutMs],
  )

  const request = useCallback(() => ask(false), [ask])

  // The automatic request happens once, on mount; `ask` is read through a ref
  // (kept current by the effect before it) so a new provider or options object
  // later never re-asks on its own.
  const askRef = useRef(ask)
  useEffect(() => {
    askRef.current = ask
  }, [ask])
  useEffect(() => {
    if (auto) askRef.current(true)
  }, [auto])

  const reset = useCallback(() => {
    setLateArrival(false)
    dispatch({ type: 'reset' })
  }, [])

  return { ...state, lateArrival, request, reset }
}
