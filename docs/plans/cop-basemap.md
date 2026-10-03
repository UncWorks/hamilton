# Plan — COP basemap (both spines)

Status: implemented on `feat/cop-basemap` (stacked on PR #3,
`feat/cop-camera-declutter`). Decision record: System Design §6c.1.

## Problem

The COP showed symbols on a dark, empty globe. Nothing was broken: no
basemap had ever been wired.

- `CesiumSpine.tsx` built the viewer with `baseLayer: false`, an empty ion
  token and `EllipsoidTerrainProvider`. That was deliberate for NFR-01, but it
  left the globe with no imagery at all.
- `apps/web/public/tiles/` was empty. The planned `avdiivka.pmtiles` was never
  provisioned, and `verify-assets.sh` only warned about it.
- `MapSpine.tsx` imported `maplibre-gl` but drew deck.gl on a blank canvas.

## Decision

Use one data source and one style for both spines, served from the same
origin.

| | MapLibre spine | Cesium spine |
|---|---|---|
| Data | `/tiles/avdiivka.pmtiles`: Protomaps planet extract, bbox 37.60–37.90 E / 48.05–48.23 N, z0–15 | same extract, rendered to raster |
| Drawing | `maplibre-gl` + `pmtiles://` protocol (vector) | `UrlTemplateImageryProvider` on `/tiles/raster/{z}/{x}/{y}.png`, 512 px, z10–15, rectangle-limited |
| Style | `src/lib/basemap-layers.json`, generated from `@protomaps/basemaps` "dark" and re-coloured with the Hamilton tokens | the same JSON, rendered by MapLibre Native (`scripts/basemap/render-raster.mjs`) |
| Labels | Noto Sans glyph PBFs from `/tiles/glyphs` | baked into the z14–15 tiles; z10–13 are label-free, so no giant blurred text shows while the finer tiles stream in |
| deck.gl / symbols | `@deck.gl/mapbox` `MapboxOverlay` (overlaid) for the ring and the bearing line. MapLibre owns the camera; every `move` is mirrored with `flushSync` into the controlled `viewState` that projects the SVG symbol overlay | unchanged (billboards + SpineOverlay) |

### Cesium options considered

The brief listed these in order of preference.

1. **Offline raster from a redistributable source. Chosen**, by rendering
   our own PMTiles extract. It brings no new licence, the 2D and 3D maps match
   pixel for pixel in style, and the pyramid is ~10 MB. Rendering the whole
   pyramid takes ~20 s.
2. EOX Sentinel-2 cloudless 2016 (CC BY 4.0). Not needed. Satellite imagery
   would also need heavy darkening to stay behind the symbols, and it would not
   match the 2D map.
3. Online OSM raster. Kept only as `NEXT_PUBLIC_BASEMAP=online`, which is
   dev-only and not NFR-01 compliant. The CSP opens `tile.openstreetmap.org`
   in that mode only. Cesium dims it (brightness 0.32, saturation 0.15) and
   MapLibre dims it with raster paint properties.

### Style tuning (Branding §3)

- Land / earth sits at L 16.5–17 against `--surface-base` at L 14. Parks and
  woods take a faint green tint at L 19–20. Water is L 25 with a blue tint.
  Buildings are L 22.5.
- Roads are neutral grey: other 26, minor 29, link 31, major 35, highway 40.
  Casings sit at earth level, so they read as part of the ground.
- Place labels use `--text-secondary` (L 78). Sub-place labels use
  `--text-tertiary`. Road labels are L 56. Every label has a 1.25 px
  `--surface-base` halo. Labels are in English, falling back to the local name.
- The style drops POIs, road shields, one-way arrows, address labels and the
  town dot, so it needs no sprite sheet.

## Configuration

- `NEXT_PUBLIC_BASEMAP=offline|online|none`. When unset, `next.config.mjs`
  and `.storybook/main.ts` default to `offline` if
  `public/tiles/avdiivka.pmtiles` exists, and to `none` otherwise. It is
  documented in `.env.example` and in the `web` service of
  `infra/docker/docker-compose.yml`.
- Both spines also take a `basemap` prop that overrides the env value. The
  stories use it.
- `scripts/verify-assets.sh` now fails if the mode is offline and the
  PMTiles, the 0-255 glyph range of any fontstack, or `raster/tiles.json` is
  missing. "Offline" can be set explicitly or reached by default. An invalid
  mode also fails the check.

## Assets and storage

