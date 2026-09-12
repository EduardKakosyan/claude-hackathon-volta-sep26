import { cva, type VariantProps } from 'class-variance-authority'

import type { BeachState } from '@/lib/seed/beaches'
import { cn } from '@/lib/utils'

/**
 * `unknown` is render-only. The resolver never produces it; it is what a pin shows
 * before any source has been read, and what a beach whose alias has broken shows
 * afterwards. Drawing it as a dashed grey ring keeps the map from inventing a colour.
 */
export type PinState = BeachState | 'unknown'

export const STATUS_LABEL: Record<PinState, string> = {
  open: 'Open',
  advisory: 'Advisory',
  closed: 'Closed',
  offseason: 'Off-season',
  unknown: 'No status read yet',
}

const statusPinVariants = cva(
  'block rounded-full shadow-[0_1px_6px_rgba(0,0,0,0.5)] transition-transform duration-150 ease-out',
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
