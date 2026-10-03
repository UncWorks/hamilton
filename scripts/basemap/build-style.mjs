#!/usr/bin/env node
// build-style.mjs — regenerate apps/web/src/lib/basemap-layers.json, the
// Hamilton dark basemap style layers (System Design §6c "Basemap").
//
// Derived from the Protomaps basemap "dark" flavor (@protomaps/basemaps,
// BSD-3-Clause), re-coloured with the Hamilton tokens (Branding §3) so the
// map recedes and the track symbols stay the visual priority:
//   - land / landuse / buildings sit within a few L* of --surface-base;
//   - roads are neutral greys, highways the brightest at L 40% (symbols are
//     drawn in --sym-ink at L 90%);
//   - place labels are --text-secondary / --text-tertiary with a
//     --surface-base halo — readable, never brighter than the symbol ink.
// Sprite-dependent layers (POI icons, road shields, one-way arrows, the
// town dot) and address labels are dropped: the style needs no sprite sheet,
// only the self-hosted glyph PBFs (NFR-01). Labels are English, falling back
// to the local name.
//
// Dev tooling only — @protomaps/basemaps is installed into the basemap tool
// cache by scripts/fetch-tiles.sh, never into apps/web (NFR-07). The output
// JSON is committed; `make basemap-style` re-runs this.
//
// Usage: node scripts/basemap/build-style.mjs <tool-cache-node-dir>

import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const toolDir = process.argv[2];
if (!toolDir) {
  console.error('usage: build-style.mjs <tool-cache-node-dir>');
  process.exit(2);
}
const require = createRequire(path.join(path.resolve(toolDir), 'package.json'));
const basemaps = require('@protomaps/basemaps');
const SOURCE = 'protomaps';

