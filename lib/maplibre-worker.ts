/**
 * Where the browser starts MapLibre's workers from.
 *
 * scripts/copy-maplibre-worker.mjs puts these two files under public/maplibre/
 * on `postinstall`; the worker imports the shared chunk by relative path, which
 * is why both are copied and why the names are not hashed. Turbopack cannot
 * serve them itself: it hands maplibre-gl a `file:` `import.meta.url`, so the
 * library's own fallback resolves to '' and every worker dies parsing the HTML
 * document instead of a script.
 */
export const MAPLIBRE_WORKER_FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'] as const

export const MAPLIBRE_WORKER_URL = `/maplibre/${MAPLIBRE_WORKER_FILES[0]}`