| Asset | Size | Licence |
|---|---|---|
| `tiles/avdiivka.pmtiles` | 4.1 MB | © OpenStreetMap contributors, ODbL 1.0, via Protomaps |
| `tiles/glyphs/` (3 fontstacks × 6 ranges) | 1.6 MB | Noto Sans, OFL-1.1 |
| `tiles/raster/` (746 tiles + `tiles.json`) | ~10–11 MB | derived from the OSM data above |
| **Total** | **~17 MB** | |

`apps/web/public/tiles/*` was already gitignored ("large assets … sourced
separately"), so the binaries are **not committed**.
`make fetch-tiles` (`scripts/fetch-tiles.sh`) reproduces them in about 25 s.
It works as follows:

1. It downloads the go-pmtiles CLI v1.31.2 into a temp tool cache.
2. It extracts the bbox from the newest Protomaps daily build (or
   `PROTOMAPS_BUILD=YYYYMMDD`) and records the build date in
   `tiles/avdiivka.build`.
3. It fetches the glyph ranges from a pinned `protomaps/basemaps-assets`
   commit.
4. It installs MapLibre Native, sharp, pmtiles and `@protomaps/basemaps` into
   the cache, outside the repo, and renders the raster pyramid.

`make basemap-style` regenerates the committed style JSON and re-renders the
raster.

The attribution "© OpenStreetMap contributors, Protomaps" appears
bottom-right on both spines.

## Dependencies (NFR-07)

- Runtime: `pmtiles@4.5.0` is the only addition (+1; its own dependency is
  `fflate`). `@deck.gl/mapbox` and `maplibre-gl` were already listed.
- Unique runtime direct dependencies across web, contracts and llm-narrator
  go from 14 to **15**, within the budget of 25.
- `scripts/count-deps.sh`, which counts dev and runtime dependencies with
  duplicates, goes from 32 to 33.
- The style generator and the renderer are build-time tools installed into a
  temp cache. They are not dependencies of any workspace package.

## Legibility check (T5)

`scripts/basemap/contrast-check.mjs` computes grayscale WCAG contrast for
every COP symbol colour against the real basemap pixels. It samples the z14 +
z15 raster tiles around the units and the jammer: 4.19 M pixels, p50
rgb(12,15,18), p95 rgb(17,28,25), p99 rgb(43,44,45).

| colour | flat surface | p95 pixel | p99 pixel | pixels ≥ 3:1 |
|---|---|---|---|---|
| ink frame stroke | 14.82 | 12.96 | 10.39 | 100 % |
| stale ink | 4.65 | 4.06 | 3.26 | 99.1 % |
| friend fill | 5.52 | 4.83 | 3.87 | 99.4 % |
| hostile fill | 4.47 | 3.91 | 3.13 | 99.1 % |
| neutral fill | 6.85 | 5.99 | 4.80 | 99.6 % |
| unknown fill | 13.27 | 11.60 | 9.31 | 100 % |
| trust gauges (nominal … failed-stroke) | 13.42 … 5.16 | 11.73 … 4.52 | 9.41 … 3.62 | 99.2–100 % |
| jammer ring outline (α 0.6) | 4.09 | 3.96 | 3.50 | 99.4 % |
| bearing line (α 0.43) | 2.63 | 2.67 | 2.50 | 0 % |

Every symbol colour clears 3:1 against at least 99 % of AO pixels. The
failing ≤ 1 % are pixels of label text and highway cores. The frame's ink
stroke clears 3:1 against every pixel.

The bearing line was already at 2.63:1 on the flat surface. Its 40 % opacity
is specified in Branding §10.3, and the basemap does not change the result.
It is a pre-existing open item, not a regression.

## Verification

- `pnpm typecheck` passes.
- `pnpm --filter @hamilton/web test` passes 54/54.
- `next build` passes.
- `build-storybook` finishes with zero errors.
- `verify-assets.sh` passes in the default, offline and none modes. It fails
  as intended when the mode is offline and the raster is missing.
- Live checks in Chrome:
  - `next dev` on :3001 with both renderers, against the shared broker.
  - Storybook on :6014 with `COP/MapSpine › Failed`,
    `COP/CesiumSpine › Jammer overlay` and `Basemap off`.
  - With MapLibre, the symbol hit targets land on `map.project()` of their
    coordinates to within 0.01 px, before and after a pan. A pan switches to
    MANUAL, and F re-fits.
  - Cesium shows the same style draped at −55°, with the camera fit framing A,
    B, C and J1.
