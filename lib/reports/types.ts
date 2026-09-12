import type { PhotoType } from './validate'

export const REPORT_SIGNS = ['closed', 'advisory', 'clear'] as const
export type ReportSign = (typeof REPORT_SIGNS)[number]

/** One row of the `report_flags` view, as returned by PostgREST. */
export interface ReportFlagRow {
  beach_id: string
  sign: string
  people: number
  last_at: string // ISO timestamptz
}

/** What the page and the components consume. One per beach, chosen by `selectFlags`. */
export interface ReportFlag {
  beachId: string
  sign: ReportSign
  people: number
  lastAt: string
}

export type SubmitReportFailure =
  | 'disabled' // reports are not configured for this environment
  | 'invalid' // unknown beach, unknown sign, bad or oversize photo
  | 'bot' // Turnstile token missing or rejected
  | 'no-ip' // trusted proxy header absent or unparsable
  | 'throttled' // same ip_hash + beach inside the window
  | 'error' // storage or database failure; nothing was surfaced

export type SubmitReportResult =
  | { ok: true; sign: ReportSign; people: number; flagged: boolean }
  | { ok: false; reason: SubmitReportFailure }

export interface SubmitReportInput {
  beachId: string
  sign: ReportSign
  turnstileToken: string
  clientIp: string | null
  photo: { bytes: Uint8Array; declaredType: string } | null
}

// ---- ports ------------------------------------------------------------------

export type TurnstileVerdict =
  | { success: true; hostname?: string; action?: string; challengeTs?: string }
  | { success: false; errorCodes: string[] }

export interface TurnstileVerifier {
  verify(input: {
    token: string
    remoteIp: string | null
    idempotencyKey?: string
  }): Promise<TurnstileVerdict>
}

export interface InsertReportInput {
  beachId: string
  sign: ReportSign
  ipHash: string
  throttleWindowSeconds: number
}

export type InsertReportOutcome =
  | { outcome: 'inserted'; id: number; people: number }
  | { outcome: 'throttled' }

export interface ReportStore {
  /** Atomic: throttle check and insert in one statement (`submit_report` RPC). */
  insert(input: InsertReportInput): Promise<InsertReportOutcome>
  attachPhoto(id: number, photoPath: string): Promise<void>
}

export interface ReportPhotoStorage {
  upload(input: { path: string; bytes: Uint8Array; contentType: PhotoType }): Promise<void>
  remove(path: string): Promise<void>
}

export interface HeaderReader {
  get(name: string): string | null
}

export type ReportLogEvent =
  | { kind: 'rejected'; reason: SubmitReportFailure; beachId?: string; detail?: string }
  | { kind: 'inserted'; beachId: string; sign: ReportSign; people: number; photo: boolean }
  | { kind: 'photo-detached'; id: number; path: string; detail: string }
