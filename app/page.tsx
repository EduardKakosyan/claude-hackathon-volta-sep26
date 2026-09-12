import { BeachApp } from '@/components/beach-app'
import { BEACHES } from '@/lib/seed/beaches'

/**
 * Phase 1 hands the seed roster straight to the map with no status at all, so every
 * pin renders as `unknown`. Phase 2 replaces the empty record with `loadPage()`.
 */
export default function Page() {
  return <BeachApp beaches={BEACHES} status={{}} />
}
