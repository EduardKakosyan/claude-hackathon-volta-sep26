#!/usr/bin/env node
/**
 * Copies MapLibre's worker chunk, and the shared chunk it imports, into
 * public/maplibre/ so the browser can start the map's workers from a stable
 * same-origin URL (lib/maplibre-worker.ts points at it).
 *
 * Why this exists: Turbopack rewrites `import.meta.url` inside maplibre-gl to a
 * `file:` path, so MapLibre's own worker-URL fallback resolves to '' — the
 * document itself — and every worker dies parsing HTML. Chromium hides that as
 * an `error` event on the Worker; WebKit raises "SyntaxError: Unexpected token
 * '<'" on the page. Either way vector and DEM tiles never decode.
 *
 * Runs on `postinstall`. lib/maplibre-worker.test.ts fails if the copies drift
 * from the installed package, so an upgrade can never leave a stale worker.
 */
import { copyFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']

const require = createRequire(import.meta.url)
const dist = join(dirname(require.resolve('maplibre-gl/package.json')), 'dist')
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'maplibre')

await mkdir(out, { recursive: true })
for (const file of FILES) await copyFile(join(dist, file), join(out, file))
console.log(`copied ${FILES.join(', ')} to public/maplibre/`)
