import { REPORT_SIGNS, type ReportSign } from './types'

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024
export const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type PhotoType = (typeof ALLOWED_PHOTO_TYPES)[number]
export const MAX_TOKEN_LENGTH = 2048

/** Field names the form posts and the action reads. `cf-turnstile-response` is Turnstile's default. */
export const FORM_FIELDS = {
  beachId: 'beachId',
  sign: 'sign',
  token: 'cf-turnstile-response',
  photo: 'photo',
} as const

export type ReportFormError = 'beach' | 'sign' | 'token' | 'photo-type' | 'photo-size' | 'photo-empty'

export interface ParsedReportForm {
  beachId: string
  sign: ReportSign
  turnstileToken: string
  /** A File with size 0 or an empty name counts as "no photo". */
  photo: File | null
}

export function isReportSign(value: unknown): value is ReportSign {
  return typeof value === 'string' && (REPORT_SIGNS as readonly string[]).includes(value)
}

function isAllowedPhotoType(value: string): value is PhotoType {
  return (ALLOWED_PHOTO_TYPES as readonly string[]).includes(value)
}

export function parseReportForm(
  form: FormData,
  roster: ReadonlySet<string>,
): { ok: true; value: ParsedReportForm } | { ok: false; error: ReportFormError } {
  const beachId = form.get(FORM_FIELDS.beachId)
  if (typeof beachId !== 'string' || !roster.has(beachId)) {
    return { ok: false, error: 'beach' }
  }

  const sign = form.get(FORM_FIELDS.sign)
  if (!isReportSign(sign)) {
    return { ok: false, error: 'sign' }
  }

  const turnstileToken = form.get(FORM_FIELDS.token)
  if (typeof turnstileToken !== 'string' || turnstileToken.length === 0 || turnstileToken.length > MAX_TOKEN_LENGTH) {
    return { ok: false, error: 'token' }
  }

  const photoField = form.get(FORM_FIELDS.photo)
  let photo: File | null = null
  if (photoField instanceof File && photoField.size > 0 && photoField.name !== '') {
    if (photoField.size > MAX_PHOTO_BYTES) {
      return { ok: false, error: 'photo-size' }
    }
    if (!isAllowedPhotoType(photoField.type)) {
      return { ok: false, error: 'photo-type' }
    }
    photo = photoField
  }

  return { ok: true, value: { beachId, sign, turnstileToken, photo } }
}

/** JPEG: FF D8 FF · PNG: 89 50 4E 47 0D 0A 1A 0A · WEBP: 'RIFF' .... 'WEBP' — anything else null */
export function sniffImageType(bytes: Uint8Array): PhotoType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }

  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.length >= pngSignature.length && pngSignature.every((byte, i) => bytes[i] === byte)) {
    return 'image/png'
  }

  if (bytes.length >= 12) {
    const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])
    const webp = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11])
    if (riff === 'RIFF' && webp === 'WEBP') {
      return 'image/webp'
    }
  }

  return null
}

export function validatePhotoBytes(
  bytes: Uint8Array,
  declaredType: string,
  maxBytes: number = MAX_PHOTO_BYTES,
): { ok: true; type: PhotoType } | { ok: false; error: 'photo-type' | 'photo-size' | 'photo-empty' } {
  if (bytes.length === 0) {
    return { ok: false, error: 'photo-empty' }
  }
  if (bytes.length > maxBytes) {
    return { ok: false, error: 'photo-size' }
  }
  const sniffed = sniffImageType(bytes)
  if (sniffed === null || sniffed !== declaredType) {
    return { ok: false, error: 'photo-type' }
  }
  return { ok: true, type: sniffed }
}

export function photoExtension(type: PhotoType): 'jpg' | 'png' | 'webp' {
  switch (type) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
  }
}
