#!/usr/bin/env bash
# check-no-truth.sh: HS-20 / FR-06a (2) / FR-04b (10) bus guard (plan row W27).
#
# Runs the comms-sim Avdiivka scenario against a throwaway Mosquitto broker
# (random localhost port, removed on exit), captures every message on '#',
# and fails if any of these appear on the bus:
#   - a truth.json site coordinate (lat or lon) at 3, 4 or 5 dp, as any
#     numeric value in a payload or as text in a topic or payload;
#   - the keys `mode` or `bearings_used` (K4: absent from the MVP schemas);
#   - a truth keyword (truth, eirp, mast, shadow, sector, back_db, emitter
#     truth fields) in a topic, a key or a string value;
#   - `effective_range_km` in any `rf` block.
#
# The engine is not started: the sim is the only process that knows the
# truth. The comms-sim unit test tests/test_truth_isolation.py checks the
# same in-process; this script checks what really reaches a broker.
#
# Needs docker and services/comms-sim/.venv (pip install -e '.[dev]').
# Env: COMMS_SIM_VENV (default services/comms-sim/.venv),
#      CHECK_NO_TRUTH_SPEED (default 30), CHECK_NO_TRUTH_DURATION (default 150).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="${COMMS_SIM_VENV:-$ROOT/services/comms-sim/.venv}"
SPEED="${CHECK_NO_TRUTH_SPEED:-30}"
DURATION="${CHECK_NO_TRUTH_DURATION:-150}"
NAME="hamilton-no-truth-$$"
WORK="$(mktemp -d)"
SUB_PID=""

cleanup() {
  [[ -n "$SUB_PID" ]] && kill "$SUB_PID" 2>/dev/null || true
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

if [[ ! -x "$VENV/bin/comms-sim" ]]; then
  echo "check-no-truth: no comms-sim at $VENV/bin (create the venv first)" >&2
  exit 2
fi
command -v docker >/dev/null || { echo "check-no-truth: docker is required" >&2; exit 2; }

docker run -d --rm --name "$NAME" -p 127.0.0.1::1883 \
  -v "$ROOT/infra/docker/mosquitto/mosquitto.conf:/mosquitto/config/mosquitto.conf:ro" \
  eclipse-mosquitto:2.0 >/dev/null
PORT="$(docker port "$NAME" 1883/tcp | head -1 | sed 's/.*://')"

for _ in $(seq 1 50); do
  docker exec "$NAME" mosquitto_pub -t hamilton/broker-ready -n >/dev/null 2>&1 && break
  sleep 0.2
done

# One line per message: "<topic> <payload>" (topics carry no spaces).
docker exec "$NAME" mosquitto_sub -t '#' -v -q 1 >"$WORK/capture.txt" 2>/dev/null &
SUB_PID=$!
sleep 1

(cd "$ROOT/services/comms-sim" && MQTT_BROKER_URL="mqtt://127.0.0.1:$PORT" \
  "$VENV/bin/comms-sim" --scenario avdiivka --speed "$SPEED" --duration "$DURATION" \
  --truth-out "$WORK/truth.json" >"$WORK/sim.log" 2>&1) || {
  echo "check-no-truth: comms-sim failed" >&2
  tail -20 "$WORK/sim.log" >&2
  exit 2
}
sleep 1
kill "$SUB_PID" 2>/dev/null || true
wait "$SUB_PID" 2>/dev/null || true
SUB_PID=""

python3 - "$WORK/truth.json" "$WORK/capture.txt" <<'PY'
import json
import re
import sys

truth = json.load(open(sys.argv[1]))
lines = [l.rstrip("\n") for l in open(sys.argv[2]) if l.strip()]
if not lines:
    sys.exit("check-no-truth: captured nothing (broker or sim problem)")

coords = {"lat": float(truth["lat"]), "lon": float(truth["lon"])}
# Text forms of the site coordinates at 3, 4 and 5 dp, as whole tokens.
text_forms = {f"{name}@{dp}dp": f"{v:.{dp}f}" for name, v in coords.items() for dp in (3, 4, 5)}
banned_keys = {"mode", "bearings_used"}
keyword = re.compile(r"truth|eirp|mast|shadow|sector|back_db|emitter_truth|hidden", re.I)

failures = []
topics = set()

def walk(obj, path, topic):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in banned_keys:
                failures.append(f"{topic}: key '{k}' at {path or '.'}")
            if keyword.search(k):
                failures.append(f"{topic}: truth keyword in key '{k}' at {path or '.'}")
            if k == "rf" and isinstance(v, dict) and "effective_range_km" in v:
                failures.append(f"{topic}: rf.effective_range_km at {path or '.'}")
            walk(v, f"{path}.{k}", topic)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            walk(v, f"{path}[{i}]", topic)
    elif isinstance(obj, bool):
        return
    elif isinstance(obj, (int, float)):
        for name, v in coords.items():
            for dp in (3, 4, 5):
                if round(float(obj), dp) == round(v, dp):
                    failures.append(f"{topic}: {path} = {obj} equals truth {name} at {dp} dp")
                    break
    elif isinstance(obj, str):
        if keyword.search(obj):
            failures.append(f"{topic}: truth keyword in string at {path}: {obj[:80]!r}")

for line in lines:
    topic, _, payload = line.partition(" ")
    topics.add(topic)
    if keyword.search(topic):
        failures.append(f"topic name carries a truth keyword: {topic}")
    for label, form in text_forms.items():
        if re.search(rf"(?<![0-9]){re.escape(form)}(?![0-9])", line):
            failures.append(f"{topic}: text {form} ({label})")
    if not payload or payload == "(null)":  # mosquitto_sub -v prints an empty payload as (null)
        continue
    try:
        body = json.loads(payload)
    except json.JSONDecodeError:
        failures.append(f"{topic}: non-JSON payload {payload[:80]!r}")
        continue
    walk(body, "", topic)

print(f"check-no-truth: {len(lines)} messages on {len(topics)} topics; "
      f"truth site {coords['lat']:.5f}, {coords['lon']:.5f} (3/4/5 dp)")
if failures:
    uniq = sorted(set(failures))
    print(f"check-no-truth: FAIL ({len(uniq)} distinct findings)", file=sys.stderr)
    for f in uniq[:40]:
        print("  " + f, file=sys.stderr)
    sys.exit(1)
print("check-no-truth: OK (no truth coordinate, mode, bearings_used or truth keyword on the bus)")
PY
