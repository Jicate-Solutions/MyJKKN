#!/usr/bin/env bash
# Grievance complaint-privacy rehearsal on a throwaway LOCAL database.
# Exit 0 = every assertion in 20_privacy.sql held. Never point this at production.
#   bash supabase/tests/grievance/run-privacy.sh        # local Postgres on 127.0.0.1:5432
# Order: #4079's stubs + migration, then this PR's pre-state, then this PR's
# migration TWICE (it must be safe to re-apply), then the assertions.
set -euo pipefail
export PGHOST="${PGHOST:-127.0.0.1}" PGPORT="${PGPORT:-5432}" PGOPTIONS="-c client_min_messages=warning"
DB="${GRIEVANCE_PRIVACY_DB:-grievance_privacy_rehearsal}"
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../../.." && pwd)"
BASE="$ROOT/supabase/migrations/20270420090000_grievance_sla_escalation.sql"
# PRIVACY_MIGRATION: a mutated copy, to prove the scenarios fail when a rule is broken
MIG="${PRIVACY_MIGRATION:-$ROOT/supabase/migrations/20270624093700_grievance_complaint_privacy.sql}"
case "$PGHOST" in 127.0.0.1|localhost|::1) ;; *) echo "refusing: PGHOST=$PGHOST is not local"; exit 2;; esac

psql -d postgres -qc "DROP DATABASE IF EXISTS $DB" && psql -d postgres -qc "CREATE DATABASE $DB"
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$HERE/00_stubs.sql"
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$HERE/05_preseed.sql"
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$BASE"
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$HERE/06_privacy_preseed.sql"
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$MIG"
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$MIG"
OUT=$(psql -d "$DB" -v ON_ERROR_STOP=1 -At -f "$HERE/20_privacy.sql" 2>&1) || { echo "$OUT" | grep -E "FAIL|ERROR" | head -5; exit 1; }
echo "$OUT" | grep -E "FAIL|GRIEVANCE PRIVACY SCENARIOS PASSED"
