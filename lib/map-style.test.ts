import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import {
  BEACH_VIEW,
  HALIFAX_VIEW,
  PAPER_STYLE,
  PROVINCE_VIEW,
  ZOOM_BAND_FLOOR,
  zoomBand,
} from './map-style'
import { PAPER, SHELL_TOKENS } from './map-style/palette'

const root = new URL('../', import.meta.url)
const styleText = JSON.stringify(PAPER_STYLE).toLowerCase()

function layer(id: string) {
  const found = PAPER_STYLE.layers.find((l) => l.id === id)
  if (!found) throw new Error(`paper.json has no layer ${id}`)
  return found as { type: string; paint?: Record<string, unknown>; layout?: Record<string, unknown> }
}

describe('paper.json', () => {
  it('is a flat vector style with the water, land and road layers the map needs', () => {
    expect(PAPER_STYLE.version).toBe(8)
    expect(PAPER_STYLE.terrain).toBeUndefined()
    expect(PAPER_STYLE.sky).toBeUndefined()
    expect(PAPER_STYLE.projection).toBeUndefined()
    for (const id of ['background', 'water', 'park', 'building', 'highway_minor', 'highway_major_inner']) {
      expect(layer(id).type, id).not.toBe('raster')
    }
    expect(layer('water_name_point_label').type).toBe('symbol')
    expect(PAPER_STYLE.layers.length).toBeGreaterThan(40)
  })

  it('carries no status colour, so a pin is always the most saturated thing on the map', async () => {
    const globals = await readFile(new URL('app/globals.css', root), 'utf8')
    const statusHexes = [...globals.matchAll(/--status-\w+:\s*(#[0-9a-f]{6})/gi)].map((m) => m[1].toLowerCase())
    expect(new Set(statusHexes).size).toBeGreaterThanOrEqual(4)
    for (const hex of statusHexes) expect(styleText, hex).not.toContain(hex)
  })

  it('paints in the shell palette: paper land, teal-wash water, accent water names', () => {
    expect(layer('background').paint?.['background-color']).toBe(PAPER.paper)
    expect(layer('water').paint?.['fill-color']).toBe(PAPER.water)
    expect(layer('highway_major_inner').paint?.['line-color']).toBe(PAPER.roadMajor)
    expect(layer('water_name_point_label').paint?.['text-color']).toBe(PAPER.accent)
    expect(layer('water_name_point_label').layout?.['text-font']).toEqual(['Noto Sans Italic'])
    expect(layer('label_city').paint?.['text-color']).toBe(PAPER.ink)
  })

  it('keeps tiles, glyphs and the sprite on OpenFreeMap and credits OpenStreetMap', () => {
    const sources = Object.entries(PAPER_STYLE.sources)
    expect(sources).toHaveLength(1)
    const [, vector] = sources[0]
    expect(vector.type).toBe('vector')
    expect(vector).toMatchObject({ url: expect.stringMatching(/^https:\/\/tiles\.openfreemap\.org\//) })
    expect((vector as { attribution?: string }).attribution).toMatch(/OpenStreetMap/)
    expect((vector as { attribution?: string }).attribution).toMatch(/OpenFreeMap/)
    expect(PAPER_STYLE.glyphs).toMatch(/^https:\/\/tiles\.openfreemap\.org\//)
    expect(PAPER_STYLE.sprite).toMatch(/^https:\/\/tiles\.openfreemap\.org\//)
    expect(styleText).not.toContain('ne2_shaded')
    expect(styleText).not.toContain('eox.at')
  })
})

describe('PAPER palette', () => {
  it('mirrors the --beach-* tokens in beach-shell.css (edit both, then `pnpm map:style`)', async () => {
    const css = await readFile(new URL('components/beach-shell.css', root), 'utf8')
    for (const [key, token] of Object.entries(SHELL_TOKENS)) {
      const match = new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})`).exec(css)
      expect(match, token).not.toBeNull()
      expect(match![1].toLowerCase(), token).toBe(PAPER[key as keyof typeof SHELL_TOKENS])
    }
  })
})

describe('camera', () => {
  it('is flat and north-up at every view', () => {
    for (const view of [HALIFAX_VIEW, PROVINCE_VIEW]) {
      expect(view.pitch).toBe(0)
      expect(view.bearing).toBe(0)
    }
    expect(BEACH_VIEW).toEqual({ zoom: 13.5 })
    expect(BEACH_VIEW).not.toHaveProperty('pitch')
  })

  it('opens on Halifax, where lib/geo measures distances from', async () => {
    const { HALIFAX } = await import('./geo')
    expect(HALIFAX_VIEW.latitude).toBe(HALIFAX.lat)
    expect(HALIFAX_VIEW.longitude).toBe(HALIFAX.lon)
  })

  it('puts each of the three views squarely in its zoom band', () => {
    expect(zoomBand(PROVINCE_VIEW.zoom)).toBe('province')
    expect(zoomBand(HALIFAX_VIEW.zoom)).toBe('region')
    expect(zoomBand(BEACH_VIEW.zoom)).toBe('beach')
  })

  it('changes band exactly at the floors', () => {
    expect(zoomBand(ZOOM_BAND_FLOOR.region - 0.01)).toBe('province')
    expect(zoomBand(ZOOM_BAND_FLOOR.region)).toBe('region')
    expect(zoomBand(ZOOM_BAND_FLOOR.beach - 0.01)).toBe('region')
    expect(zoomBand(ZOOM_BAND_FLOOR.beach)).toBe('beach')
    expect(zoomBand(0)).toBe('province')
    expect(zoomBand(22)).toBe('beach')
  })
})
