import { cva } from 'class-variance-authority'

import { STATUS_LABEL, type PinState } from '@/components/status-pin'
import { cn } from '@/lib/utils'

/** Colours from docs/mockup-main-screen.html:40, as Tailwind palette steps. */
const chipVariants = cva(
  'inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-semibold whitespace-nowrap',
  {
    variants: {
      state: {
        open: 'bg-green-100 text-green-800',
        advisory: 'bg-amber-100 text-amber-800',
        closed: 'bg-red-100 text-red-800',
        offseason: 'bg-neutral-100 text-neutral-600',
        unknown: 'border border-dashed border-neutral-300 bg-neutral-50 text-neutral-500',
      },
    },
    defaultVariants: { state: 'unknown' },
  },
)

export function DiscoveryStatusChip({ state, className }: { state: PinState; className?: string }) {
  return (
    <span data-slot="discovery-status-chip" data-state={state} className={cn(chipVariants({ state }), className)}>
      {STATUS_LABEL[state]}
    </span>
  )
}
