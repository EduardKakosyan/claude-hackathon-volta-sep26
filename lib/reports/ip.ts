import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import type { HeaderReader } from './types'
import type { TrustedIpHeader } from './config'

/**
 * Reads exactly one header the deployment platform is known to set. On Vercel the
 * proxy sets `x-real-ip` and `x-forwarded-for` to the client address and overwrites
 * client-supplied values; `x-vercel-forwarded-for` is the same value. The header
 * is configurable so a different proxy can be trusted without a code change, and
 * nothing here ever falls back to a second header.
 */
export function clientIpFrom(headers: HeaderReader, trusted: TrustedIpHeader): string | null {
  const value = headers.get(trusted)
  if (!value) return null
  const firstHop = value.split(',')[0]?.trim()
  if (!firstHop) return null
  return normalizeIp(firstHop)
}

/**
 * trim; strip surrounding []; strip ':port' from IPv4 "1.2.3.4:5678"; lowercase;
 * unwrap "::ffff:1.2.3.4" → "1.2.3.4"; return null unless isIP(result) !== 0
 */
export function normalizeIp(raw: string): string | null {
  let value = raw.trim()
  if (!value) return null

  // Strip surrounding [ ] (IPv6 literal, possibly with a port outside the brackets).
  const bracketed = value.match(/^\[(.+)\](?::\d+)?$/)
  if (bracketed) {
    value = bracketed[1]
  } else {
    // Strip ':port' from a bare IPv4 "1.2.3.4:5678" (never strip from a bare IPv6,
    // which contains multiple colons and no brackets here).
    const ipv4WithPort = value.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):\d+$/)
    if (ipv4WithPort) value = ipv4WithPort[1]
  }

  value = value.toLowerCase()

  // Unwrap IPv4-mapped IPv6, e.g. "::ffff:203.0.113.9" → "203.0.113.9".
  const v4Mapped = value.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (v4Mapped) value = v4Mapped[1]

  return isIP(value) !== 0 ? value : null
}

/** sha256 hex of `${salt}\n${ip}`. A delimiter keeps salt/ip boundaries unambiguous. */
export function hashIp(ip: string, salt: string): string {
  return createHash('sha256').update(`${salt}\n${ip}`).digest('hex')
}
