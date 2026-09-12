import { MAX_PHOTO_BYTES } from '../validate'

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values)
}

const JPEG_SIGNATURE = [0xff, 0xd8, 0xff, 0xe0]
const JPEG_EOI = [0xff, 0xd9]
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

export const PHOTO_FIXTURES = {
  jpeg: bytes(...JPEG_SIGNATURE, ...new Array(16).fill(0), ...JPEG_EOI),
  png: bytes(...PNG_SIGNATURE, ...new Array(8).fill(0)),
  webp: bytes(
    ...'RIFF'.split('').map((c) => c.charCodeAt(0)),
    0,
    0,
    0,
    0,
    ...'WEBP'.split('').map((c) => c.charCodeAt(0)),
    ...new Array(8).fill(0),
  ),
  gif: bytes(...'GIF89a'.split('').map((c) => c.charCodeAt(0))),
  textAsJpeg: bytes(...'hello'.split('').map((c) => c.charCodeAt(0))),
  oversized(): Uint8Array {
    const result = new Uint8Array(MAX_PHOTO_BYTES + 1)
    result.set(JPEG_SIGNATURE, 0)
    return result
  },
}
