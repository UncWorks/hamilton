#!/usr/bin/env node
// render-raster.mjs — render the Cesium imagery pyramid from the SAME vector
// extract and the SAME style as the MapLibre spine, so the 2D and 3D
// basemaps match (System Design §6c "Basemap"). No new data source, no new
// licence: OSM data via Protomaps (ODbL), rendered locally with MapLibre
// Native (BSD-2-Clause), written as 512 px PNG tiles that
// UrlTemplateImageryProvider serves from /tiles/raster/{z}/{x}/{y}.png.
//
// Rendering is done in metatiles (META x META tiles plus a BUFFER px margin
// cropped away) so labels near a tile edge are placed once, not cut or
// duplicated at every tile seam.
//
// Dev tooling only — @maplibre/maplibre-gl-native, pmtiles and sharp come
// from the basemap tool cache (scripts/fetch-tiles.sh), never from apps/web.
//
// Usage: node scripts/basemap/render-raster.mjs <tool-cache-node-dir>
//   env RASTER_BBOX="w,s,e,n"   (default: AO padded, 37.62,48.06,37.88,48.22)
//       RASTER_MINZOOM / RASTER_MAXZOOM (default 10 / 15)
//       RASTER_INNER_BBOX="w,s,e,n" — at RASTER_MAXZOOM only render this box
//                                     (default: RASTER_BBOX; tiles outside it
//                                     404 and Cesium falls back to z-1)

import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const toolDir = process.argv[2];
if (!toolDir) {
  console.error('usage: render-raster.mjs <tool-cache-node-dir>');
  process.exit(2);
}
const require = createRequire(path.join(path.resolve(toolDir), 'package.json'));
const mbgl = require('@maplibre/maplibre-gl-native');
const sharp = require('sharp');
const { PMTiles } = await import(require.resolve('pmtiles'));

const PUBLIC_TILES = path.join(root, 'apps/web/public/tiles');
const PMTILES_PATH = path.join(PUBLIC_TILES, 'avdiivka.pmtiles');
const GLYPHS_DIR = path.join(PUBLIC_TILES, 'glyphs');
const OUT_DIR = path.join(PUBLIC_TILES, 'raster');
const TILE = 512;
const META = 4;
const BUFFER = 256;

const parseBox = (s) => s.split(',').map(Number);
const BBOX = parseBox(process.env.RASTER_BBOX ?? '37.62,48.06,37.88,48.22');
const INNER = process.env.RASTER_INNER_BBOX ? parseBox(process.env.RASTER_INNER_BBOX) : BBOX;
const MINZOOM = Number(process.env.RASTER_MINZOOM ?? 10);
const MAXZOOM = Number(process.env.RASTER_MAXZOOM ?? 15);

// --- Style: the committed MapLibre layers, sources rewritten for Native -----
const spec = JSON.parse(readFileSync(path.join(root, 'apps/web/src/lib/basemap-layers.json'), 'utf8'));
const style = {
  version: 8,
  glyphs: 'glyphs://{fontstack}/{range}',
  sources: {
    [spec.source]: { type: 'vector', tiles: ['pmtiles://avdiivka/{z}/{x}/{y}'], minzoom: 0, maxzoom: 15 },
  },
  layers: spec.layers,
};

// --- PMTiles over a local file ----------------------------------------------
const fh = await open(PMTILES_PATH, 'r');
const fileSource = {
  getKey: () => PMTILES_PATH,
  getBytes: async (offset, length) => {
    const buf = Buffer.alloc(length);
    const { bytesRead } = await fh.read(buf, 0, length, offset);
    return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + bytesRead) };
  },
};
const archive = new PMTiles(fileSource);

function request(req, cb) {
  const url = req.url;
  const t = /^pmtiles:\/\/avdiivka\/(\d+)\/(\d+)\/(\d+)$/.exec(url);
  if (t) {
    archive
      .getZxy(Number(t[1]), Number(t[2]), Number(t[3]))
      .then((r) => cb(null, r ? { data: Buffer.from(r.data) } : {}))
      .catch((e) => cb(e));
    return;
  }
  const g = /^glyphs:\/\/(.+)\/(\d+-\d+)$/.exec(url);
  if (g) {
    const font = decodeURIComponent(g[1]).split(',')[0];
    try {
      cb(null, { data: readFileSync(path.join(GLYPHS_DIR, font, `${g[2]}.pbf`)) });
    } catch {
      cb(null, {}); // range not provisioned: those glyphs are simply absent
    }
    return;
  }
  cb(new Error(`unexpected request ${url}`));
}

