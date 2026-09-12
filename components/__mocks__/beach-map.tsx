import type { Beach } from '@/lib/seed/beaches'
import type { PinState } from '@/lib/beach-status'

export interface BeachMapProps {
  beaches: Beach[]
  status: Record<string, PinState | undefined>
  selectedId: string | null
  onSelect: (id: string) => void
  onFatalError: (error: string) => void
}

/**
 * Lightweight fake BeachMap for testing. Renders a button per beach
 * and exposes the props it received.
 */
export default function FakeBeachMap({
  beaches,
  onSelect,
  onFatalError,
}: BeachMapProps) {
  return (
    <div data-testid="fake-beach-map">
      {beaches.map((beach) => (
        <button
          key={beach.id}
          data-testid={`map-button-${beach.id}`}
          onClick={() => onSelect(beach.id)}
        >
          {beach.name}
        </button>
      ))}
      <button
        data-testid="map-fail-button"
        onClick={() => onFatalError('WebGL is not available')}
      >
        Fail Map
      </button>
    </div>
  )
}
