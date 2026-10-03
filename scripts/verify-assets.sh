#!/usr/bin/env bash
# verify-assets.sh — fail CI if any demo-path asset is missing.
# Per Tech Stack §"Render-spine swap — Sunday provisioning checklist".

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
errors=0

check_file() {
  local path="$1"
  local desc="$2"
  if [[ ! -e "$ROOT/$path" ]]; then
    echo "MISSING: $path ($desc)"
    errors=$((errors + 1))
  fi
}

# Phase 0 — only the contracts and the fingerprint library are required.
check_file "assets/fingerprints/library.json" "FR-04a fingerprint library"
check_file "packages/contracts/src/index.ts" "TypeScript MQTT contracts"
check_file "packages/contracts-rs/src/lib.rs" "Rust MQTT contracts mirror"
check_file "infra/docker/docker-compose.yml" "Docker compose orchestration"

# Phase 3+ — fonts. Fail soft for now (warn only) since fonts arrive in Phase 3.
warn_file() {
  local path="$1"
  local desc="$2"
  if [[ ! -e "$ROOT/$path" ]]; then
    echo "WARN: $path missing ($desc) — required by Phase 3"
  fi
}

warn_file "apps/web/public/fonts/InterTight-Variable.woff2" "Inter Tight (Söhne substitute)"
warn_file "apps/web/public/fonts/JetBrainsMono-Regular.woff2" "JetBrains Mono (Berkeley Mono fallback)"

# Basemap (System Design §6c, apps/web/src/lib/basemap.ts). Provisioned by
# `make fetch-tiles` (gitignored). Required when NEXT_PUBLIC_BASEMAP=offline;
# when unset the app resolves offline only if the PMTiles exist, else none.
BASEMAP_FILES=(
  "apps/web/public/tiles/avdiivka.pmtiles|MapLibre vector basemap (Protomaps extract)"
  "apps/web/public/tiles/glyphs/Noto Sans Regular/0-255.pbf|basemap label glyphs (Regular)"
  "apps/web/public/tiles/glyphs/Noto Sans Medium/0-255.pbf|basemap label glyphs (Medium)"
  "apps/web/public/tiles/glyphs/Noto Sans Italic/0-255.pbf|basemap label glyphs (Italic)"
  "apps/web/public/tiles/raster/tiles.json|Cesium raster imagery pyramid"
)
BASEMAP="${NEXT_PUBLIC_BASEMAP:-}"
case "$BASEMAP" in
  offline)
    for entry in "${BASEMAP_FILES[@]}"; do
      check_file "${entry%%|*}" "${entry#*|} — NEXT_PUBLIC_BASEMAP=offline; run make fetch-tiles"
    done
    ;;
  online)
    echo "WARN: NEXT_PUBLIC_BASEMAP=online — dev-only OSM tiles, NOT NFR-01 compliant"
    ;;
  none) ;;
  "")
    if [[ -e "$ROOT/apps/web/public/tiles/avdiivka.pmtiles" ]]; then
      # Default resolves to offline: the rest of the set must be there too.
      for entry in "${BASEMAP_FILES[@]}"; do
        check_file "${entry%%|*}" "${entry#*|} — basemap defaults to offline; run make fetch-tiles"
      done
    else
      echo "WARN: basemap assets not provisioned — COP renders without a basemap (run make fetch-tiles)"
    fi
    ;;
  *)
    echo "INVALID: NEXT_PUBLIC_BASEMAP=$BASEMAP (expected offline|online|none)"
    errors=$((errors + 1))
    ;;
esac

# Phase 5+ — Cesium 3D Tiles + glTF jammer models
warn_file "apps/web/public/cesium/tileset.json" "Cesium 3D Tiles tileset"
warn_file "apps/web/public/cesium/jammers/r-330zh-zhitel.glb" "R-330Zh Zhitel glTF stand-in"
warn_file "apps/web/public/cesium/jammers/pole-21.glb" "Pole-21 glTF stand-in"

if [[ $errors -gt 0 ]]; then
  echo ""
  echo "FAIL: $errors required asset(s) missing."
  exit 1
fi

echo "OK: all required Phase 0 assets present."
