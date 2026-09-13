import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { MAPLIBRE_WORKER_FILES, MAPLIBRE_WORKER_URL } from './maplibre-worker'

const require = createRequire(import.meta.url)
const dist = join(dirname(require.resolve('maplibre-gl/package.json')), 'dist')
const served = fileURLToPath(new URL('../public/maplibre/', import.meta.url))

describe('MapLibre worker copies', () => {
  it('points the browser at the served worker', () => {
    expect(MAPLIBRE_WORKER_URL).toBe('/maplibre/maplibre-gl-worker.mjs')
  })

  it.each(MAPLIBRE_WORKER_FILES)(
    'public/maplibre/%s is byte-identical to the installed package (run `pnpm install` if not)',
    async (file) => {
      const [copy, original] = await Promise.all([
        readFile(join(served, file), 'utf8'),
        readFile(join(dist, file), 'utf8'),
      ])
      expect(copy).toBe(original)
    },
  )

  it('copies the shared chunk because the worker imports it by relative path', async () => {
    const worker = await readFile(join(dist, MAPLIBRE_WORKER_FILES[0]), 'utf8')
    expect(worker).toContain(`"./${MAPLIBRE_WORKER_FILES[1]}"`)
  })
})
