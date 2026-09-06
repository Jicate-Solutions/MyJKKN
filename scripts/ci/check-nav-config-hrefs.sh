#!/usr/bin/env bash
#
# Audit every href in app/(routes)/**/nav-config.ts against the actual
# existence of app/(routes)<href>/page.tsx. Exits non-zero on the first
# mismatch with a GitHub-Actions annotation.
#
# Receipts of bugs this would have caught:
#   - PR #876 (2026-05-11) — /hr/attendance promised by PR #857 nav-config,
#     page.tsx never created. Authenticated users hit Next.js 404.
#   - Latent: /hr/recruitment/candidates — same class, also from PR #857.
#
# Limitations:
#   - Only checks hrefs starting with /; ignores external links and #anchors.
#   - Does NOT validate dynamic [id] routes (those have their own pattern).
#   - Assumes app/(routes)/ as the route root (Next.js App Router convention).

set -euo pipefail

fail=0
checked=0

# Robust paren-quoting: app/(routes) has literal parens
ROUTES_ROOT='app/(routes)'

if [ ! -d "$ROUTES_ROOT" ]; then
  echo "::notice::No $ROUTES_ROOT directory; skipping nav-config audit."
  exit 0
fi

# Find every nav-config.ts file
while IFS= read -r nav; do
  [ -z "$nav" ] && continue

  # Extract hrefs that start with /  (skip external + #anchors)
  # Match: href: '/something' or href: "/something"
  while IFS= read -r raw_href; do
    [ -z "$raw_href" ] && continue

    # Strip the `href:` prefix + surrounding quotes
    path=$(echo "$raw_href" | sed -E "s/href:[[:space:]]*['\"]//; s/['\"]$//")

    # Skip dynamic-segment hrefs (template strings with ${...}, or unresolved [id])
    if echo "$path" | grep -qE '\$\{|\[[a-zA-Z_]+\]'; then
      continue
    fi

    # Build candidate page paths in priority order:
    #   1. app/(routes)/<path>/page.tsx
    #   2. app/(routes)/<path>.tsx   (no trailing dir, file is the page)
    candidate1="${ROUTES_ROOT}${path}/page.tsx"
    candidate2="${ROUTES_ROOT}${path}.tsx"

    if [ -f "$candidate1" ] || [ -f "$candidate2" ]; then
      checked=$((checked + 1))
      continue
    fi

    # 2b. A GET-exporting Route Handler serves the path with a real HTTP 307
    #     (pure-redirect landing pattern, PR #2763/#2777). Reachable exactly
    #     like a page.tsx — but only when it actually exports GET.
    candidate3="${ROUTES_ROOT}${path}/route.ts"
    if [ -f "$candidate3" ] && grep -qE 'export[[:space:]]+(async[[:space:]]+)?function[[:space:]]+GET|export[[:space:]]+const[[:space:]]+GET' "$candidate3"; then
      checked=$((checked + 1))
      continue
    fi

    # 3. Trailing dynamic segment: /a/b/standard is served by app/(routes)/a/b/[tier]/page.tsx.
    #    (2026-06-07: /campus-living/mess/menu-editor/standard false-positive — the
    #    page exists as menu-editor/[tier]/page.tsx. Mid-path dynamics still unsupported.)
    parent_dir=$(dirname "$path")
    if compgen -G "${ROUTES_ROOT}${parent_dir}/\[*\]/page.tsx" > /dev/null 2>&1; then
      checked=$((checked + 1))
      continue
    fi

    echo "::error file=$nav::nav-config promises href '$path' but no page.tsx, .tsx file, or GET-exporting route.ts exists for it. Either create the page/handler or remove the nav entry."
    fail=1

  done < <(grep -oE "href:[[:space:]]*['\"]/[^'\"]*['\"]" "$nav" || true)

done < <(find "$ROUTES_ROOT" -name 'nav-config.ts' 2>/dev/null)

if [ "$fail" -ne 0 ]; then
  echo ""
  echo "::error::Nav-config audit failed. Every href in a nav-config.ts must point at a real page.tsx (or .tsx file). Background: PR #876 receipt 2026-05-11 — authenticated users hit Next.js 404 when nav promises a route without a page. curl shows 307 (auth redirect) for unauthed visitors, masking the bug — only pre-merge static check catches it reliably."
  exit 1
fi

echo "::notice::Nav-config audit passed ($checked hrefs validated)."
