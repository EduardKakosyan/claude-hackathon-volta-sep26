import type { TurnstileVerdict, TurnstileVerifier } from './types'

export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
export const TURNSTILE_ACTION = 'report-sign' // must match the widget's data-action

export interface TurnstileVerifierOptions {
  secretKey: string
  fetch?: typeof globalThis.fetch
  timeoutMs?: number // default 5000
  expectedAction?: string // default TURNSTILE_ACTION; verdict.action must equal it when present
  /** Cloudflare's integration guidance: verify the response hostname against the deployment's own. */
  allowedHostnames?: readonly string[]
}

interface TurnstileSiteverifyResponse {
  success: boolean
  challenge_ts?: string
  hostname?: string
  action?: string
  cdata?: string
  'error-codes'?: string[]
}

export function createTurnstileVerifier(opts: TurnstileVerifierOptions): TurnstileVerifier {
  const doFetch = opts.fetch ?? globalThis.fetch
  const timeoutMs = opts.timeoutMs ?? 5000
  const expectedAction = opts.expectedAction ?? TURNSTILE_ACTION

  return {
    async verify(input): Promise<TurnstileVerdict> {
      const body: Record<string, string> = {
        secret: opts.secretKey,
        response: input.token,
      }
      if (input.remoteIp !== null && input.remoteIp !== undefined) {
        body.remoteip = input.remoteIp
      }
      if (input.idempotencyKey) {
        body.idempotency_key = input.idempotencyKey
      }

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)

      let response: Response
      try {
        response = await doFetch(TURNSTILE_VERIFY_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        })
      } catch {
        return { success: false, errorCodes: ['network-error'] }
      } finally {
        clearTimeout(timer)
      }

      if (!response.ok) {
        return { success: false, errorCodes: ['network-error'] }
      }

      let parsed: TurnstileSiteverifyResponse
      try {
        parsed = (await response.json()) as TurnstileSiteverifyResponse
      } catch {
        return { success: false, errorCodes: ['network-error'] }
      }

      if (parsed.success !== true) {
        return { success: false, errorCodes: parsed['error-codes'] ?? ['unknown'] }
      }

      if (parsed.action !== undefined && parsed.action !== expectedAction) {
        return { success: false, errorCodes: ['action-mismatch'] }
      }

      if (
        opts.allowedHostnames &&
        opts.allowedHostnames.length > 0 &&
        (parsed.hostname === undefined || !opts.allowedHostnames.includes(parsed.hostname))
      ) {
        return { success: false, errorCodes: ['hostname-mismatch'] }
      }

      return {
        success: true,
        hostname: parsed.hostname,
        action: parsed.action,
        challengeTs: parsed.challenge_ts,
      }
    },
  }
}
