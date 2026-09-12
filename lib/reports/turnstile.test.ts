import { describe, expect, it, vi } from 'vitest'
import { createTurnstileVerifier, TURNSTILE_VERIFY_URL } from './turnstile'

type FetchArgs = Parameters<typeof fetch>

function jsonResponse(body: unknown, init?: { ok?: boolean }): Response {
  return {
    ok: init?.ok ?? true,
    json: async () => body,
  } as unknown as Response
}

function scriptedFetch(body: unknown, init?: { ok?: boolean }) {
  const calls: FetchArgs[] = []
  const fn = vi.fn(async (...args: FetchArgs) => {
    calls.push(args)
    return jsonResponse(body, init)
  })
  return { fn, calls }
}

describe('createTurnstileVerifier', () => {
  it('POSTs JSON with secret, response and remoteip', async () => {
    const { fn, calls } = scriptedFetch({ success: true, action: 'report-sign' })
    const verifier = createTurnstileVerifier({ secretKey: 'my-secret', fetch: fn })

    await verifier.verify({ token: 'tok-123', remoteIp: '203.0.113.9' })

    expect(calls).toHaveLength(1)
    const [url, requestInit] = calls[0]
    expect(url).toBe(TURNSTILE_VERIFY_URL)
    expect(requestInit?.method).toBe('POST')
    const parsedBody = JSON.parse(requestInit?.body as string)
    expect(parsedBody).toEqual({ secret: 'my-secret', response: 'tok-123', remoteip: '203.0.113.9' })
  })

  it('omits remoteip entirely when the client IP is null', async () => {
    const { fn, calls } = scriptedFetch({ success: true, action: 'report-sign' })
    const verifier = createTurnstileVerifier({ secretKey: 'my-secret', fetch: fn })

    await verifier.verify({ token: 'tok-123', remoteIp: null })

    const [, requestInit] = calls[0]
    const parsedBody = JSON.parse(requestInit?.body as string)
    expect(parsedBody).toEqual({ secret: 'my-secret', response: 'tok-123' })
    expect('remoteip' in parsedBody).toBe(false)
  })

  it('includes idempotency_key when provided', async () => {
    const { fn, calls } = scriptedFetch({ success: true, action: 'report-sign' })
    const verifier = createTurnstileVerifier({ secretKey: 'my-secret', fetch: fn })

    await verifier.verify({ token: 'tok-123', remoteIp: null, idempotencyKey: 'abc-123' })

    const [, requestInit] = calls[0]
    const parsedBody = JSON.parse(requestInit?.body as string)
    expect(parsedBody.idempotency_key).toBe('abc-123')
  })

  it('returns success on a passing verdict', async () => {
    const { fn } = scriptedFetch({
      success: true,
      action: 'report-sign',
      hostname: 'example.com',
      challenge_ts: '2026-01-01T00:00:00.000Z',
    })
    const verifier = createTurnstileVerifier({ secretKey: 'my-secret', fetch: fn })

    const verdict = await verifier.verify({ token: 'tok-123', remoteIp: '203.0.113.9' })

    expect(verdict).toEqual({
      success: true,
      hostname: 'example.com',
      action: 'report-sign',
      challengeTs: '2026-01-01T00:00:00.000Z',
    })
  })

  it('passes through Cloudflare error-codes verbatim', async () => {
    const { fn } = scriptedFetch({ success: false, 'error-codes': ['timeout-or-duplicate'] })
    const verifier = createTurnstileVerifier({ secretKey: 'my-secret', fetch: fn })

    const verdict = await verifier.verify({ token: 'tok-123', remoteIp: null })

    expect(verdict).toEqual({ success: false, errorCodes: ['timeout-or-duplicate'] })
  })

  it('defaults to an unknown error code when Cloudflare omits error-codes', async () => {
    const { fn } = scriptedFetch({ success: false })
    const verifier = createTurnstileVerifier({ secretKey: 'my-secret', fetch: fn })

    const verdict = await verifier.verify({ token: 'tok-123', remoteIp: null })

    expect(verdict).toEqual({ success: false, errorCodes: ['unknown'] })
  })

  it('rejects when the action does not match the expected action', async () => {
    const { fn } = scriptedFetch({ success: true, action: 'some-other-action' })
    const verifier = createTurnstileVerifier({ secretKey: 'my-secret', fetch: fn })

    const verdict = await verifier.verify({ token: 'tok-123', remoteIp: null })

    expect(verdict).toEqual({ success: false, errorCodes: ['action-mismatch'] })
  })

  it('reports a network error when fetch throws', async () => {
    const fn = vi.fn(async () => {
      throw new Error('boom')
    })
    const verifier = createTurnstileVerifier({ secretKey: 'my-secret', fetch: fn })

    const verdict = await verifier.verify({ token: 'tok-123', remoteIp: null })

    expect(verdict).toEqual({ success: false, errorCodes: ['network-error'] })
  })

  it('aborts a fetch that never resolves and reports a network error', async () => {
    const fn = vi.fn((..._args: FetchArgs) => {
      const [, requestInit] = _args
      return new Promise<Response>((_resolve, reject) => {
        const signal = requestInit?.signal
        signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    })
    const verifier = createTurnstileVerifier({ secretKey: 'my-secret', fetch: fn, timeoutMs: 10 })

    const verdict = await verifier.verify({ token: 'tok-123', remoteIp: null })

    expect(verdict).toEqual({ success: false, errorCodes: ['network-error'] })
  })

  it('accepts a hostname present in the allowlist', async () => {
    const { fn } = scriptedFetch({ success: true, action: 'report-sign', hostname: 'is-the-beach-open.example' })
    const verifier = createTurnstileVerifier({
      secretKey: 'my-secret',
      fetch: fn,
      allowedHostnames: ['is-the-beach-open.example'],
    })

    const verdict = await verifier.verify({ token: 'tok-123', remoteIp: null })

    expect(verdict).toEqual({
      success: true,
      hostname: 'is-the-beach-open.example',
      action: 'report-sign',
      challengeTs: undefined,
    })
  })

  it('rejects a hostname absent from the allowlist', async () => {
    const { fn } = scriptedFetch({ success: true, action: 'report-sign', hostname: 'evil.example' })
    const verifier = createTurnstileVerifier({
      secretKey: 'my-secret',
      fetch: fn,
      allowedHostnames: ['is-the-beach-open.example'],
    })

    const verdict = await verifier.verify({ token: 'tok-123', remoteIp: null })

    expect(verdict).toEqual({ success: false, errorCodes: ['hostname-mismatch'] })
  })

  it('skips the hostname check entirely when allowedHostnames is omitted', async () => {
    const { fn } = scriptedFetch({ success: true, action: 'report-sign', hostname: 'localhost' })
    const verifier = createTurnstileVerifier({ secretKey: 'my-secret', fetch: fn })

    const verdict = await verifier.verify({ token: 'tok-123', remoteIp: null })

    expect(verdict.success).toBe(true)
  })
})