// --- Web Mercator helpers (512 px tiles: map zoom z == tile zoom z) ---------
const lon2x = (lon, z) => ((lon + 180) / 360) * 2 ** z;
const lat2y = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};
const x2lon = (x, z) => (x / 2 ** z) * 360 - 180;
const y2lat = (y, z) => {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
};
const tileRange = ([w, s, e, n], z) => ({
  x0: Math.floor(lon2x(w, z)),
  x1: Math.floor(lon2x(e, z)),
  y0: Math.floor(lat2y(n, z)),
  y1: Math.floor(lat2y(s, z)),
});

// Labels only on the levels Cesium shows at working range. Cesium draws a
// coarse level magnified while finer tiles stream in (and keeps it far from
// the camera at −55° pitch), so a z10–13 place label would appear as huge
// blurred text across the AO. Below this zoom the tiles are label-free.
const LABEL_MINZOOM = Number(process.env.RASTER_LABEL_MINZOOM ?? 14);
const unlabelled = { ...style, layers: style.layers.filter((l) => l.type !== 'symbol') };

// One Native map per style: re-loading a style into a map that has rendered
// stalls MapLibre Native's next render.
const maps = new Map();
const render = (opts, s) =>
  new Promise((resolve, reject) => {
    let map = maps.get(s);
    if (!map) {
      map = new mbgl.Map({ request, ratio: 1 });
      map.load(s);
      maps.set(s, map);
    }
    map.render(opts, (err, buf) => (err ? reject(err) : resolve(buf)));
  });

rmSync(OUT_DIR, { recursive: true, force: true });
let count = 0;
let bytes = 0;
for (let z = MINZOOM; z <= MAXZOOM; z++) {
  const zStyle = z >= LABEL_MINZOOM ? style : unlabelled;
  const r = tileRange(z === MAXZOOM ? INNER : BBOX, z);
  for (let mx = r.x0; mx <= r.x1; mx += META) {
    for (let my = r.y0; my <= r.y1; my += META) {
      const size = META * TILE + 2 * BUFFER;
      const cx = mx + META / 2;
      const cy = my + META / 2;
      const raw = await render({ zoom: z, center: [x2lon(cx, z), y2lat(cy, z)], width: size, height: size }, zStyle);
      const img = sharp(raw, { raw: { width: size, height: size, channels: 4 } });
      for (let i = 0; i < META; i++) {
        for (let j = 0; j < META; j++) {
          const x = mx + i;
          const y = my + j;
          if (x > r.x1 || y > r.y1) continue;
          const png = await img
            .clone()
            .extract({ left: BUFFER + i * TILE, top: BUFFER + j * TILE, width: TILE, height: TILE })
            .removeAlpha()
            .png({ palette: true, colours: 96, dither: 0.6, compressionLevel: 9, effort: 8 })
            .toBuffer();
          const dir = path.join(OUT_DIR, String(z), String(x));
          mkdirSync(dir, { recursive: true });
          writeFileSync(path.join(dir, `${y}.png`), png);
          count++;
          bytes += png.length;
        }
      }
    }
  }
  console.log(`[render-raster] z${z} done (${count} tiles, ${(bytes / 1e6).toFixed(1)} MB so far)`);
}
for (const m of maps.values()) m.release();
await fh.close();

// Read by CesiumSpine: imagery extent and levels.
const meta = {
  $comment: 'GENERATED by scripts/basemap/render-raster.mjs. © OpenStreetMap contributors, Protomaps.',
  tileSize: TILE,
  minzoom: MINZOOM,
  maxzoom: MAXZOOM,
  bounds: BBOX,
  innerBounds: INNER,
  labelMinzoom: LABEL_MINZOOM,
  format: 'png',
  attribution: '© OpenStreetMap contributors, Protomaps',
};
writeFileSync(path.join(OUT_DIR, 'tiles.json'), `${JSON.stringify(meta, null, 1)}\n`);
console.log(`[render-raster] ${count} tiles, ${(bytes / 1e6).toFixed(1)} MB -> ${path.relative(root, OUT_DIR)}`);
