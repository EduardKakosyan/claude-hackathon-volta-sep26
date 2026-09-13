import type { LayerSpecification, StyleSpecification } from 'maplibre-gl'
import { describe, expect, it } from 'vitest'

import { PAPER } from '../lib/map-style/palette'
import {
  ATTRIBUTION,
  EXPECTED_LAYER_IDS,
  EXPECTED_SYMBOL_IDS,
  OUTPUT_PATH,
  POSITRON_URL,
  RELIEF_SOURCE,
  STYLE_NAME,
  applyPaperPalette,
  labelColor,
  main,
  paintTable,
  render,
  type Deps,
} from './build-map-style'

/** A layer shaped like positron's, with the paint a real one would carry. */
function layer(id: string): LayerSpecification {
  if (id === 'background') return { id, type: 'background', paint: { 'background-color': 'rgb(242,243,240)' } }
  if (EXPECTED_SYMBOL_IDS.includes(id as (typeof EXPECTED_SYMBOL_IDS)[number]) || /label|airport/.test(id)) {
    return {
      id,
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'place',
      layout: { 'text-font': ['Noto Sans Regular'], 'text-size': 12 },
      paint: { 'text-color': '#000', 'text-halo-color': '#fff', 'text-halo-width': 1 },
    }
  }
  if (/highway|tunnel|railway|boundary|waterway/.test(id)) {
    return {
      id,
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      paint: { 'line-color': '#ccc', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 20, 8] },
    }
  }
  return {
    id,
    type: 'fill',
    source: 'openmaptiles',
    'source-layer': id,
    paint: { 'fill-color': '#ddd', 'fill-opacity': 0.9 },
  }
}

