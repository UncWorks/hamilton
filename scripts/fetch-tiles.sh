#!/usr/bin/env bash
# fetch-tiles.sh — provision the offline basemap for the Avdiivka AO
# (System Design §6c "Basemap"; NFR-01). Run once, online, before going
# offline. Everything it writes lives under apps/web/public/tiles/, which is
# gitignored (large assets are "sourced separately"); this script is the
# reproducible source.
#
#   1. avdiivka.pmtiles  — vector extract of the Protomaps daily planet build
#                          (OSM, ODbL) for the AO bbox, z0–15.
#   2. glyphs/           — Noto Sans glyph PBFs (OFL-1.1) for the style's three
#                          fontstacks, Latin + Cyrillic ranges only (~2 MB).
#   3. raster/           — Cesium imagery: 512 px PNG tiles rendered locally
#                          from (1) with the same style (MapLibre Native).
#
# Tools (go-pmtiles CLI, MapLibre Native, sharp, pmtiles, @protomaps/basemaps)
# are installed into a cache dir OUTSIDE the repo — none of them are app
# dependencies (NFR-07).
#
# Usage: scripts/fetch-tiles.sh [--no-raster] [--tools-only]
#   PROTOMAPS_BUILD=YYYYMMDD   pin a planet build (default: newest listed)
#   BASEMAP_TOOL_CACHE=dir     tool cache (default: ${TMPDIR:-/tmp}/hamilton-basemap-tools)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TILES="$ROOT/apps/web/public/tiles"
CACHE="${BASEMAP_TOOL_CACHE:-${TMPDIR:-/tmp}/hamilton-basemap-tools}"
CACHE="${CACHE%/}"
NODE_TOOLS="$CACHE/node"

# AO: Avdiivka, the 8-unit km-scale layout (docs/plans/jammer-aoe.md §6). The
# bbox covers every AoE contour and the emitter 90% region the estimator can
# publish for this scenario (37.68–38.26 E, 47.90–48.44 N at 1:15) plus a
# margin, so fitting the camera to an estimate never runs off the map.
BBOX="37.50,47.85,38.35,48.50"
# z15 raster detail only where the units are (B's start, its 1:50 move, A–H);
# outside it Cesium falls back to z14.
INNER_BBOX="37.60,48.05,37.90,48.23"
MAXZOOM=15

PMTILES_VERSION="1.31.2"
# protomaps/basemaps-assets commit holding the glyph PBFs (pinned).
ASSETS_REF="028c18f713baecad011301ff7a69acc39bcc2ae7"
GLYPH_FONTS=("Noto Sans Regular" "Noto Sans Medium" "Noto Sans Italic")
# Basic Latin + Latin-1, Latin Extended-A/B, combining marks, Cyrillic,
# general punctuation (en dash, quotes).
GLYPH_RANGES=("0-255" "256-511" "512-767" "768-1023" "1024-1279" "8192-8447")

RASTER=1
TOOLS_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --no-raster) RASTER=0 ;;
    --tools-only) TOOLS_ONLY=1 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

mkdir -p "$CACHE" "$TILES"

install_pmtiles_cli() {
  local bin="$CACHE/pmtiles-$PMTILES_VERSION"
  if [[ ! -x "$bin" ]]; then
    local os arch
    os="$(uname -s)"
    arch="$(uname -m)"
    [[ "$arch" == "aarch64" ]] && arch="arm64"
    local ext="tar.gz"
    [[ "$os" == "Darwin" ]] && ext="zip"
    local url="https://github.com/protomaps/go-pmtiles/releases/download/v$PMTILES_VERSION/go-pmtiles-${PMTILES_VERSION}_${os}_${arch}.${ext}"
    echo "[fetch-tiles] downloading go-pmtiles $PMTILES_VERSION ($os/$arch)" >&2
    local tmp
    tmp="$(mktemp -d)"
    curl -fsSL -o "$tmp/pm.$ext" "$url"
    if [[ "$ext" == "zip" ]]; then
      unzip -q -o "$tmp/pm.$ext" -d "$tmp"
    else
      tar -xzf "$tmp/pm.$ext" -C "$tmp"
    fi
    mv "$tmp/pmtiles" "$bin"
    rm -rf "$tmp"
  fi
  echo "$bin"
}

install_node_tools() {
  if [[ ! -d "$NODE_TOOLS/node_modules/@maplibre/maplibre-gl-native" ]]; then
    echo "[fetch-tiles] installing render tools into $NODE_TOOLS" >&2
    mkdir -p "$NODE_TOOLS"
    [[ -f "$NODE_TOOLS/package.json" ]] || echo '{"name":"hamilton-basemap-tools","private":true}' >"$NODE_TOOLS/package.json"
    (cd "$NODE_TOOLS" && npm install --no-audit --no-fund --silent \
      @maplibre/maplibre-gl-native@6.4.1 \
      sharp@0.35.5 \
      pmtiles@4.5.0 \
      @protomaps/basemaps@5.7.2)
  fi
}

if [[ $TOOLS_ONLY -eq 1 ]]; then
  install_pmtiles_cli >/dev/null
  install_node_tools
  echo "$NODE_TOOLS"
  exit 0
fi

# --- 1. Vector extract --------------------------------------------------------
PM="$(install_pmtiles_cli)"
BUILD="${PROTOMAPS_BUILD:-}"
if [[ -z "$BUILD" ]]; then
  BUILD="$(curl -fsSL https://build-metadata.protomaps.dev/builds.json \
    | grep -o '"key":"[0-9]\{8\}\.pmtiles"' | tail -1 | grep -o '[0-9]\{8\}')"
fi
echo "[fetch-tiles] extracting $BBOX z0-$MAXZOOM from Protomaps build $BUILD"
"$PM" extract "https://build.protomaps.com/$BUILD.pmtiles" "$TILES/avdiivka.pmtiles.tmp" \
  --bbox="$BBOX" --maxzoom="$MAXZOOM" >/dev/null 2>&1
mv "$TILES/avdiivka.pmtiles.tmp" "$TILES/avdiivka.pmtiles"
echo "$BUILD" >"$TILES/avdiivka.build"

# --- 2. Glyphs ----------------------------------------------------------------
for font in "${GLYPH_FONTS[@]}"; do
  mkdir -p "$TILES/glyphs/$font"
  enc="${font// /%20}"
  for range in "${GLYPH_RANGES[@]}"; do
    out="$TILES/glyphs/$font/$range.pbf"
    [[ -s "$out" ]] && continue
    curl -fsSL -o "$out" \
      "https://raw.githubusercontent.com/protomaps/basemaps-assets/$ASSETS_REF/fonts/$enc/$range.pbf"
  done
done
echo "[fetch-tiles] glyphs: ${#GLYPH_FONTS[@]} fontstacks x ${#GLYPH_RANGES[@]} ranges"

# --- 3. Raster pyramid for Cesium -----------------------------------------------
if [[ $RASTER -eq 1 ]]; then
  install_node_tools
  RASTER_BBOX="$BBOX" RASTER_INNER_BBOX="$INNER_BBOX" \
    node "$ROOT/scripts/basemap/render-raster.mjs" "$NODE_TOOLS"
fi

du -sh "$TILES/avdiivka.pmtiles" "$TILES/glyphs" "$TILES/raster" 2>/dev/null || true
echo "[fetch-tiles] done. Attribution: © OpenStreetMap contributors, Protomaps"
