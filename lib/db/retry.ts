/**
 * Three tries for every PostgREST call. Supabase's API gateway was seen
 * answering 504 within the first second of the hour (2026-09-13, 22:00:12 and
 * 23:00:13 UTC, one call each time) while every call outside that second was
 * fine; one failed call there cost the whole hourly refresh. Every write the
 * store makes is an upsert on a natural key, so a repeat is harmless.
 */
export const RETRY_DELAYS_MS: readonly number[] = [1500, 3000]

export interface QueryError {
  message: string
}

export interface QueryResult<T> {
  data: T | null
  error: QueryError | null
}

export interface RetryOptions {
  delaysMs?: readonly number[]
  sleep?: (ms: number) => Promise<void>
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Runs `query` until it answers without an error, sleeping the given delays
 * between tries; the last error is thrown as `supabase <op>: <message>`.
 * `query` must build a fresh request each call: a supabase-js builder is a
 * thenable that runs when awaited, so a new one is needed per attempt.
 */
export async function withRetry<T>(
  op: string,
  query: () => PromiseLike<QueryResult<T>>,
  { delaysMs = RETRY_DELAYS_MS, sleep = wait }: RetryOptions = {},
): Promise<T | null> {
  let last: QueryError = { message: 'unknown error' }
  for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
    if (attempt > 0) await sleep(delaysMs[attempt - 1])
    try {
      const { data, error } = await query()
      if (!error) return data
      last = error
    } catch (err) {
      last = { message: err instanceof Error ? err.message : String(err) }
    }
  }
  throw new Error(`supabase ${op}: ${last.message}`)
}
