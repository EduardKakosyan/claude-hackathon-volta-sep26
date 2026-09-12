import { BeachApp } from '@/components/beach-app'
import { getStore } from '@/lib/db/client'
import { loadPage } from '@/lib/db/queries'

// Status is read per request so a user never sees anything older than the last refresh.
export const dynamic = 'force-dynamic'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/** Reads `?day` and `?beach`, calls one loader, renders one client component. */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const data = await loadPage({ params, store: getStore() })
  return <BeachApp {...data} />
}
