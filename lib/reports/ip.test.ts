import { describe, expect, it } from 'vitest'
import { clientIpFrom, hashIp, normalizeIp } from './ip'
import { createHeaderReader } from './testing/fakes'

describe('normalizeIp', () => {
  it('passes through a plain IPv4 address', () => {
    expect(normalizeIp('203.0.113.9')).toBe('203.0.113.9')
  })
  it('unwraps an IPv4-mapped IPv6 address', () => {
    expect(normalizeIp('::ffff:203.0.113.9')).toBe('203.0.113.9')
  })
  it('strips brackets from an IPv6 literal', () => {
    expect(normalizeIp('[2001:db8::1]')).toBe('2001:db8::1')
  })
  it('strips the port from an IPv4 address', () => {
    expect(normalizeIp('203.0.113.9:44123')).toBe('203.0.113.9')
  })
  it('returns null for garbage', () => {
    expect(normalizeIp('not-an-ip')).toBeNull()
    expect(normalizeIp('')).toBeNull()
  })
})

describe('clientIpFrom', () => {
  it('reads the trusted header', () => {
    const headers = createHeaderReader({ 'x-real-ip': '203.0.113.9' })
    expect(clientIpFrom(headers, 'x-real-ip')).toBe('203.0.113.9')
  })
  it('takes only the first comma-separated hop', () => {
    const headers = createHeaderReader({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' })
    expect(clientIpFrom(headers, 'x-forwarded-for')).toBe('203.0.113.9')
  })
  it('returns null when the trusted header is missing', () => {
    const headers = createHeaderReader({})
    expect(clientIpFrom(headers, 'x-real-ip')).toBeNull()
  })
  it('ignores a spoofed header that is not the trusted one', () => {
    const headers = createHeaderReader({ 'x-real-ip': '203.0.113.9', 'x-forwarded-for': '198.51.100.1' })
    expect(clientIpFrom(headers, 'x-real-ip')).toBe('203.0.113.9')
  })
})

describe('hashIp', () => {
  it('is a 64-character hex string', () => {
    expect(hashIp('203.0.113.9', 'salt')).toMatch(/^[0-9a-f]{64}$/)
  })
  it('is deterministic', () => {
    expect(hashIp('203.0.113.9', 'salt')).toBe(hashIp('203.0.113.9', 'salt'))
  })
  it('differs by salt', () => {
    expect(hashIp('203.0.113.9', 'salt-a')).not.toBe(hashIp('203.0.113.9', 'salt-b'))
  })
  it('differs by ip', () => {
    expect(hashIp('203.0.113.9', 'salt')).not.toBe(hashIp('198.51.100.1', 'salt'))
  })
  it('keeps the salt/ip boundary unambiguous', () => {
    expect(hashIp('a', 'bc')).not.toBe(hashIp('ab', 'c'))
  })
})
