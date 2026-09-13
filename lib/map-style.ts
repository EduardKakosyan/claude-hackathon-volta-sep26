import type { StyleSpecification } from 'maplibre-gl'

import paper from '@/lib/map-style/paper.json'

/**
 * The "Tide Table paper" map: OpenFreeMap's positron repainted in the shell's
 * palette and frozen in the repo by `pnpm map:style` (scripts/build-map-style.ts).
 * Warm paper land, a teal wash for water, hairline ink roads, quiet labels, and
 * no status colour anywhere, so a pin is always the most saturated thing on
 * screen. Vector tiles, glyphs and the sprite still come from
 * tiles.openfreemap.org (free, no key, OpenStreetMap data); the style itself
 * never leaves the bundle.
 *
 * Flat and north-up. The globe, terrain and pitch that came with the satellite
 * style are gone: they were the part MapLibre flags as unreliable on some
 * phones, and a directory wants the orientation of a printed map.
 */
// JSON is typed structurally, which is wider than the style spec's literal unions.
export const PAPER_STYLE = paper as unknown as StyleSpecification

/**
 * Where the page opens: the Halifax region, where 18 of the 35 beaches are.
 * The same point lib/geo.ts measures distances from when location is unknown.
 */
export const HALIFAX_VIEW = {
  longitude: -63.58,
  latitude: 44.65,
  zoom: 11,
  pitch: 0,
  bearing: 0,
} as const

/** The whole province in one frame: the zoom the pins shrink for. */
export const PROVINCE_VIEW = {
  longitude: -63.2,
  latitude: 45.1,
  zoom: 6.2,
  pitch: 0,
  bearing: 0,
} as const

/** The camera a selected pin gets: close enough to see the shoreline and the road in. */
export const BEACH_VIEW = { zoom: 13.5 } as const

/**
 * The camera the visitor's own position gets: their dot and the three nearest
 * pins fitted in frame, but never closer than a neighbourhood — a person standing
 * on a beach still sees where the next ones are.
 */
export const USER_VIEW = { maxZoom: 12, durationMs: 1200 } as const

/**
 * How much of the map one screen shows, in three steps. Pins scale by band
 * (components/beach-shell.css) so the Halifax cluster stays legible at province
 * zoom without a clustering scheme; the rig asserts on `data-zoom-band`.
 */
export type ZoomBand = 'province' | 'region' | 'beach'

/** Band floors sit between the three camera zooms, so each view lands squarely in its band. */
export const ZOOM_BAND_FLOOR = { region: 9, beach: 12.5 } as const

export function zoomBand(zoom: number): ZoomBand {
  if (zoom < ZOOM_BAND_FLOOR.region) return 'province'
  if (zoom < ZOOM_BAND_FLOOR.beach) return 'region'
  return 'beach'
}
