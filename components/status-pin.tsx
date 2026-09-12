import { cva, type VariantProps } from 'class-variance-authority'

import { STATUS_LABEL, type PinState } from '@/lib/beach-status'
import { cn } from '@/lib/utils'

/**
 * The wording and the `unknown` state live in `lib/beach-status.ts` so pins, rows,
 * filters, the map key and the detail view can never drift apart. This module owns
 * one thing: how a state looks. A dashed grey ring keeps the map from inventing a
 * colour for a beach whose status has never been read.
 */
export { STATUS_LABEL, type PinState }

const statusPinVariants = cva(
  'block rounded-full shadow-[0_1px_6px_rgba(0,0,0,0.5)] transition-transform duration-150 ease-out motion-reduce:transition-none',
  {
    variants: {
      state: {
        open: 'bg-status-open border-status-open',
        advisory: 'bg-status-advisory border-status-advisory',
        closed: 'bg-status-closed border-status-closed',
        offseason: 'bg-status-offseason border-status-offseason',
        unknown: 'bg-status-unknown border-status-unknown',
      },
      /** Provincial beaches: "no advisory posted" is a weaker claim than "tested today". */
      hollow: {
        true: 'size-5 border-4 bg-white',
        false: 'size-[22px] border-[3px] border-white',
      },
      selected: {
        true: 'scale-125 ring-2 ring-white/80',
        false: '',
      },
    },
    compoundVariants: [
      {
        state: 'unknown',
        hollow: false,
        class: 'border-dashed border-status-unknown bg-status-unknown/60',
      },
      {
        state: 'unknown',
        hollow: true,
        class: 'border-dashed border-status-unknown bg-white',
      },
    ],
    defaultVariants: { state: 'unknown', hollow: false, selected: false },
  },
)

export interface StatusPinProps
  extends Omit<VariantProps<typeof statusPinVariants>, 'state' | 'hollow'> {
  state: PinState
  hollow?: boolean
  label?: string
  className?: string
}

export function StatusPin({
  state,
  hollow = false,
  selected = false,
  label,
  className,
}: StatusPinProps) {
  return (
    <span
      data-slot="status-pin"
      data-state={state}
      title={label ? `${label} — ${STATUS_LABEL[state]}` : STATUS_LABEL[state]}
      className={cn(statusPinVariants({ state, hollow, selected }), className)}
    />
  )
}

export { statusPinVariants }
