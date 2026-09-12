import type { LatLon } from '@/lib/geo'

export type GeolocationStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable'
export type GeolocationFailure = 'denied' | 'unavailable'

/** The one method of `navigator.geolocation` the app uses, so a fake is three lines. */
export interface GeolocationProvider {
  getCurrentPosition(
    success: (position: { coords: { latitude: number; longitude: number; accuracy: number } }) => void,
    error?: (error: { code: number; message: string }) => void,
    options?: PositionOptions,
  ): void
}

/** Coarse is plenty for a distance list; 10 s so a phone in a parking lot does not spin forever. */
export const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 10_000,
  maximumAge: 60_000,
}

const PERMISSION_DENIED = 1

/** Denied is the only failure a user chose; everything else (unavailable, timeout) is "unavailable". */
export function classifyGeolocationError(code: number): GeolocationFailure {
  return code === PERMISSION_DENIED ? 'denied' : 'unavailable'
}

export class GeolocationError extends Error {
  constructor(
    readonly kind: GeolocationFailure,
    message: string = kind,
  ) {
    super(message)
    this.name = 'GeolocationError'
  }
}

export interface Position extends LatLon {
  accuracyM: number
}

/** Promise wrapper; a missing provider rejects as `unavailable` instead of throwing synchronously. */
export function requestPosition(
  provider: GeolocationProvider | null | undefined,
  options: PositionOptions = GEOLOCATION_OPTIONS,
): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (!provider) {
      reject(new GeolocationError('unavailable', 'Geolocation is not supported here'))
      return
    }
    provider.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lon: coords.longitude, accuracyM: coords.accuracy }),
      (error) => reject(new GeolocationError(classifyGeolocationError(error.code), error.message)),
      options,
    )
  })
}

export interface GeolocationState {
  status: GeolocationStatus
  position: LatLon | null
  accuracyM: number | null
}

export const INITIAL_GEOLOCATION_STATE: GeolocationState = { status: 'idle', position: null, accuracyM: null }

export type GeolocationAction =
  | { type: 'request' }
  | { type: 'granted'; position: Position }
  | { type: 'failed'; kind: GeolocationFailure }
  | { type: 'reset' }

/** Pure so the state machine is tested without React. A second `request` while requesting is a no-op. */
export function geolocationReducer(state: GeolocationState, action: GeolocationAction): GeolocationState {
  switch (action.type) {
    case 'request':
      return state.status === 'requesting' ? state : { ...state, status: 'requesting' }
    case 'granted':
      return {
        status: 'granted',
        position: { lat: action.position.lat, lon: action.position.lon },
        accuracyM: action.position.accuracyM,
      }
    case 'failed':
      // Keep a previously granted position: a timeout on a retry should not erase it.
      return { ...state, status: action.kind }
    case 'reset':
      return INITIAL_GEOLOCATION_STATE
  }
}
