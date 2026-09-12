import type { BeachState } from '@/lib/seed/beaches'
import { cn } from '@/lib/utils'

const CHIPS: { state: BeachState; label: string; dot: string }[] = [
  { state: 'open', label: 'Open', dot: 'bg-status-open' },
  { state: 'advisory', label: 'Advisory', dot: 'bg-status-advisory' },
  { state: 'closed', label: 'Closed', dot: 'bg-status-closed' },
  { state: 'offseason', label: 'Off-season', dot: 'bg-status-offseason' },
]

/** One legend for the whole map: four words, plus what a ring means. */
export function Legend({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'pointer-events-none rounded-xl bg-white/92 px-3 py-2.5 text-neutral-900 shadow-lg backdrop-blur-sm',
        className,
      )}
    >
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {CHIPS.map((chip) => (
          <li key={chip.state} className="flex items-center gap-1.5 text-xs">
            <span className={cn('size-2.5 rounded-full', chip.dot)} />
            {chip.label}
          </li>
        ))}
      </ul>
      <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-neutral-500">
        <span className="mt-0.5 size-2.5 shrink-0 rounded-full border-2 border-status-open bg-white" />
        <span>
          A ring is a provincial beach: no advisory posted, not tested today.
        </span>
      </p>
    </div>
  )
}
