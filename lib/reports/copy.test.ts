import { describe, expect, it } from 'vitest'
import { resultMessage } from './copy'
import type { SubmitReportResult } from './types'

describe('resultMessage', () => {
  it('thanks the reporter and mentions the flag when the report flips a flag', () => {
    const result: SubmitReportResult = { ok: true, sign: 'closed', people: 2, flagged: true }
    expect(resultMessage(result)).toBe('Thanks! Two people have now reported a sign saying “Closed” today. It’s shown on the map.')
  })

  it('thanks the reporter without mentioning a flag when not yet flagged', () => {
    const result: SubmitReportResult = { ok: true, sign: 'closed', people: 1, flagged: false }
    expect(resultMessage(result)).toBe(
      'Thanks! We’ve saved your report. It will appear on the map once someone on a different internet connection reports the same sign today.',
    )
  })

  it('tells the reporter to wait when throttled', () => {
    expect(resultMessage({ ok: false, reason: 'throttled' })).toBe('You already reported this beach in the last hour. Try again later.')
  })

  it('reports a failed human check', () => {
    expect(resultMessage({ ok: false, reason: 'bot' })).toBe('The security check didn’t go through. Please try again.')
  })

  it('reports an invalid submission', () => {
    expect(resultMessage({ ok: false, reason: 'invalid' })).toBe('We couldn’t send your report. Check your sign selection and photo, then try again.')
  })

  it('gives the same non-revealing sentence for disabled, no-ip and error', () => {
    const message = 'Reports are not available right now.'
    expect(resultMessage({ ok: false, reason: 'disabled' })).toBe(message)
    expect(resultMessage({ ok: false, reason: 'no-ip' })).toBe(message)
    expect(resultMessage({ ok: false, reason: 'error' })).toBe(message)
  })
})
