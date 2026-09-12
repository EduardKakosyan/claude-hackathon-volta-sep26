'use client'

import { useSyncExternalStore } from 'react'

/**
 * Hook that subscribes to the `prefers-reduced-motion` media query.
 * SSR-safe: initial value is `false`.
 *
 * Used to disable camera animations and pin transitions when motion is discouraged.
 */
export function useReducedMotion(): boolean {
  // Selector that reads the current media query state
  const getSnapshot = () => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  // Server snapshot is always false (no motion preference on server)
  const getServerSnapshot = () => false

  // Subscribe to media query changes
  const subscribe = (listener: () => void) => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    mediaQuery.addEventListener('change', listener)
    return () => mediaQuery.removeEventListener('change', listener)
  }

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
