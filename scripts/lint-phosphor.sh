#!/usr/bin/env bash
# lint-phosphor.sh — fail CI if phosphor green leaks outside semantic tokens.
# R-phosphor-overuse mitigation per Branding §13.
#
# Phosphor green is oklch(85% 0.18 145). It may appear ONLY in:
#   - --trust-nominal (gradient endpoint)
#   - --gating-secondary (focus state on modal options)
#   - the gradient interpolation function in the trust-decay code path
#
# Any other use is a design bug.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SEARCH_DIRS=("apps/web/src" "apps/web/app" "apps/web/styles")

# Files where the phosphor literal is permitted (the source of truth tokens).
ALLOWLIST=(
  "tokens.css"
  "trust-gradient.ts"
  "trust-gradient.tsx"
)

violations=0
while IFS= read -r match; do
  [[ -z "$match" ]] && continue
  file="${match%%:*}"
  basename="$(basename "$file")"
  allowed=0
  for ok in "${ALLOWLIST[@]}"; do
    if [[ "$basename" == "$ok" ]]; then
      allowed=1
      break
    fi
  done
  if [[ $allowed -eq 0 ]]; then
    echo "PHOSPHOR LEAK: $match"
    violations=$((violations + 1))
  fi
done < <(
  for dir in "${SEARCH_DIRS[@]}"; do
    if [[ -d "$ROOT/$dir" ]]; then
      grep -rn -E 'oklch\(\s*85%\s*0?\.18\s*145' "$ROOT/$dir" 2>/dev/null || true
    fi
  done
)

if [[ $violations -gt 0 ]]; then
  echo ""
  echo "FAIL: phosphor green used outside --trust-nominal / --gating-secondary."
  echo "See Branding §13 R-phosphor-overuse."
  exit 1
fi

echo "OK: phosphor discipline preserved."
