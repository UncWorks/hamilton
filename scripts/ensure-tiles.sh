#!/usr/bin/env bash
# ensure-tiles.sh — provision the offline basemap for `make demo` / `make up`
# if it is missing. The Makefile only calls this when
# apps/web/public/tiles/raster/tiles.json (written last by fetch-tiles.sh) is
# absent, and not at all when NEXT_PUBLIC_BASEMAP is none or online.
#
# If the fetch cannot run (offline, or no Node/npm/curl/unzip on the host),
# the demo still starts, WITHOUT a basemap (symbols on --surface-base), and
# says so loudly. Reason: the basemap is context, not the subject of the demo
# (the trust scores, TSS gate and AoE estimate all work without it), and a
# presenter offline at the venue is better served by a running COP than by a
# failed make. Nothing is marked done, so the next `make demo` retries.
# BASEMAP_REQUIRED=1 turns the fallback into a hard failure.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TILES="$ROOT/apps/web/public/tiles"
SENTINEL="$TILES/raster/tiles.json"

[[ -f "$SENTINEL" ]] && exit 0

fallback() {
  # A partial fetch must not look provisioned: the web picks "offline" when
  # avdiivka.pmtiles exists (apps/web/next.config.mjs).
  rm -f "$TILES/avdiivka.pmtiles" "$TILES/avdiivka.pmtiles.tmp"
  {
    echo
    echo "=================================================================="
    echo " Basemap NOT provisioned: $1"
    echo " The demo will run WITHOUT a basemap (NEXT_PUBLIC_BASEMAP=none)."
    echo " Fix (first run only): network access + Node 20+ on the host, then"
    echo "      make demo        (or: make fetch-tiles)"
    echo " To skip this check: make demo NEXT_PUBLIC_BASEMAP=none"
    echo "=================================================================="
    echo
  } >&2
  [[ "${BASEMAP_REQUIRED:-}" == "1" ]] && exit 1
  exit 0
}

missing=()
for tool in curl unzip node npm; do
  command -v "$tool" >/dev/null 2>&1 || missing+=("$tool")
done
((${#missing[@]})) && fallback "missing host tools: ${missing[*]} (Node 20+ renders the raster tiles)"

if ! curl -fsS -m 10 -o /dev/null https://build-metadata.protomaps.dev/builds.json; then
  fallback "no network (build-metadata.protomaps.dev unreachable)"
fi

echo "[make] provisioning the offline basemap (first run only; a few minutes)" >&2
start=$(date +%s)
if ! bash "$ROOT/scripts/fetch-tiles.sh"; then
  fallback "scripts/fetch-tiles.sh failed (see the output above)"
fi
[[ -f "$SENTINEL" ]] || fallback "fetch-tiles.sh finished without $SENTINEL"
echo "[make] basemap provisioned in $(($(date +%s) - start)) s" >&2
