#!/usr/bin/env bash
#
# Audit for the Radix UI <SelectItem value=""> footgun.
# Empty-string value crashes Select on first dropdown open. The bug isn't
# visible at mount-time, so build / type-check / substrate-pattern screenshots
# all pass. Only catches users who actually click — by which time you're in
# production.
#
# Failure pattern (f) from the silent-failure-auditor skill's 6-pattern audit.
#
# Static-only:
#   ✓ Catches literal value=""
#   ✗ Misses dynamic value={var} when var can resolve to "" at runtime
#     (needs AST + flow analysis; future scope, possibly via ESLint rule)
#
# Scans:
#   - app/        (Next.js routes + components)
#   - components/ (shared UI primitives + features)

set -euo pipefail

# Patterns to detect (matches both <SelectItem> and <Select.Item>):
#   - <SelectItem ... value="">
#   - <Select.Item ... value="">
# The leading `<` requires a real JSX tag — text mentions (e.g. comments
# discussing the footgun) won't match.
# Single-quote, double-quote, and JS template-literal cases.
PATTERN='<(SelectItem|Select\.Item)[^>]{0,200}value=("|'"'"'|`)("|'"'"'|`)'

matches=""
if [ -d app ]; then
  m1=$(grep -rEn --include='*.tsx' --include='*.ts' "$PATTERN" app/ 2>/dev/null || true)
  matches="$matches$m1"
fi
if [ -d components ]; then
  m2=$(grep -rEn --include='*.tsx' --include='*.ts' "$PATTERN" components/ 2>/dev/null || true)
  matches="$matches$m2"
fi

# Strip empty lines + filter out commented-out code (// or /* prefix)
filtered=$(echo "$matches" | grep -vE '^\s*$' | grep -vE '^\s*//' || true)

if [ -z "$filtered" ]; then
  echo "::notice::No Radix SelectItem with empty-string value found."
  exit 0
fi

count=$(echo "$filtered" | wc -l | tr -d ' ')

echo "::error::Radix SelectItem with value=\"\" crashes the dropdown on first open."
echo ""
echo "$filtered" | head -20 | while IFS= read -r line; do
  file=$(echo "$line" | cut -d':' -f1)
  ln=$(echo "$line" | cut -d':' -f2)
  snippet=$(echo "$line" | cut -d':' -f3- | head -c 200)
  echo "::error file=$file,line=$ln::Radix Select empty-value crash risk — $snippet"
done

echo ""
echo "::error::Found $count instance(s) of <SelectItem value=\"\"> (or <Select.Item value=\"\">)."
echo "Fix: use a stable non-empty placeholder like value=\"__none\" or value=\"all\". Empty string crashes Radix on first dropdown open. See memory: silent-failure-auditor pattern (f)."
exit 1
