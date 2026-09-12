import type { StyleSpecification } from 'maplibre-gl'

/**
 * The style from `docs/mockup-3d-map-live.html`, lifted verbatim: EOX Sentinel-2
 * cloudless imagery, AWS Terrarium elevation tiles behind a hillshade layer, a sky,
 * and 1.6x terrain exaggeration. No vector basemap and no labels — the pins are the
 * only text on the map.
 *
 * Both tile sources are keyless and attribution-only:
 *  - Imagery: Sentinel-2 cloudless by EOX, CC BY-NC-SA 4.0. Non-commercial only;
 *    selling this app would require a commercial imagery source.
 *  - Terrain: AWS Terrain Tiles, public domain.
 */
export const SATELLITE_TERRAIN_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    sat: {
      type: 'raster',
      tiles: [
        'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg',
      ],
      tileSize: 256,
      attribution:
        'Sentinel-2 cloudless by <a href="https://eox.at" target="_blank" rel="noreferrer">EOX</a> (CC BY-NC-SA 4.0)',
    },
    dem: {
      type: 'raster-dem',
      tiles: [
        'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      encoding: 'terrarium',
      maxzoom: 14,
      attribution:
        '<a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noreferrer">AWS Terrain Tiles</a>',
    },
  },
  layers: [
    { id: 'sat', type: 'raster', source: 'sat' },
    {
      id: 'hill',
      type: 'hillshade',
      source: 'dem',
      paint: {
        'hillshade-exaggeration': 0.35,
        'hillshade-shadow-color': '#0b1220',
      },
    },
  ],
  sky: {
    'sky-color': '#1a2a4a',
    'horizon-color': '#c9d6e8',
    'fog-color': '#c9d6e8',
    'sky-horizon-blend': 0.6,
    'horizon-fog-blend': 0.7,
    'fog-ground-blend': 0.6,
  },
  terrain: { source: 'dem', exaggeration: 1.6 },
}

/** The opening shot: a globe, before the camera drops into Nova Scotia. */
export const GLOBE_VIEW = {
  longitude: -63.58,
  latitude: 44.65,
  zoom: 1.5,
  pitch: 0,
  bearing: 0,
}

/** Where the globe intro lands. Same numbers as the mockup's `flyHalifax()`. */
export const HALIFAX_VIEW = {
  center: [-63.58, 44.66] as [number, number],
  zoom: 11.2,
  pitch: 62,
  bearing: -18,
}

/** The camera a selected pin gets. */
export const BEACH_VIEW = { zoom: 13.5, pitch: 65 }
