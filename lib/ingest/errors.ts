export class SourceFetchError extends Error {
  constructor(
    public readonly url: string,
    public readonly status: number | null,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'SourceFetchError'
  }
}

export class SourceParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SourceParseError'
  }
}

const MAX_ERROR_LENGTH = 500

/** 'HTTP 403 from www.halifax.ca' | 'SourceParseError: no status table found' | first 500 chars of anything else */
export function describeError(err: unknown): string {
  let message: string

  if (err instanceof SourceFetchError) {
    const host = safeHostname(err.url)
    message = err.status != null ? `HTTP ${err.status} from ${host}` : `${err.name}: ${err.message}`
  } else if (err instanceof SourceParseError) {
    message = `${err.name}: ${err.message}`
  } else if (err instanceof Error) {
    message = `${err.name}: ${err.message}`
  } else {
    message = String(err)
  }

  return message.slice(0, MAX_ERROR_LENGTH)
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}
