#!/usr/bin/env bash
# Adoption loop rehearsal on a throwaway local database. Exit 0 = every assertion held.
set -euo pipefail
export PGHOST="${PGHOST:-127.0.0.1}" PGPORT="${PGPORT:-5432}"
DB="${ADOPTION_REHEARSAL_DB:-adoption_rehearsal}"
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../../.." && pwd)"

# build(): a fresh database with the stubs, the feedback gate's migration B and
# every adoption migration. Each scenario file gets its own fresh copy.
build() {
  psql -d postgres -qc "DROP DATABASE IF EXISTS $DB" && psql -d postgres -qc "CREATE DATABASE $DB"
  psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$HERE/00_stubs.sql"
  GATE_B_ON_MAIN=$(ls "$ROOT"/supabase/migrations/*notifications_must_answer*.sql 2>/dev/null | head -1 || true)
  if [ -n "$GATE_B_ON_MAIN" ]; then psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$GATE_B_ON_MAIN"; else
    # PR #3829 not merged yet: pull its migration B from the branch (found by name, the version prefix moves)
    GB=$(git -C "$ROOT" ls-tree jicate/feat/blocking-feedback-gate -r --name-only supabase/migrations 2>/dev/null | grep -E "notifications_must_answer" | head -1)
    [ -n "$GB" ] || { echo "gate migration B not found on main or on jicate/feat/blocking-feedback-gate"; exit 2; }
    git -C "$ROOT" show "jicate/feat/blocking-feedback-gate:$GB" | psql -d "$DB" -v ON_ERROR_STOP=1 -q; fi
  for f in "$ROOT"/supabase/migrations/20260916190000_adoption_feature_registry.sql \
           "$ROOT"/supabase/migrations/20260916190100_adoption_feature_usage.sql \
           "$ROOT"/supabase/migrations/20260916190200_adoption_metrics.sql \
           "$ROOT"/supabase/migrations/20260918230000_adoption_term_cadence.sql \
           "$ROOT"/supabase/migrations/20270324090000_adoption_daily_ask_and_remind.sql; do
    psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$f"; done
}

# Migrations A–D, with E applied on top: the why-not button must behave exactly as before.
build
psql -d "$DB" -v ON_ERROR_STOP=1 -f "$HERE/10_scenarios.sql" | grep -E "FAIL|ALL SCENARIOS PASSED"

# Migration E (2026-09-24, rulings 9 + 10): the daily run asks why and reminds on its own.
build
psql -d "$DB" -v ON_ERROR_STOP=1 -f "$HERE/20_daily_tick.sql" 2>&1 | grep -E "FAIL|ERROR|DAILY TICK SCENARIOS PASSED"

# Review 4 (2026-09-25): two simultaneous Ask-why presses cannot overspend the day's budget.
bash "$HERE/21_concurrency.sh" "$DB"