// --- OKLCH -> sRGB hex (CSS Color 4 reference math) -------------------------
function oklch(l, c, hDeg, alpha = 1) {
  const h = (hDeg * Math.PI) / 180;
  const L = l / 100;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const [lc, mc, sc] = [l_ ** 3, m_ ** 3, s_ ** 3];
  const lin = [
    4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
    -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
    -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc,
  ];
  const enc = (x) => {
    const v = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
  };
  const [r, g, bl] = lin.map(enc);
  if (alpha < 1) return `rgba(${r}, ${g}, ${bl}, ${alpha})`;
  return `#${[r, g, bl].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// --- Hamilton palette ---------------------------------------------------------
const N = 250; // the surface hue (Branding §3.1: 1% blue undertone)
const surfaceBase = oklch(14, 0.01, N); //   --surface-base
const earth = oklch(16.5, 0.008, N);
const urban = oklch(17, 0.006, N);
const green = oklch(19, 0.02, 160);
const greenDeep = oklch(20, 0.025, 160);
const muted = oklch(18, 0.006, N);
const water = oklch(25, 0.04, 240);
const buildings = oklch(22.5, 0.008, N);
const casing = earth;
const roadOther = oklch(26, 0.005, N);
const roadMinor = oklch(29, 0.005, N);
const roadLink = oklch(31, 0.006, N);
const roadMajor = oklch(35, 0.006, N);
const roadHighway = oklch(40, 0.008, N);
const tunnel = oklch(24, 0.005, N);
const labelPlace = oklch(78, 0.008, 90); //  --text-secondary
const labelSub = oklch(58, 0.01, 90); //     --text-tertiary
const labelRoad = oklch(56, 0.008, 90);
const labelWater = oklch(58, 0.035, 240);

const flavor = {
  ...basemaps.namedFlavor('dark'),
  background: surfaceBase,
  earth,
  park_a: green,
  park_b: greenDeep,
  hospital: muted,
  industrial: muted,
  school: muted,
  wood_a: greenDeep,
  wood_b: greenDeep,
  pedestrian: muted,
  scrub_a: green,
  scrub_b: green,
  glacier: muted,
  sand: muted,
  beach: muted,
  aerodrome: muted,
  runway: roadOther,
  water,
  zoo: muted,
  military: oklch(17.5, 0.01, 60),
  tunnel_other_casing: casing,
  tunnel_minor_casing: casing,
  tunnel_link_casing: casing,
  tunnel_major_casing: casing,
  tunnel_highway_casing: casing,
  tunnel_other: tunnel,
  tunnel_minor: tunnel,
  tunnel_link: tunnel,
  tunnel_major: tunnel,
  tunnel_highway: tunnel,
  pier: roadOther,
  buildings,
  minor_service_casing: casing,
  minor_casing: casing,
  link_casing: casing,
  major_casing_late: casing,
  highway_casing_late: casing,
  other: roadOther,
  minor_service: roadOther,
  minor_a: roadMinor,
  minor_b: roadMinor,
  link: roadLink,
  major_casing_early: casing,
  major: roadMajor,
  highway_casing_early: casing,
  highway: roadHighway,
  railway: oklch(36, 0.005, N),
  boundaries: oklch(40, 0.02, N),
  bridges_other_casing: casing,
  bridges_minor_casing: casing,
  bridges_link_casing: casing,
  bridges_major_casing: casing,
  bridges_highway_casing: casing,
  bridges_other: roadOther,
  bridges_minor: roadMinor,
  bridges_link: roadLink,
  bridges_major: roadMajor,
  bridges_highway: roadHighway,
  roads_label_minor: labelRoad,
  roads_label_minor_halo: surfaceBase,
  roads_label_major: labelRoad,
  roads_label_major_halo: surfaceBase,
  ocean_label: labelWater,
  subplace_label: labelSub,
  subplace_label_halo: surfaceBase,
  city_label: labelPlace,
  city_label_halo: surfaceBase,
  state_label: labelSub,
  state_label_halo: surfaceBase,
  country_label: labelSub,
  address_label: labelSub,
  address_label_halo: surfaceBase,
  landcover: {
    grassland: green,
    barren: urban,
    urban_area: urban,
    farmland: oklch(17, 0.01, 140),
    glacier: muted,
    scrub: green,
    forest: greenDeep,
  },
};

const DROP = new Set(['pois', 'roads_shields', 'roads_oneway', 'address_label']);
const NAME = ['coalesce', ['get', 'name:en'], ['get', 'name']];

const layers = basemaps
  .layers(SOURCE, flavor, { lang: 'en' })
  .filter((l) => !DROP.has(l.id))
  .map((l) => {
    if (l.type !== 'symbol') return l;
    const layout = { ...l.layout };
    // No sprite sheet: drop the town dot (places_locality icon).
    delete layout['icon-image'];
    delete layout['icon-size'];
    delete layout['icon-padding'];
    // One line, English first. Keeps the glyph set to Latin + Cyrillic.
    if (JSON.stringify(layout['text-field'] ?? '').includes('name')) layout['text-field'] = NAME;
    if (l.id === 'places_locality') {
      layout['text-font'] = ['Noto Sans Medium'];
      // No icon to offset from any more.
      delete layout['text-variable-anchor'];
      delete layout['text-radial-offset'];
      delete layout['text-justify'];
    }
    const paint = { ...l.paint };
    if ('text-halo-width' in paint) paint['text-halo-width'] = 1.25;
    return { ...l, layout, paint };
  });

const fonts = new Set();
for (const l of layers) {
  for (const m of JSON.stringify(l.layout?.['text-font'] ?? []).matchAll(/Noto Sans [A-Za-z]+/g)) fonts.add(m[0]);
}

const out = {
  $comment:
    'GENERATED by scripts/basemap/build-style.mjs from @protomaps/basemaps (BSD-3-Clause) "dark" flavor, re-coloured with Hamilton tokens. Do not edit by hand.',
  source: SOURCE,
  fonts: [...fonts].sort(),
  background: surfaceBase,
  layers,
};
const dest = path.join(root, 'apps/web/src/lib/basemap-layers.json');
writeFileSync(dest, `${JSON.stringify(out, null, 1)}\n`);
console.log(`[build-style] ${layers.length} layers, fonts ${out.fonts.join(', ')} -> ${path.relative(root, dest)}`);
