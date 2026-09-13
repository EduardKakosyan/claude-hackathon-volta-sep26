'use client'

import { Bell, BellOff, BellRing } from 'lucide-react'
import { useId, useState } from 'react'

import type { FollowState } from '@/hooks/use-follow'

export interface FollowBellProps {
  beachName: string
  state: FollowState
  busy?: boolean
  /** The last attempt's failure, shown under the bell until the next tap. */
  error?: string | null
  onToggle: () => void
}

/** What a tap can only explain, not do. */
export const FOLLOW_HINT: Record<Exclude<FollowState, 'off' | 'on'>, string> = {
  'needs-install':
    'On iPhone, notifications need this app on your Home Screen. Tap Share, then Add to Home Screen, open it from there, and tap the bell again.',
  blocked: 'Notifications are blocked for this site. Allow them in your browser settings, then tap the bell again.',
  unsupported: 'This browser cannot receive notifications.',
}

export const FOLLOW_ERROR_HINT = 'Could not follow this beach just now. Tap the bell to try again.'

const LABEL: Record<FollowState, string> = {
  off: 'Follow',
  on: 'Following',
  blocked: 'Follow',
  'needs-install': 'Follow',
  unsupported: 'Follow',
}

const TITLE: Record<FollowState, string> = {
  off: 'Get one notification when this beach changes status',
  on: 'Following: one notification when this beach changes status. Tap to stop.',
  blocked: FOLLOW_HINT.blocked,
  'needs-install': 'Add to Home Screen first',
  unsupported: FOLLOW_HINT.unsupported,
}

/**
 * The bell beside the beach name. Off and on toggle the follow; the three
 * states a tap cannot change open a one-line hint under the heading instead
 * — on iPhone, the two steps to install the app first. Blocked is only ever
 * reached by a tap (the prompt was refused), so its hint shows at once.
 * `aria-pressed` and `data-state` carry the state for the rig; the label is
 * the visible text.
 */
export function FollowBell({ beachName, state, busy = false, error = null, onToggle }: FollowBellProps) {
  const [hintOpen, setHintOpen] = useState(false)
  const hintId = useId()
  const explains = state !== 'off' && state !== 'on'
  const hint = explains && (hintOpen || state === 'blocked') ? FOLLOW_HINT[state] : error ? FOLLOW_ERROR_HINT : null
  const Icon = state === 'on' ? BellRing : state === 'blocked' || state === 'unsupported' ? BellOff : Bell

  function onClick() {
    if (explains) setHintOpen((open) => !open)
    else onToggle()
  }

  return (
    <div className="beach-detail-follow" data-state={state}>
      <button
        type="button"
        className="beach-detail-follow-bell"
        aria-pressed={state === 'on'}
        aria-busy={busy}
        aria-describedby={hint ? hintId : undefined}
        title={`${TITLE[state]} — ${beachName}`}
        disabled={busy}
        onClick={onClick}
      >
        <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
        {LABEL[state]}
      </button>
      {hint ? (
        <p className="beach-detail-follow-hint" id={hintId} role="status">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
