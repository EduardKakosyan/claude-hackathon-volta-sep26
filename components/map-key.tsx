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
  offseason: 'Off-season: not tested or supervised; rows show conditions instead',
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
            A hollow pin is a provincial beach. No advisory posted is not a confirmed clean
            sample.
          </span>
        </p>
        <p>No status available means we have not read an official status. {UNKNOWN_CAVEAT}</p>
      </div>
    </details>
  )
}
