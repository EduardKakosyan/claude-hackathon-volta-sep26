import { SourceFetchError } from '@/lib/ingest/errors'

export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

export interface FetchTextOptions {
  timeoutMs?: number // default 15_000
  retries?: number // default 1; retried on network error, timeout, or 5xx — never on 4xx
  headers?: Record<string, string>
  fetchImpl?: typeof fetch // default globalThis.fetch
  /** Non-2xx statuses whose body is an answer, not a failure (ERDDAP says "no rows" with a 404). */
  acceptStatus?: readonly number[]
}

const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_RETRIES = 1

/** GET url with the browser UA and `cache: 'no-store'`; resolves to the body text; throws SourceFetchError. */
export async function fetchText(url: string, opts?: FetchTextOptions): Promise<string> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const retries = opts?.retries ?? DEFAULT_RETRIES
  const fetchImpl = opts?.fetchImpl ?? globalThis.fetch
  const headers = {
    'user-agent': BROWSER_USER_AGENT,
    accept: 'text/html,application/xhtml+xml,application/atom+xml,application/xml;q=0.9,*/*;q=0.8',
    ...opts?.headers,
  }

  let attempt = 0
  let lastError: SourceFetchError | null = null

  while (attempt <= retries) {
    try {
      const response = await fetchImpl(url, {
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      })

      if (!response.ok && !opts?.acceptStatus?.includes(response.status)) {
        const error = new SourceFetchError(
          url,
          response.status,
          `HTTP ${response.status} from ${url}`,
        )
        if (response.status >= 500 && attempt < retries) {
          lastError = error
          attempt += 1
          continue
        }
        throw error
      }

      return await response.text()
    } catch (err) {
      if (err instanceof SourceFetchError) throw err

      const status = null
      const message = err instanceof Error ? err.message : String(err)
      const fetchError = new SourceFetchError(url, status, message, { cause: err })

      if (attempt < retries) {
        lastError = fetchError
        attempt += 1
        continue
      }

      throw fetchError
    }
  }

  // Unreachable in practice; satisfies the type checker.
  throw lastError ?? new SourceFetchError(url, null, `failed to fetch ${url}`)
}
