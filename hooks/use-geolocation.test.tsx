// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GeolocationProvider } from '@/lib/geolocation'
import { useGeolocation } from './use-geolocation'

const granted: GeolocationProvider = {
  getCurrentPosition: (ok) => ok({ coords: { latitude: 44.6714, longitude: -63.5772, accuracy: 20 } }),
}
const denied: GeolocationProvider = {
  getCurrentPosition: (_ok, err) => err?.({ code: 1, message: 'User denied Geolocation' }),
}

/** A provider that answers only when the test says so. */
function deferred(): { provider: GeolocationProvider; answer: () => void; calls: number } {
  const state = {
    calls: 0,
    answer: () => {},
    provider: {
      getCurrentPosition: (ok: Parameters<GeolocationProvider['getCurrentPosition']>[0]) => {
        state.calls += 1
        state.answer = () => ok({ coords: { latitude: 44.64, longitude: -63.57, accuracy: 30 } })
      },
    },
  }
  return state
}

describe('useGeolocation', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

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

  describe('auto', () => {
    it('asks on mount, once, and lands granted with lateArrival false when the answer is prompt', async () => {
      const getCurrentPosition = vi.fn((ok: Parameters<GeolocationProvider['getCurrentPosition']>[0]) =>
        ok({ coords: { latitude: 44.64, longitude: -63.57, accuracy: 30 } }),
      )
      const { result, rerender } = renderHook(() => useGeolocation({ provider: { getCurrentPosition }, auto: true }))
      expect(getCurrentPosition).toHaveBeenCalledTimes(1)
      await waitFor(() => expect(result.current.status).toBe('granted'))
      expect(result.current.position).toEqual({ lat: 44.64, lon: -63.57 })
      expect(result.current.lateArrival).toBe(false)
      rerender()
      expect(getCurrentPosition).toHaveBeenCalledTimes(1)
    })

    it('does not ask on mount without auto', () => {
      const getCurrentPosition = vi.fn()
      renderHook(() => useGeolocation({ provider: { getCurrentPosition } }))
      expect(getCurrentPosition).not.toHaveBeenCalled()
    })

    it('a position that arrives after timeoutMs is granted but flagged as a late arrival', async () => {
      vi.useFakeTimers()
      const slow = deferred()
      const { result } = renderHook(() => useGeolocation({ provider: slow.provider, auto: true, timeoutMs: 10_000 }))
      expect(result.current.status).toBe('requesting')
      await act(async () => {
        vi.advanceTimersByTime(10_001)
        slow.answer()
      })
      expect(result.current.status).toBe('granted')
      expect(result.current.lateArrival).toBe(true)
    })

    it('a position that arrives just inside timeoutMs is not late', async () => {
      vi.useFakeTimers()
      const slow = deferred()
      const { result } = renderHook(() => useGeolocation({ provider: slow.provider, auto: true, timeoutMs: 10_000 }))
      await act(async () => {
        vi.advanceTimersByTime(9_000)
        slow.answer()
      })
      expect(result.current.status).toBe('granted')
      expect(result.current.lateArrival).toBe(false)
    })

    it('a manual request never sets lateArrival, however slow', async () => {
      vi.useFakeTimers()
      const slow = deferred()
      const { result } = renderHook(() => useGeolocation({ provider: slow.provider, timeoutMs: 10_000 }))
      act(() => result.current.request())
      await act(async () => {
        vi.advanceTimersByTime(60_000)
        slow.answer()
      })
      expect(result.current.status).toBe('granted')
      expect(result.current.lateArrival).toBe(false)
    })

    it('a denied automatic request leaves the status denied and the position null', async () => {
      const { result } = renderHook(() => useGeolocation({ provider: denied, auto: true }))
      await waitFor(() => expect(result.current.status).toBe('denied'))
      expect(result.current.position).toBeNull()
      expect(result.current.lateArrival).toBe(false)
    })

    it('request() after the automatic answer asks the provider again', async () => {
      const slow = deferred()
      const { result } = renderHook(() => useGeolocation({ provider: slow.provider, auto: true }))
      expect(slow.calls).toBe(1)
      act(() => slow.answer())
      await waitFor(() => expect(result.current.status).toBe('granted'))
      act(() => result.current.request())
      expect(slow.calls).toBe(2)
      expect(result.current.status).toBe('requesting')
    })
  })
})
