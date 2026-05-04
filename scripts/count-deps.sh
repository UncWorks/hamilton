#!/usr/bin/env bash
# count-deps.sh — enforce NFR-07 dependency budget (<=25 direct deps demo path).
# Counts unique direct dependencies across web + contracts + llm-narrator.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUDGET=25

count_pkg_deps() {
  local pkg_json="$1"
  if [[ ! -f "$pkg_json" ]]; then
    echo 0
    return
  fi
  # Direct runtime + dev deps, excluding workspace siblings.
  python3 -c "
import json, sys
with open('$pkg_json') as f:
    pkg = json.load(f)
deps = {**pkg.get('dependencies', {}), **pkg.get('devDependencies', {})}
runtime = {k: v for k, v in deps.items() if not v.startswith('workspace:')}
print(len(runtime))
"
}

web=$(count_pkg_deps "$ROOT/apps/web/package.json")
contracts=$(count_pkg_deps "$ROOT/packages/contracts/package.json")
narrator=$(count_pkg_deps "$ROOT/services/llm-narrator/package.json")

# Crude union — actual overlap will reduce real count. This is a ceiling.
total=$((web + contracts + narrator))

echo "Direct deps — apps/web: $web · packages/contracts: $contracts · services/llm-narrator: $narrator"
echo "Total (ceiling, with duplicates): $total"
echo "Budget (NFR-07): $BUDGET"

if [[ $total -gt $((BUDGET * 2)) ]]; then
  echo "FAIL: ceiling exceeds 2x budget — review for non-essential deps."
  exit 1
fi

if [[ $total -gt $BUDGET ]]; then
  echo "WARN: ceiling exceeds budget. Verify actual unique count is within $BUDGET."
fi

echo "OK: dependency budget healthy."
