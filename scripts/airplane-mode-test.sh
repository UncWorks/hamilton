#!/usr/bin/env bash
# airplane-mode-test.sh — verify no external network during a demo run.
# NFR-01 enforcement.
#
# Strategy: snapshot all process-level outbound TCP connections, run the
# demo for 30s, snapshot again. Any new external destination (anything not
# 127.0.0.1, ::1, or the docker bridge) is a NFR-01 violation.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if ! command -v lsof >/dev/null 2>&1; then
  echo "FAIL: lsof not available; cannot run airplane-mode test"
  exit 1
fi

echo "starting demo stack…"
make -C "$ROOT" up >/dev/null

trap 'make -C "$ROOT" down >/dev/null 2>&1 || true' EXIT

sleep 5

snapshot() {
  lsof -nP -iTCP -sTCP:ESTABLISHED 2>/dev/null \
    | awk 'NR>1 {print $9}' \
    | grep -v -E '127\.0\.0\.1|::1|172\.(17|18|19|20)\.' \
    | sort -u
}

echo "snapshot 1…"
A=$(snapshot)
sleep 25
echo "snapshot 2…"
B=$(snapshot)

DIFF=$(comm -13 <(echo "$A") <(echo "$B"))
if [[ -n "$DIFF" ]]; then
  echo "FAIL: new external connections detected during demo:"
  echo "$DIFF"
  exit 1
fi

echo "OK: no external network activity during 30s demo window."
