import { cva } from 'class-variance-authority'

import { STATUS_LABEL, type PinState } from '@/components/status-pin'
import { cn } from '@/lib/utils'

const chip = cva(
  'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4',
  {
    variants: {
      state: {
        open: 'bg-status-open/15 text-status-open',
        advisory: 'bg-status-advisory/20 text-amber-700',
        closed: 'bg-status-closed/15 text-status-closed',
        offseason: 'bg-status-offseason/25 text-neutral-600',
        unknown: 'border border-dashed border-status-unknown text-neutral-500',
      },
    },
    defaultVariants: { state: 'unknown' },
  },
)

/** The one status word, as a chip. Shared by rows, the detail header, and the banner. */
export function StatusChip({ state, className }: { state: PinState; className?: string }) {
  return (
    <span data-slot="status-chip" data-state={state} className={cn(chip({ state }), className)}>
      {STATUS_LABEL[state]}
    </span>
  )
}
