'use client'

import { ArrowUpRight, Navigation, X } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'

import { StatusPin } from '@/components/status-pin'
import {
  authorityName,
  isAdvisoryBasedAuthority,
  statusPresentation,
  type PinState,
} from '@/lib/beach-status'
import type { Beach } from '@/lib/seed/beaches'

import './beach-detail.css'

export interface BeachDetailProps {
  beach: Beach
  state: PinState
  onClose: () => void
}

const PROVINCIAL_ADVISORIES_URL = 'https://parks.novascotia.ca/advisories'

/**
 * Presentation only: it is handed a state and never derives one. Every sentence it
 * shows about what a status means comes from `lib/beach-status.ts`, so the pin, the
 * row, the map key and this view cannot disagree.
 */
export function BeachDetail({ beach, state, onClose }: BeachDetailProps) {
  const headingId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const provincial = isAdvisoryBasedAuthority(beach.authority)
  const { label, explanation, caveat } = statusPresentation(state, beach.authority)
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${beach.lat},${beach.lon}`)}`

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
  }, [beach.id])

  return (
    <section
      className="beach-detail"
      aria-labelledby={headingId}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <header className="beach-detail__header">
        <p className="beach-detail__eyebrow">Beach field notes / {beach.region}</p>
        <button
          className="beach-detail__close"
          type="button"
          onClick={onClose}
          aria-label="Close beach details"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </header>

      <div className="beach-detail__title-block">
        <h2 id={headingId} ref={headingRef} tabIndex={-1}>
          {beach.name}
        </h2>
        <p className="beach-detail__location">{beach.waterBody}</p>
      </div>

      <div className="beach-detail__status" data-state={state}>
        <div className="beach-detail__status-heading">
          <span aria-hidden="true">
            <StatusPin state={state} hollow={provincial} />
          </span>
          <h3>{label}</h3>
        </div>
        <p>{explanation}</p>
        {caveat && <p className="beach-detail__caveat">{caveat}</p>}
      </div>

      <section className="beach-detail__section" aria-label="Official evidence">
        <p className="beach-detail__eyebrow">Know the source</p>
        <h3>{authorityName(beach.authority)}</h3>
        <p>
          Exact source wording, posting date and last-confirmed time are not available in this
          view. The link below opens the official page, not a quoted status report.
        </p>
        <a
          className="beach-detail__source"
          href={beach.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {provincial ? 'Official park page' : 'Official HRM beach status'}
          <ArrowUpRight size={16} aria-hidden="true" />
          <span className="beach-detail__sr-only"> (opens in a new tab)</span>
        </a>
        {provincial && (
          <a
            className="beach-detail__source"
            href={PROVINCIAL_ADVISORIES_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Provincial park advisories <ArrowUpRight size={16} aria-hidden="true" />
            <span className="beach-detail__sr-only"> (opens in a new tab)</span>
          </a>
        )}
      </section>

      <section className="beach-detail__section" aria-label="Beach facts">
        <p className="beach-detail__eyebrow">Plan your visit</p>
        <dl className="beach-detail__facts">
          <div>
            <dt>Water</dt>
            <dd>{beach.water === 'fresh' ? 'Freshwater' : 'Saltwater'}</dd>
          </div>
          <div>
            <dt>Region</dt>
            <dd>{beach.region}</dd>
          </div>
          <div>
            <dt>Published supervision</dt>
            <dd>{beach.supervision}</dd>
          </div>
        </dl>
        <p className="beach-detail__note">
          Schedule from the monitored-beach roster, not confirmation that a lifeguard is on duty
          now.
        </p>
      </section>

      <section className="beach-detail__section beach-detail__unavailable" aria-label="Unavailable data">
        <h3>No readings to show</h3>
        <p>
          Sample measurements and 14-day history are unavailable in this view.
          {state === 'offseason' ? ' A last in-season status is not available either.' : ''} We
          leave them out rather than estimate.
        </p>
      </section>

      <footer className="beach-detail__footer">
        <a
          className="beach-detail__directions"
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Navigation size={17} aria-hidden="true" /> Get directions
          <ArrowUpRight size={16} aria-hidden="true" />
          <span className="beach-detail__sr-only">
            {' '}
            to {beach.name} in Google Maps (opens in a new tab)
          </span>
        </a>
        <p className="beach-detail__note">
          Directions use the roster map point; it may be a park entrance rather than a swimming
          access point.
        </p>
        <p className="beach-detail__safety">
          Not an official government service. Always follow posted signs and lifeguard
          instructions.
        </p>
      </footer>
    </section>
  )
}
