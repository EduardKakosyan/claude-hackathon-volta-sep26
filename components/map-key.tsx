'use client'

import { ChevronDown } from 'lucide-react'

import { StatusPin } from '@/components/status-pin'
import { FILTER_LABEL } from '@/lib/beach-filter'
import { PIN_STATES, UNKNOWN_CAVEAT, type PinState } from '@/lib/beach-status'

/**
 * What each pin means. The filter wording serves for the four states a visitor
 * can act on; off-season needs a clause, because its ring is deliberately the
 * calm one and its rows lead with conditions instead of a status word.
 */
const KEY_LABEL: Record<PinState, string> = {
  ...FILTER_LABEL,
  offseason: 'Off-season: no water testing or lifeguards',
}

/**
 * One key for the whole map: all five states, plus what the hollow ring means.
 * The per-beach version of the same caveat sits next to the status in the detail
 * view, because a visitor who never opens this key still has to see it.
 */
export function MapKey() {
  return (
    <details className="beach-shell-key">
      <summary>
        Map key <ChevronDown size={15} aria-hidden="true" />
      </summary>
      <div className="beach-shell-key-content">
        <ul>
          {PIN_STATES.map((state) => (
            <li key={state}>
              <StatusPin state={state} />
              <span>{KEY_LABEL[state]}</span>
            </li>
          ))}
        </ul>
        <p className="beach-shell-key-hollow">
          <StatusPin state="open" hollow />
          <span>
            Hollow pins mark provincial beaches. No advisory posted doesn&apos;t mean the water has passed a test.
          </span>
        </p>
        <p>No status available means we don&apos;t have an official update yet. {UNKNOWN_CAVEAT}</p>
      </div>
    </details>
  )
}
