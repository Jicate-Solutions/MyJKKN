#!/usr/bin/env bash
# Adoption loop rehearsal on a throwaway local database. Exit 0 = every assertion held.
set -euo pipefail
export PGHOST="${PGHOST:-127.0.0.1}" PGPORT="${PGPORT:-5432}"
DB="${ADOPTION_REHEARSAL_DB:-adoption_rehearsal}"
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../../.." && pwd)"
GATE_B="$ROOT/supabase/migrations/20260916090100_notifications_must_answer.sql"
psql -d postgres -qc "DROP DATABASE IF EXISTS $DB" && psql -d postgres -qc "CREATE DATABASE $DB"
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$HERE/00_stubs.sql"
if [ -f "$GATE_B" ]; then psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$GATE_B"; else
  # PR #3829 not merged yet: pull its migration B from the branch
  git -C "$ROOT" show jicate/feat/blocking-feedback-gate:supabase/migrations/20260916090100_notifications_must_answer.sql | psql -d "$DB" -v ON_ERROR_STOP=1 -q; fi
for f in "$ROOT"/supabase/migrations/20260916190000_adoption_feature_registry.sql \
         "$ROOT"/supabase/migrations/20260916190100_adoption_feature_usage.sql \
         "$ROOT"/supabase/migrations/20260916190200_adoption_metrics.sql; do
  psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$f"; done
psql -d "$DB" -v ON_ERROR_STOP=1 -f "$HERE/10_scenarios.sql" | grep -E "FAIL|ALL SCENARIOS PASSED"
