import { describe, expect, it, vi } from 'vitest'

import { BROWSER_USER_AGENT, fetchText } from './http'

function textResponse(status: number, body: string): Response {
  return new Response(body, { status })
}

describe('fetchText', () => {
  it('sends the browser user-agent header', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      expect(headers.get('user-agent')).toBe(BROWSER_USER_AGENT)
      return textResponse(200, 'ok')
    })

    const body = await fetchText('https://example.com', { fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(body).toBe('ok')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('throws SourceFetchError with status on a 403 and does not retry', async () => {
    const fetchImpl = vi.fn(async () => textResponse(403, 'forbidden'))

    await expect(
      fetchText('https://example.com', { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toMatchObject({ name: 'SourceFetchError', status: 403 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('retries once on a 503 then returns the body on 200', async () => {
    let call = 0
    const fetchImpl = vi.fn(async () => {
      call += 1
      if (call === 1) return textResponse(503, 'unavailable')
      return textResponse(200, 'the body')
    })

    const body = await fetchText('https://example.com', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(body).toBe('the body')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('throws with status null after retrying a network failure', async () => {
    const abortError = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
    const fetchImpl = vi.fn(async () => {
      throw abortError
    })

    await expect(
      fetchText('https://example.com', { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toMatchObject({ name: 'SourceFetchError', status: null })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('returns the body verbatim', async () => {
    const fetchImpl = vi.fn(async () => textResponse(200, 'Line one\nLine two'))
    const body = await fetchText('https://example.com', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(body).toBe('Line one\nLine two')
  })
})
