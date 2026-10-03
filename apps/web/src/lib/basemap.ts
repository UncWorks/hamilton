// Basemap configuration for both render spines (System Design §6c "Basemap").
//
//   NEXT_PUBLIC_BASEMAP=offline  — self-hosted, NFR-01 compliant (default when
//                                  the assets are provisioned):
//       MapLibre: vector PMTiles /tiles/avdiivka.pmtiles + glyphs /tiles/glyphs
//       Cesium:   raster pyramid /tiles/raster/{z}/{x}/{y}.png rendered from the
//                 same extract and style (scripts/basemap/render-raster.mjs)
//   NEXT_PUBLIC_BASEMAP=online   — DEV ONLY, NOT NFR-01 compliant: OSM standard
//                                  raster tiles from tile.openstreetmap.org,
//                                  dimmed. Needs the online CSP (next.config.mjs).
//   NEXT_PUBLIC_BASEMAP=none     — no basemap; symbols on --surface-base.
//
// The default (when unset) is resolved at build time in next.config.mjs and
// .storybook/main.ts: offline if apps/web/public/tiles/avdiivka.pmtiles exists,
// none otherwise. Provision with `make fetch-tiles`.

import type { StyleSpecification } from 'maplibre-gl';
import basemapLayers from './basemap-layers.json';

export type BasemapMode = 'offline' | 'online' | 'none';

export const BASEMAP_MODES: readonly BasemapMode[] = ['offline', 'online', 'none'];

/** Required attribution for the offline basemap (OSM ODbL + Protomaps). */
export const OFFLINE_ATTRIBUTION = '© OpenStreetMap contributors, Protomaps';
/** Required attribution for the online (dev-only) OSM raster tiles. */
export const ONLINE_ATTRIBUTION = '© OpenStreetMap contributors · online dev basemap';

export const PMTILES_PATH = '/tiles/avdiivka.pmtiles';
export const GLYPHS_PATH = '/tiles/glyphs/{fontstack}/{range}.pbf';
export const RASTER_PATH = '/tiles/raster/{z}/{x}/{y}.png';
export const RASTER_META_PATH = '/tiles/raster/tiles.json';
/** OSM standard tile layer — online dev mode only (tile usage policy: light use, attribution). */
export const ONLINE_RASTER_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export function parseBasemapMode(v: string | undefined): BasemapMode | null {
  return v === 'offline' || v === 'online' || v === 'none' ? v : null;
}

/** The configured mode (build-time env; next.config.mjs fills the default). */
export function basemapMode(): BasemapMode {
  return parseBasemapMode(process.env.NEXT_PUBLIC_BASEMAP) ?? 'none';
}

export function basemapAttribution(mode: BasemapMode): string | null {
  if (mode === 'offline') return OFFLINE_ATTRIBUTION;
  if (mode === 'online') return ONLINE_ATTRIBUTION;
  return null;
}

const SURFACE_BASE = basemapLayers.background;

/**
 * MapLibre style for a mode. MapLibre resolves style URLs with `new URL()`,
 * so on-origin assets are made absolute against `origin`.
 */
export function maplibreStyle(mode: BasemapMode, origin: string): StyleSpecification {
  if (mode === 'offline') {
    return {
      version: 8,
      glyphs: `${origin}${GLYPHS_PATH}`,
      sources: {
        [basemapLayers.source]: {
          type: 'vector',
          url: `pmtiles://${origin}${PMTILES_PATH}`,
        },
      },
      layers: basemapLayers.layers as StyleSpecification['layers'],
    };
  }
  if (mode === 'online') {
    return {
      version: 8,
      sources: {
        osm: { type: 'raster', tiles: [ONLINE_RASTER_URL], tileSize: 256, maxzoom: 19 },
      },
      layers: [
        { id: 'background', type: 'background', paint: { 'background-color': SURFACE_BASE } },
        {
          id: 'osm',
          type: 'raster',
          source: 'osm',
          // Light OSM cartography pushed into the dark palette.
          paint: { 'raster-saturation': -0.85, 'raster-brightness-max': 0.32, 'raster-contrast': 0.1 },
        },
      ],
    };
  }
  return {
    version: 8,
    sources: {},
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': SURFACE_BASE } }],
  };
}

/** /tiles/raster/tiles.json, written by scripts/basemap/render-raster.mjs. */
export interface RasterMeta {
  tileSize: number;
  minzoom: number;
  maxzoom: number;
  /** [west, south, east, north] degrees. */
  bounds: [number, number, number, number];
  attribution: string;
}

export function isRasterMeta(v: unknown): v is RasterMeta {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m.tileSize === 'number' &&
    typeof m.minzoom === 'number' &&
    typeof m.maxzoom === 'number' &&
    Array.isArray(m.bounds) &&
    m.bounds.length === 4 &&
    m.bounds.every((n) => typeof n === 'number')
  );
}

/**
 * Cesium imagery-layer adjustments per mode. The offline raster is already
 * styled in the Hamilton palette (barely touched); the online OSM tiles are
 * light cartography and are pushed hard into the dark palette.
 */
export const CESIUM_IMAGERY_TUNING: Record<Exclude<BasemapMode, 'none'>, { brightness: number; contrast: number; saturation: number; gamma: number }> = {
  offline: { brightness: 1, contrast: 1, saturation: 1, gamma: 1 },
  online: { brightness: 0.32, contrast: 1.1, saturation: 0.15, gamma: 1 },
};
