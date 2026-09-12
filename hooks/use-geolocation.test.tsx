// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { GeolocationProvider } from '@/lib/geolocation'
import { useGeolocation } from './use-geolocation'

const granted: GeolocationProvider = {
  getCurrentPosition: (ok) => ok({ coords: { latitude: 44.6714, longitude: -63.5772, accuracy: 20 } }),
}
const denied: GeolocationProvider = {
  getCurrentPosition: (_ok, err) => err?.({ code: 1, message: 'User denied Geolocation' }),
}

describe('useGeolocation', () => {
  it('starts idle and does not touch the provider until asked', () => {
    const getCurrentPosition = vi.fn()
    const { result } = renderHook(() => useGeolocation({ provider: { getCurrentPosition } }))
    expect(result.current.status).toBe('idle')
    expect(result.current.position).toBeNull()
    expect(getCurrentPosition).not.toHaveBeenCalled()
  })

  it('moves to granted with a position', async () => {
    const { result } = renderHook(() => useGeolocation({ provider: granted }))
    act(() => result.current.request())
    await waitFor(() => expect(result.current.status).toBe('granted'))
    expect(result.current.position).toEqual({ lat: 44.6714, lon: -63.5772 })
    expect(result.current.accuracyM).toBe(20)
  })

  it('moves to denied when the user declines', async () => {
    const { result } = renderHook(() => useGeolocation({ provider: denied }))
    act(() => result.current.request())
    await waitFor(() => expect(result.current.status).toBe('denied'))
    expect(result.current.position).toBeNull()
  })

  it('is unavailable with no provider at all', async () => {
    const { result } = renderHook(() => useGeolocation({ provider: null }))
    act(() => result.current.request())
    await waitFor(() => expect(result.current.status).toBe('unavailable'))
  })

  it('ignores a second request while one is in flight', () => {
    const getCurrentPosition = vi.fn() // never answers
    const { result } = renderHook(() => useGeolocation({ provider: { getCurrentPosition } }))
    act(() => result.current.request())
    act(() => result.current.request())
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('requesting')
  })

  it('does not dispatch after unmount', async () => {
    let answer: (() => void) | undefined
    const slow: GeolocationProvider = {
      getCurrentPosition: (ok) => {
        answer = () => ok({ coords: { latitude: 1, longitude: 2, accuracy: 3 } })
      },
    }
    const { result, unmount } = renderHook(() => useGeolocation({ provider: slow }))
    act(() => result.current.request())
    unmount()
    expect(() => act(() => answer?.())).not.toThrow()
  })

  it('resets to idle', async () => {
    const { result } = renderHook(() => useGeolocation({ provider: denied }))
    act(() => result.current.request())
    await waitFor(() => expect(result.current.status).toBe('denied'))
    act(() => result.current.reset())
    expect(result.current.status).toBe('idle')
  })
})
