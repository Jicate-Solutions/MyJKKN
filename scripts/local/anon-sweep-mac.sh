#!/usr/bin/env bash
# scripts/local/anon-sweep-mac.sh
# =============================================================================
# Runs the live anon-exposure sweep on this Mac, on a launchd timer, and records
# a heartbeat so a missed run is detectable.
#
# WHY HERE AND NOT IN CI
#   The sweep's natural home is GitHub Actions, which runs whether or not any
#   laptop is awake. That needs a SUPABASE_DB_URL secret which does not exist in
#   the repo (checked: the repo has exactly two secrets, and neither is it). The
#   Mac already holds a Supabase Management API token, so the sweep can start
#   running here today instead of waiting on a secret nobody has added.
#
# THE HONEST LIMITATION — read this before trusting it
#   A laptop scheduler cannot alert you when the laptop is off. If this Mac is
#   asleep, shut down, or travelling, the sweep does not run, and nothing
#   anywhere says so. Silence from this job means "no news OR no run", and those
#   are not the same thing.
#
#   That is what the heartbeat is for. Every run writes its outcome and time to
#   $HEARTBEAT. Anyone — a person or a later session — can read one file and see
#   when the sweep last actually completed:
#
#       bash scripts/local/anon-sweep-mac.sh --check-heartbeat
#
#   It exits non-zero when the last successful run is older than MAX_AGE_HOURS.
#   This is a mitigation, not a fix: it still requires somebody to look. Moving
#   to GitHub Actions the moment the secret exists remains the real answer.
#
# READ-ONLY. The sweep issues catalog reads and one COUNT(*) per exposed
# relation. It never revokes, drops or alters anything.
# =============================================================================
set -uo pipefail

CHECKOUT="${ANON_SWEEP_CHECKOUT:-/Users/omm/myjkkn-dev-3104}"
LOG_DIR="${ANON_SWEEP_LOG_DIR:-/Users/omm/jkkn-max-lane/logs}"
LOG="$LOG_DIR/anon-sweep.log"
HEARTBEAT="$LOG_DIR/anon-sweep.heartbeat"
TOKEN_FILE="${SUPABASE_TOKEN_FILE:-/Users/omm/.supabase/access-token}"
PROJECT_REF="${SUPABASE_PROJECT_REF:-kvizhngldtiuufknvehv}"
MAX_AGE_HOURS="${ANON_SWEEP_MAX_AGE_HOURS:-12}"

mkdir -p "$LOG_DIR"

# --- heartbeat inspection mode ----------------------------------------------
if [ "${1:-}" = "--check-heartbeat" ]; then
  if [ ! -f "$HEARTBEAT" ]; then
    echo "✗ No heartbeat at $HEARTBEAT — the sweep has never completed on this machine."
    exit 1
  fi
  cat "$HEARTBEAT"
  last_epoch=$(sed -n 's/^epoch=//p' "$HEARTBEAT" | tail -1)
  last_status=$(sed -n 's/^status=//p' "$HEARTBEAT" | tail -1)
  now=$(date +%s)
  age_h=$(( (now - ${last_epoch:-0}) / 3600 ))
  echo "age: ${age_h}h (threshold ${MAX_AGE_HOURS}h)"
  if [ "$age_h" -gt "$MAX_AGE_HOURS" ]; then
    echo "✗ STALE — the sweep has not completed for ${age_h}h. This Mac was probably off."
    echo "  Treat production as UNSWEPT for that window; run it now, or move the job to CI."
    exit 1
  fi
  # A stale heartbeat and a heartbeat recording a FAILED run are different
  # problems, and neither should be reported as healthy.
  [ "$last_status" = "ok" ] || { echo "✗ Last run completed but REPORTED FINDINGS."; exit 1; }
  echo "✓ Fresh, and the last run was clean."
  exit 0
fi

# --- normal run --------------------------------------------------------------
started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
{
  echo "──────── anon-exposure sweep @ $started ────────"

  if [ ! -f "$TOKEN_FILE" ]; then
    echo "✗ No Supabase token at $TOKEN_FILE — cannot sweep."
    exit 90
  fi
  if [ ! -d "$CHECKOUT" ]; then
    echo "✗ Checkout $CHECKOUT is missing — cannot sweep."
    exit 91
  fi

  cd "$CHECKOUT" || exit 92
  # This checkout tracks main, so the script and the allow-list stay current
  # without anything here needing to be updated.
  SUPABASE_ACCESS_TOKEN="$(cat "$TOKEN_FILE")" \
  SUPABASE_PROJECT_REF="$PROJECT_REF" \
  node scripts/ci/check-anon-exposure-live.mjs
} >>"$LOG" 2>&1
rc=$?

finished="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
if [ "$rc" -eq 0 ]; then status=ok; else status="findings_or_error(rc=$rc)"; fi

# Written on EVERY outcome, including failure. A heartbeat that only records
# success cannot distinguish "ran and found a problem" from "never ran" — and
# those need opposite responses.
cat >"$HEARTBEAT" <<EOF
last_run=$finished
epoch=$(date +%s)
status=$status
exit_code=$rc
checkout=$CHECKOUT
log=$LOG
EOF

echo "[anon-sweep] $finished status=$status rc=$rc" >>"$LOG"
exit "$rc"
