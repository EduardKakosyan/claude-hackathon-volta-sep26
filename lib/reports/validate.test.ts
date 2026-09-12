import { describe, expect, it } from 'vitest'
import { BEACHES_BY_ID } from '@/lib/seed/beaches'
import {
  FORM_FIELDS,
  MAX_PHOTO_BYTES,
  sniffImageType,
  parseReportForm,
  validatePhotoBytes,
} from './validate'
import { PHOTO_FIXTURES } from './testing/photos'

const roster = new Set(Object.keys(BEACHES_BY_ID))
const anyBeachId = roster.values().next().value as string

function fileFrom(bytes: Uint8Array, type: string, name = 'sign.jpg'): File {
  return new File([bytes.buffer as ArrayBuffer], name, { type })
}

function validForm(overrides: Record<string, FormDataEntryValue> = {}): FormData {
  const form = new FormData()
  form.set(FORM_FIELDS.beachId, anyBeachId)
  form.set(FORM_FIELDS.sign, 'closed')
  form.set(FORM_FIELDS.token, 'a-turnstile-token')
  for (const [key, value] of Object.entries(overrides)) {
    form.set(key, value)
  }
  return form
}

describe('parseReportForm', () => {
  it('parses a valid form with no photo', () => {
    const result = parseReportForm(validForm(), roster)
    expect(result).toEqual({
      ok: true,
      value: { beachId: anyBeachId, sign: 'closed', turnstileToken: 'a-turnstile-token', photo: null },
    })
  })

  it('rejects an unknown beach', () => {
    const result = parseReportForm(validForm({ [FORM_FIELDS.beachId]: 'hrm-nowhere' }), roster)
    expect(result).toEqual({ ok: false, error: 'beach' })
  })

  it('rejects a status word that is not a report sign', () => {
    const result = parseReportForm(validForm({ [FORM_FIELDS.sign]: 'open' }), roster)
    expect(result).toEqual({ ok: false, error: 'sign' })
  })

  it('rejects an empty turnstile token', () => {
    const result = parseReportForm(validForm({ [FORM_FIELDS.token]: '' }), roster)
    expect(result).toEqual({ ok: false, error: 'token' })
  })

  it('treats a zero-size file as no photo', () => {
    const form = validForm()
    form.set(FORM_FIELDS.photo, new File([], ''))
    const result = parseReportForm(form, roster)
    expect(result).toEqual({ ok: true, value: expect.objectContaining({ photo: null }) })
  })

  it('rejects a declared type outside the allowlist', () => {
    const form = validForm()
    form.set(FORM_FIELDS.photo, fileFrom(PHOTO_FIXTURES.gif, 'image/gif'))
    const result = parseReportForm(form, roster)
    expect(result).toEqual({ ok: false, error: 'photo-type' })
  })
})

describe('sniffImageType', () => {
  it('recognises jpeg, png and webp', () => {
    expect(sniffImageType(PHOTO_FIXTURES.jpeg)).toBe('image/jpeg')
    expect(sniffImageType(PHOTO_FIXTURES.png)).toBe('image/png')
    expect(sniffImageType(PHOTO_FIXTURES.webp)).toBe('image/webp')
  })
  it('returns null for anything else', () => {
    expect(sniffImageType(PHOTO_FIXTURES.gif)).toBeNull()
    expect(sniffImageType(PHOTO_FIXTURES.textAsJpeg)).toBeNull()
  })
})

describe('validatePhotoBytes', () => {
  it('rejects text disguised as a jpeg', () => {
    expect(validatePhotoBytes(PHOTO_FIXTURES.textAsJpeg, 'image/jpeg')).toEqual({ ok: false, error: 'photo-type' })
  })
  it('rejects a declared type that does not match the sniffed bytes', () => {
    expect(validatePhotoBytes(PHOTO_FIXTURES.jpeg, 'image/png')).toEqual({ ok: false, error: 'photo-type' })
  })
  it('rejects an oversized photo', () => {
    expect(validatePhotoBytes(PHOTO_FIXTURES.oversized(), 'image/jpeg')).toEqual({ ok: false, error: 'photo-size' })
  })
  it('rejects an empty photo', () => {
    expect(validatePhotoBytes(new Uint8Array(0), 'image/jpeg')).toEqual({ ok: false, error: 'photo-empty' })
  })
  it('accepts a matching jpeg within the size limit', () => {
    expect(validatePhotoBytes(PHOTO_FIXTURES.jpeg, 'image/jpeg', MAX_PHOTO_BYTES)).toEqual({ ok: true, type: 'image/jpeg' })
  })
})
