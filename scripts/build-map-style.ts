#!/usr/bin/env tsx
/**
 * pnpm map:style [--relief] — regenerate lib/map-style/paper.json.
 *
 * The map is OpenFreeMap's positron style repainted in the Tide Table palette
 * and frozen in the repo, so the browser never fetches a style and the rig sees
 * the same map on every run. This script is the only thing that writes the
 * file. Run it by hand when tuning a colour (edit lib/map-style/palette.ts,
 * re-run, commit the diff); it never runs at build time.
 *
 *   fetch positron
 *   → applyPaperPalette   paint table + symbol rule, keyed by positron layer id
 *   → drop the ne2_shaded relief raster positron ships for low zooms
 *   → throw if any layer id this script knows has been renamed upstream
 *   → write lib/map-style/paper.json (stable formatting, so a re-run is a no-op)
 *
 * `--relief` adds a soft hillshade under the water (the mockup's option C).
 * Deferred by the PRD; kept as a switch so it can be tried without redoing
 * anything.
 *
 * Every side effect goes through injected deps so scripts/build-map-style.test.ts
 * covers the transform and the CLI without the network or the filesystem.
 */
import { writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

import type { LayerSpecification, StyleSpecification } from 'maplibre-gl'

import { PAPER, type PaperPalette } from '../lib/map-style/palette'

export const POSITRON_URL = 'https://tiles.openfreemap.org/styles/positron'
export const OUTPUT_PATH = fileURLToPath(new URL('../lib/map-style/paper.json', import.meta.url))
export const STYLE_NAME = 'Tide Table paper'

/** The relief raster positron draws under everything at zoom ≤ 6. Dropped: it is not paper. */
export const RELIEF_SOURCE = 'ne2_shaded'
/** The vector source every positron layer reads from. */
export const VECTOR_SOURCE = 'openmaptiles'
/** Public-domain elevation tiles for the optional hillshade. */
export const TERRARIUM_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'

/**
 * Credits the attribution control shows. The TileJSON at tiles.openfreemap.org
 * carries the same line and wins once it has loaded; this copy is what the
 * style itself promises, and what the rig can check without the network.
 */
export const ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> ' +
  '<a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">© OpenMapTiles</a> ' +
  'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'

type Paint = Record<string, unknown>

/**
 * Paint overrides keyed by positron layer id. Only colours change; widths,
 * opacities and zoom ramps stay positron's, which is what keeps the map legible
 * at every zoom without redrawing it.
 */
export function paintTable(p: PaperPalette): Record<string, Paint> {
  return {
    background: { 'background-color': p.paper },
    park: { 'fill-color': p.park },
    water: { 'fill-color': p.water, 'fill-outline-color': p.waterEdge },
    landuse_residential: { 'fill-color': p.residential },
    landcover_wood: { 'fill-color': p.wood },
    building: { 'fill-color': p.building, 'fill-outline-color': p.buildingLine },
    waterway: { 'line-color': p.waterEdge },
    road_area_pier: { 'fill-color': p.paper },
    highway_path: { 'line-color': p.roadMinor },
    highway_minor: { 'line-color': p.roadMinor },
    highway_major_inner: { 'line-color': p.roadMajor },
    highway_major_casing: { 'line-color': p.roadMajorCase },
    highway_major_subtle: { 'line-color': p.roadMajorCase },
    highway_motorway_inner: { 'line-color': p.roadMotor },
    highway_motorway_casing: { 'line-color': p.roadMotorCase },
    highway_motorway_subtle: { 'line-color': p.roadMotorCase },
    highway_motorway_bridge_inner: { 'line-color': p.roadMotor },
    highway_motorway_bridge_casing: { 'line-color': p.roadMotorCase },
    tunnel_motorway_inner: { 'line-color': p.roadMotor },
    tunnel_motorway_casing: { 'line-color': p.roadMotorCase },
    railway: { 'line-color': p.rule },
    boundary_2: { 'line-color': p.rule },
    boundary_3: { 'line-color': p.rule },
  }
}

/** Symbol layers the palette rule must find, over and above the paint table. */
export const EXPECTED_SYMBOL_IDS = [
  'water_name_point_label',
  'water_name_line_label',
  'label_town',
  'label_city',
] as const

/** Every positron layer id this script relies on. A rename upstream fails the build, not the map. */
export const EXPECTED_LAYER_IDS: readonly string[] = [
  ...Object.keys(paintTable(PAPER)),
  ...EXPECTED_SYMBOL_IDS,
]

/** Water names in the accent, places in ink, everything else (roads, shields, airports) quiet. */
export function labelColor(id: string, p: PaperPalette): string {
  if (/water/.test(id)) return p.accent
  if (/city|town|village|state|country/.test(id)) return p.ink
  return p.muted
}

export interface BuildOptions {
  palette?: PaperPalette
  withRelief?: boolean
}

/**
 * Pure: positron in, paper out. Never mutates its input. Throws when a layer
 * from EXPECTED_LAYER_IDS is missing, because a silent miss would leave water
 * grey-blue on the live site with nothing failing.
 */
export function applyPaperPalette(
  style: StyleSpecification,
  { palette = PAPER, withRelief = false }: BuildOptions = {},
): StyleSpecification {
  const out = structuredClone(style)
  const table = paintTable(palette)
  const present = new Set(out.layers.map((layer) => layer.id))
  const missing = EXPECTED_LAYER_IDS.filter((id) => !present.has(id))
  if (missing.length > 0) {
    throw new Error(
      `positron no longer has layer(s) ${missing.join(', ')}; ` +
        'update paintTable / EXPECTED_SYMBOL_IDS in scripts/build-map-style.ts',
    )
  }

  for (const layer of out.layers) {
    const target = layer as LayerSpecification & { paint?: Paint; layout?: Record<string, unknown> }
    const paint = table[layer.id]
    if (paint) target.paint = { ...(target.paint ?? {}), ...paint }
    if (layer.type === 'symbol') {
      target.paint = {
        ...(target.paint ?? {}),
        'text-color': labelColor(layer.id, palette),
        'text-halo-color': palette.halo,
        'text-halo-width': 1.2,
      }
      if (/water_name/.test(layer.id)) {
        target.layout = { ...(target.layout ?? {}), 'text-font': ['Noto Sans Italic'] }
      }
    }
  }

  out.layers = out.layers.filter((layer) => !('source' in layer) || layer.source !== RELIEF_SOURCE)
  delete out.sources[RELIEF_SOURCE]

  const vector = out.sources[VECTOR_SOURCE]
  if (!vector || vector.type !== 'vector') {
    throw new Error(`positron no longer has a vector source named ${VECTOR_SOURCE}`)
  }
  vector.attribution = ATTRIBUTION

  if (withRelief) {
    out.sources.dem = {
      type: 'raster-dem',
      tiles: [TERRARIUM_TILES],
      tileSize: 256,
      encoding: 'terrarium',
      maxzoom: 14,
      attribution:
        '<a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noreferrer">AWS Terrain Tiles</a>',
    }
    const waterIndex = out.layers.findIndex((layer) => layer.id === 'water')
    out.layers.splice(waterIndex, 0, {
      id: 'hill',
      type: 'hillshade',
      source: 'dem',
      paint: {
        'hillshade-exaggeration': 0.18,
        'hillshade-shadow-color': '#8a948e',
        'hillshade-highlight-color': '#ffffff',
        'hillshade-accent-color': palette.roadMajorCase,
      },
    })
  }

  // A flat map: nothing 3D survives, whatever upstream adds later.
  delete out.terrain
  delete out.sky
  delete out.projection
  out.name = STYLE_NAME
  return out
}

/** The exact bytes written, so two runs over the same upstream produce no diff. */
export function render(style: StyleSpecification): string {
  return `${JSON.stringify(style, null, 2)}\n`
}

export interface Deps {
  fetchJson: (url: string) => Promise<unknown>
  write: (path: string, text: string) => Promise<void>
  log: (line: string) => void
}

export async function main(argv: string[], deps: Deps): Promise<number> {
  const withRelief = argv.includes('--relief')
  const unknown = argv.filter((arg) => arg !== '--relief')
  if (unknown.length > 0) {
    deps.log(`usage: pnpm map:style [--relief]  (unknown: ${unknown.join(' ')})`)
    return 2
  }
  try {
    const positron = (await deps.fetchJson(POSITRON_URL)) as StyleSpecification
    const paper = applyPaperPalette(positron, { withRelief })
    await deps.write(OUTPUT_PATH, render(paper))
    deps.log(
      `wrote ${OUTPUT_PATH}: ${paper.layers.length} layers, ${Object.keys(paper.sources).length} sources` +
        (withRelief ? ' (with relief)' : ''),
    )
    return 0
  } catch (error) {
    deps.log(`map:style: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`)
  return response.json()
}

const invokedDirectly =
  typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  main(process.argv.slice(2), {
    fetchJson,
    write: (path, text) => writeFile(path, text, 'utf8'),
    log: (line) => console.log(line),
  }).then((code) => process.exit(code))
}
