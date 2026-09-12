import { describe, expect, it, vi } from 'vitest'

import {
  GeolocationError,
  INITIAL_GEOLOCATION_STATE,
  classifyGeolocationError,
  geolocationReducer,
  requestPosition,
  type GeolocationProvider,
} from './geolocation'

const granted: GeolocationProvider = {
  getCurrentPosition: (ok) => ok({ coords: { latitude: 44.6714, longitude: -63.5772, accuracy: 35 } }),
}
const failing = (code: number): GeolocationProvider => ({
  getCurrentPosition: (_ok, err) => err?.({ code, message: `code ${code}` }),
})

describe('classifyGeolocationError', () => {
  it('maps PERMISSION_DENIED to denied and the rest to unavailable', () => {
    expect(classifyGeolocationError(1)).toBe('denied')
    expect(classifyGeolocationError(2)).toBe('unavailable')
    expect(classifyGeolocationError(3)).toBe('unavailable')
    expect(classifyGeolocationError(99)).toBe('unavailable')
  })
})

describe('requestPosition', () => {
  it('resolves lat/lon/accuracy', async () => {
    await expect(requestPosition(granted)).resolves.toEqual({ lat: 44.6714, lon: -63.5772, accuracyM: 35 })
  })
  it('rejects a denial with kind "denied"', async () => {
    await expect(requestPosition(failing(1))).rejects.toMatchObject({ kind: 'denied' })
  })
  it('rejects a timeout with kind "unavailable"', async () => {
    await expect(requestPosition(failing(3))).rejects.toMatchObject({ kind: 'unavailable' })
  })
  it('rejects, not throws, when there is no provider', async () => {
    const promise = requestPosition(null)
    await expect(promise).rejects.toBeInstanceOf(GeolocationError)
    await expect(promise).rejects.toMatchObject({ kind: 'unavailable' })
  })
  it('passes the options through', () => {
    const getCurrentPosition = vi.fn()
    void requestPosition({ getCurrentPosition }, { timeout: 5 })
    expect(getCurrentPosition.mock.calls[0][2]).toEqual({ timeout: 5 })
  })
})

describe('geolocationReducer', () => {
  it('idle → requesting → granted', () => {
    const requesting = geolocationReducer(INITIAL_GEOLOCATION_STATE, { type: 'request' })
    expect(requesting.status).toBe('requesting')
    const done = geolocationReducer(requesting, {
      type: 'granted',
      position: { lat: 1, lon: 2, accuracyM: 3 },
    })
    expect(done).toEqual({ status: 'granted', position: { lat: 1, lon: 2 }, accuracyM: 3 })
  })
  it('ignores a duplicate request', () => {
    const requesting = geolocationReducer(INITIAL_GEOLOCATION_STATE, { type: 'request' })
    expect(geolocationReducer(requesting, { type: 'request' })).toBe(requesting)
  })
  it('keeps the last position when a retry fails', () => {
    const had = { status: 'granted' as const, position: { lat: 1, lon: 2 }, accuracyM: 3 }
    expect(geolocationReducer(had, { type: 'failed', kind: 'unavailable' })).toEqual({ ...had, status: 'unavailable' })
  })
  it('records denial', () => {
    expect(geolocationReducer(INITIAL_GEOLOCATION_STATE, { type: 'failed', kind: 'denied' }).status).toBe('denied')
  })
  it('resets', () => {
    expect(geolocationReducer({ status: 'denied', position: null, accuracyM: null }, { type: 'reset' })).toEqual(INITIAL_GEOLOCATION_STATE)
  })
})