/** Positron as this script expects it: every id it relies on, the relief raster, and a stray extra layer. */
function positronLike(): StyleSpecification {
  return {
    version: 8,
    name: 'Positron',
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sprite: 'https://tiles.openfreemap.org/sprites/ofm_f384/ofm',
    sources: {
      [RELIEF_SOURCE]: {
        type: 'raster',
        tiles: ['https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 6,
      },
      openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
    },
    layers: [
      layer('background'),
      { id: 'ne2_shaded_layer', type: 'raster', source: RELIEF_SOURCE, paint: { 'raster-opacity': 0.5 } },
      ...EXPECTED_LAYER_IDS.filter((id) => id !== 'background').map(layer),
      layer('label_other'),
      layer('airport'),
    ],
  }
}

function paintOf(style: StyleSpecification, id: string): Record<string, unknown> {
  const found = style.layers.find((l) => l.id === id) as { paint?: Record<string, unknown> } | undefined
  if (!found) throw new Error(`no layer ${id}`)
  return found.paint ?? {}
}

function layoutOf(style: StyleSpecification, id: string): Record<string, unknown> {
  const found = style.layers.find((l) => l.id === id) as { layout?: Record<string, unknown> } | undefined
  if (!found) throw new Error(`no layer ${id}`)
  return found.layout ?? {}
}

describe('applyPaperPalette', () => {
  it('repaints every layer in the table with the palette and keeps the rest of its paint', () => {
    const out = applyPaperPalette(positronLike())
    expect(paintOf(out, 'background')).toEqual({ 'background-color': PAPER.paper })
    expect(paintOf(out, 'water')).toMatchObject({ 'fill-color': PAPER.water, 'fill-outline-color': PAPER.waterEdge })
    expect(paintOf(out, 'water')['fill-opacity']).toBe(0.9)
    expect(paintOf(out, 'highway_major_inner')['line-color']).toBe(PAPER.roadMajor)
    expect(paintOf(out, 'highway_major_inner')['line-width']).toEqual(['interpolate', ['linear'], ['zoom'], 10, 1, 20, 8])
    for (const [id, paint] of Object.entries(paintTable(PAPER))) {
      expect(paintOf(out, id), id).toMatchObject(paint)
    }
  })

  it('colours every symbol layer: water in the accent, places in ink, the rest muted, all on a paper halo', () => {
    const out = applyPaperPalette(positronLike())
    expect(paintOf(out, 'water_name_point_label')).toMatchObject({
      'text-color': PAPER.accent,
      'text-halo-color': PAPER.halo,
      'text-halo-width': 1.2,
    })
    expect(paintOf(out, 'label_city')['text-color']).toBe(PAPER.ink)
    expect(paintOf(out, 'label_town')['text-color']).toBe(PAPER.ink)
    expect(paintOf(out, 'label_other')['text-color']).toBe(PAPER.muted)
    expect(paintOf(out, 'airport')['text-color']).toBe(PAPER.muted)
    for (const l of out.layers) {
      if (l.type === 'symbol') expect(paintOf(out, l.id)['text-halo-color'], l.id).toBe(PAPER.halo)
    }
  })

  it('sets water names in italic and leaves other fonts alone', () => {
    const out = applyPaperPalette(positronLike())
    expect(layoutOf(out, 'water_name_point_label')['text-font']).toEqual(['Noto Sans Italic'])
    expect(layoutOf(out, 'water_name_line_label')['text-font']).toEqual(['Noto Sans Italic'])
    expect(layoutOf(out, 'label_city')['text-font']).toEqual(['Noto Sans Regular'])
    expect(layoutOf(out, 'label_city')['text-size']).toBe(12)
  })

  it('drops the shaded-relief raster source and its layers, and names the style', () => {
    const out = applyPaperPalette(positronLike())
    expect(out.sources).not.toHaveProperty(RELIEF_SOURCE)
    expect(out.layers.map((l) => l.id)).not.toContain('ne2_shaded_layer')
    expect(out.name).toBe(STYLE_NAME)
  })

  it('keeps the vector tiles, glyphs and sprite on OpenFreeMap and credits OpenStreetMap', () => {
    const out = applyPaperPalette(positronLike())
    const vector = out.sources.openmaptiles
    expect(vector.type).toBe('vector')
    expect(vector).toMatchObject({ url: 'https://tiles.openfreemap.org/planet', attribution: ATTRIBUTION })
    expect(ATTRIBUTION).toContain('OpenStreetMap')
    expect(ATTRIBUTION).toContain('OpenFreeMap')
    expect(out.glyphs).toMatch(/^https:\/\/tiles\.openfreemap\.org\//)
    expect(out.sprite).toMatch(/^https:\/\/tiles\.openfreemap\.org\//)
  })

  it('is flat: no terrain, sky or projection survive, with or without relief', () => {
    const input = positronLike()
    input.terrain = { source: 'x', exaggeration: 1 }
    input.sky = { 'sky-color': '#000' }
    input.projection = { type: 'globe' }
    for (const withRelief of [false, true]) {
      const out = applyPaperPalette(input, { withRelief })
      expect(out.terrain).toBeUndefined()
      expect(out.sky).toBeUndefined()
      expect(out.projection).toBeUndefined()
    }
  })

  it('does not mutate its input', () => {
    const input = positronLike()
    const before = JSON.stringify(input)
    applyPaperPalette(input)
    expect(JSON.stringify(input)).toBe(before)
  })

  it('throws, naming the layer, when positron renames one this script paints', () => {
    const input = positronLike()
    const water = input.layers.find((l) => l.id === 'water')!
    water.id = 'water_polygons'
    expect(() => applyPaperPalette(input)).toThrow(/water/)
    expect(() => applyPaperPalette(input)).toThrow(/build-map-style/)
  })

  it('throws when a symbol layer it colours is gone', () => {
    const input = positronLike()
    input.layers = input.layers.filter((l) => l.id !== 'label_city')
    expect(() => applyPaperPalette(input)).toThrow(/label_city/)
  })

  it('throws when the vector source is renamed', () => {
    const input = positronLike()
    input.sources = { osm: input.sources.openmaptiles }
    expect(() => applyPaperPalette(input)).toThrow(/openmaptiles/)
  })

  it('--relief adds a hillshade under the water on public-domain elevation tiles', () => {
    const out = applyPaperPalette(positronLike(), { withRelief: true })
    expect(out.sources.dem).toMatchObject({ type: 'raster-dem', encoding: 'terrarium' })
    const ids = out.layers.map((l) => l.id)
    expect(ids.indexOf('hill')).toBe(ids.indexOf('water') - 1)
    expect(applyPaperPalette(positronLike()).sources).not.toHaveProperty('dem')
  })

  it('never introduces a status colour', () => {
    const text = JSON.stringify(applyPaperPalette(positronLike())).toLowerCase()
    for (const hex of ['#16a34a', '#f59e0b', '#dc2626', '#9ca3af']) expect(text).not.toContain(hex)
  })
})

describe('labelColor', () => {
  it('routes by id', () => {
    expect(labelColor('water_name_line_label', PAPER)).toBe(PAPER.accent)
    expect(labelColor('waterway_line_label', PAPER)).toBe(PAPER.accent)
    expect(labelColor('label_city_capital', PAPER)).toBe(PAPER.ink)
    expect(labelColor('label_country_1', PAPER)).toBe(PAPER.ink)
    expect(labelColor('highway-name-minor', PAPER)).toBe(PAPER.muted)
    expect(labelColor('highway-shield-non-us', PAPER)).toBe(PAPER.muted)
  })
})

describe('main', () => {
  function fake(fetched: unknown = positronLike()) {
    const writes: Array<{ path: string; text: string }> = []
    const logs: string[] = []
    const urls: string[] = []
    const deps: Deps = {
      fetchJson: async (url) => {
        urls.push(url)
        return fetched
      },
      write: async (path, text) => {
        writes.push({ path, text })
      },
      log: (line) => logs.push(line),
    }
    return { deps, writes, logs, urls }
  }

  it('fetches positron, writes paper.json, and is idempotent', async () => {
    const first = fake()
    expect(await main([], first.deps)).toBe(0)
    expect(first.urls).toEqual([POSITRON_URL])
    expect(first.writes).toHaveLength(1)
    expect(first.writes[0].path).toBe(OUTPUT_PATH)
    expect(OUTPUT_PATH).toMatch(/lib\/map-style\/paper\.json$/)
    expect(first.writes[0].text.endsWith('\n')).toBe(true)
    expect(JSON.parse(first.writes[0].text).name).toBe(STYLE_NAME)

    const second = fake()
    await main([], second.deps)
    expect(second.writes[0].text).toBe(first.writes[0].text)
    expect(render(applyPaperPalette(positronLike()))).toBe(first.writes[0].text)
    expect(first.logs[0]).toMatch(/^wrote .*paper\.json: \d+ layers, 1 sources$/)
  })

  it('--relief writes the relief variant', async () => {
    const { deps, writes, logs } = fake()
    expect(await main(['--relief'], deps)).toBe(0)
    expect(JSON.parse(writes[0].text).sources).toHaveProperty('dem')
    expect(logs[0]).toContain('(with relief)')
  })

  it('exits non-zero and writes nothing when a positron layer id is missing', async () => {
    const input = positronLike()
    input.layers = input.layers.filter((l) => l.id !== 'highway_minor')
    const { deps, writes, logs } = fake(input)
    expect(await main([], deps)).toBe(1)
    expect(writes).toEqual([])
    expect(logs[0]).toMatch(/highway_minor/)
  })

  it('exits non-zero when the fetch fails', async () => {
    const { deps, writes, logs } = fake()
    deps.fetchJson = async () => {
      throw new Error('HTTP 503 from positron')
    }
    expect(await main([], deps)).toBe(1)
    expect(writes).toEqual([])
    expect(logs[0]).toContain('HTTP 503')
  })

  it('rejects unknown flags with usage', async () => {
    const { deps, writes } = fake()
    expect(await main(['--globe'], deps)).toBe(2)
    expect(writes).toEqual([])
  })
})
