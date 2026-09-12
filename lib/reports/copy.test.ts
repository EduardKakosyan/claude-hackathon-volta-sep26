import { describe, expect, it } from 'vitest'
import { resultMessage } from './copy'
import type { SubmitReportResult } from './types'

describe('resultMessage', () => {
  it('thanks the reporter and mentions the flag when the report flips a flag', () => {
    const result: SubmitReportResult = { ok: true, sign: 'closed', people: 2, flagged: true }
    expect(resultMessage(result)).toBe('Thanks — a second person has reported a Closed sign today, so it now shows on the pin.')
  })

  it('thanks the reporter without mentioning a flag when not yet flagged', () => {
    const result: SubmitReportResult = { ok: true, sign: 'closed', people: 1, flagged: false }
    expect(resultMessage(result)).toBe(
      'Thanks. Your report is saved and will show on the pin once someone else reports the same sign today.',
    )
  })

  it('tells the reporter to wait when throttled', () => {
    expect(resultMessage({ ok: false, reason: 'throttled' })).toBe('You already reported this beach in the last hour. Try again later.')
  })

  it('reports a failed human check', () => {
    expect(resultMessage({ ok: false, reason: 'bot' })).toBe('We could not confirm you are human. Try again.')
  })

  it('reports an invalid submission', () => {
    expect(resultMessage({ ok: false, reason: 'invalid' })).toBe('Something in the report was not valid. Check the sign and the photo.')
  })

  it('gives the same non-revealing sentence for disabled, no-ip and error', () => {
    const message = 'Reports are not available right now.'
    expect(resultMessage({ ok: false, reason: 'disabled' })).toBe(message)
    expect(resultMessage({ ok: false, reason: 'no-ip' })).toBe(message)
    expect(resultMessage({ ok: false, reason: 'error' })).toBe(message)
  })
})
