'use client'

import { useCallback, useEffect, useReducer, useRef } from 'react'

import {
  GEOLOCATION_OPTIONS,
  GeolocationError,
  INITIAL_GEOLOCATION_STATE,
  geolocationReducer,
  requestPosition,
  type GeolocationProvider,
  type GeolocationState,
} from '@/lib/geolocation'

export interface UseGeolocationOptions {
  /**
   * Injected for tests and the harness. `undefined` means "use navigator.geolocation";
   * `null` means "there is no provider" (status becomes `unavailable` on request).
   */
  provider?: GeolocationProvider | null
  positionOptions?: PositionOptions
}

export interface UseGeolocationResult extends GeolocationState {
  /** Opt-in. Nothing is requested until this is called; a call while requesting is ignored. */
  request: () => void
  reset: () => void
}

function defaultProvider(): GeolocationProvider | null {
  if (typeof navigator === 'undefined') return null
  return navigator.geolocation ?? null
}

export function useGeolocation({
  provider,
  positionOptions = GEOLOCATION_OPTIONS,
}: UseGeolocationOptions = {}): UseGeolocationResult {
  const [state, dispatch] = useReducer(geolocationReducer, INITIAL_GEOLOCATION_STATE)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const request = useCallback(() => {
    if (state.status === 'requesting') return
    const p = provider === undefined ? defaultProvider() : provider
    dispatch({ type: 'request' })
    requestPosition(p, positionOptions).then(
      (position) => {
        if (mounted.current) dispatch({ type: 'granted', position })
      },
      (error: unknown) => {
        if (!mounted.current) return
        const kind = error instanceof GeolocationError ? error.kind : 'unavailable'
        dispatch({ type: 'failed', kind })
      },
    )
  }, [provider, positionOptions, state.status])

  const reset = useCallback(() => dispatch({ type: 'reset' }), [])

  return { ...state, request, reset }
}
