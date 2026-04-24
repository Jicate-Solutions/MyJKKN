#!/usr/bin/env bash
# scripts/local-auth.sh
# -------------------------------------------------------------------
# PURPOSE: Log a real MyJKKN user into http://localhost:${LOCAL_DEV_PORT}
# (default 3104) without going through Google OAuth. Solves the "can't
# test locally because OAuth callback isn't configured for localhost"
# problem once and for all.
#
# Why 3104 not 3000: port 3000 is a VERY common dev-server default used
# by every Next.js starter, React starter, etc. Running MyJKKN on 3104
# avoids collisions when a director is juggling multiple dev servers
# across projects. Override with LOCAL_DEV_PORT=3000 if needed.
#
# HOW IT WORKS:
# 1. Read SUPABASE_SERVICE_ROLE_KEY from .env.local
# 2. Call Supabase auth admin `generate_link` endpoint for the target email
# 3. Get back a magiclink URL that starts with
#    https://<project>.supabase.co/auth/v1/verify?token=...&redirect_to=...
# 4. Rewrite redirect_to to http://localhost:${LOCAL_DEV_PORT}/auth/dev-login
# 5. Print the link. Paste into browser → browser exchanges token → session cookie set
#    for localhost:${LOCAL_DEV_PORT} → fully authenticated local dev
#
# USAGE:
#   scripts/local-auth.sh [email] [path]
#
# DEFAULTS:
#   email          = director@jkkn.ac.in
#   path           = /  (can be /events/propose, /dashboard, etc.)
#   LOCAL_DEV_PORT = 3104 (override via env: LOCAL_DEV_PORT=3000 scripts/local-auth.sh ...)
#
# EXAMPLES:
#   scripts/local-auth.sh
#   scripts/local-auth.sh director@jkkn.ac.in /events/propose
#   scripts/local-auth.sh someuser@jkkn.ac.in /staff
#   LOCAL_DEV_PORT=3000 scripts/local-auth.sh director@jkkn.ac.in /  # if running on 3000
#
# REQUIREMENTS:
#   - .env.local with SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL
#   - The email must belong to an existing auth.users row on the Supabase project
#   - Dev server running at http://localhost:${LOCAL_DEV_PORT} (start with `npm run dev`)
#   - Supabase dashboard redirect URL allow-list must include
#     http://localhost:${LOCAL_DEV_PORT}/auth/dev-login — exact match required.
#     See scripts/README.md for the one-time dashboard setup.
# -------------------------------------------------------------------

set -euo pipefail

EMAIL="${1:-director@jkkn.ac.in}"
REDIRECT_PATH="${2:-/}"
ENV_FILE="${ENV_FILE:-.env.local}"
LOCAL_DEV_PORT="${LOCAL_DEV_PORT:-3104}"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ $ENV_FILE not found. Run from MyJKKN project root." >&2
  exit 1
fi

SUPABASE_URL=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
SERVICE_KEY=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")

if [ -z "$SUPABASE_URL" ] || [ -z "$SERVICE_KEY" ]; then
  echo "❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in $ENV_FILE" >&2
  exit 1
fi

# We redirect to /auth/dev-login — a client-side page that handles BOTH:
#   (a) hash fragment (#access_token=...&refresh_token=...) from magic-link flow
#   (b) ?token_hash=... from verifyOtp flow
# /auth/callback only handles PKCE ?code= so it can't exchange magic-link tokens.
#
# /auth/dev-login must be in Supabase's redirect allow-list (exact match).
# After session is set client-side, the page respects ?next=/path.
# The query string survives here because Supabase receives redirect_to WITHOUT
# the ?next (we append it locally after Supabase builds the verify URL).
TARGET_PATH="${REDIRECT_PATH}"
LOCAL_REDIRECT="http://localhost:${LOCAL_DEV_PORT}/auth/dev-login"

echo "→ Supabase: $SUPABASE_URL"
echo "→ Email:    $EMAIL"
echo "→ Callback: $LOCAL_REDIRECT"
echo "→ Target:   http://localhost:${LOCAL_DEV_PORT}${TARGET_PATH}  (navigate after login)"
echo ""

# Call admin generate_link endpoint — type=magiclink works for existing users
# NOTE: redirect_to MUST be at the TOP LEVEL of the payload, NOT inside `options`.
# If nested inside `options`, Supabase silently drops the path and defaults to the
# project's Site URL. This is undocumented behaviour caught 2026-04-24.
RESPONSE=$(curl -sS -X POST \
  "${SUPABASE_URL}/auth/v1/admin/generate_link" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"magiclink\",
    \"email\": \"${EMAIL}\",
    \"redirect_to\": \"${LOCAL_REDIRECT}\"
  }")

# Extract action_link field (the token-bearing URL)
ACTION_LINK=$(echo "$RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('action_link') or d.get('properties',{}).get('action_link') or '')" 2>/dev/null || echo "")

if [ -z "$ACTION_LINK" ]; then
  echo "❌ Failed to generate magic link. Response:" >&2
  echo "$RESPONSE" | python3 -m json.tool >&2
  exit 1
fi

# Append ?next=<target> to the redirect_to embedded in ACTION_LINK so that
# /auth/dev-login can route the browser to the right page after auth.
# (Supabase allow-list already accepted the base /auth/dev-login; appending a
# query after redirect is safe because that param lives INSIDE action_link,
# not in the outer verify URL that Supabase validates.)
ENCODED_NEXT=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$TARGET_PATH")
FINAL_LINK=$(python3 -c "
import sys, urllib.parse as u
link = sys.argv[1]
next_path = sys.argv[2]
parts = u.urlparse(link)
q = dict(u.parse_qsl(parts.query))
redir = q.get('redirect_to', '${LOCAL_REDIRECT}')
redir_parts = u.urlparse(redir)
redir_q = dict(u.parse_qsl(redir_parts.query))
redir_q['next'] = next_path
new_redir = u.urlunparse(redir_parts._replace(query=u.urlencode(redir_q)))
q['redirect_to'] = new_redir
print(u.urlunparse(parts._replace(query=u.urlencode(q))))
" "$ACTION_LINK" "$TARGET_PATH")

echo "✅ Magic link generated."
echo ""
echo "$FINAL_LINK"
echo ""

# Optional: auto-open in default browser if available
if command -v open >/dev/null 2>&1; then
  open "$FINAL_LINK" 2>/dev/null && echo "✅ Opened in default browser — landing on ${TARGET_PATH}" || echo "⚠️  Auto-open failed; paste the link manually"
fi
