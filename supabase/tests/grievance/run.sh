#!/usr/bin/env bash
# Grievance routing + SLA escalation rehearsal on a throwaway LOCAL database.
# Exit 0 = every assertion in 10_escalation.sql held. Never point this at production.
#   bash supabase/tests/grievance/run.sh        # local Postgres on 127.0.0.1:5432
set -euo pipefail
export PGHOST="${PGHOST:-127.0.0.1}" PGPORT="${PGPORT:-5432}" PGOPTIONS="-c client_min_messages=warning"
DB="${GRIEVANCE_REHEARSAL_DB:-grievance_rehearsal}"
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../../.." && pwd)"
# GRIEVANCE_MIGRATION: a mutated copy, to prove the scenarios fail when a rule is broken
MIG="${GRIEVANCE_MIGRATION:-$ROOT/supabase/migrations/20270420090000_grievance_sla_escalation.sql}"
case "$PGHOST" in 127.0.0.1|localhost|::1) ;; *) echo "refusing: PGHOST=$PGHOST is not local"; exit 2;; esac

psql -d postgres -qc "DROP DATABASE IF EXISTS $DB" && psql -d postgres -qc "CREATE DATABASE $DB"
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$HERE/00_stubs.sql"
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$HERE/05_preseed.sql"
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$MIG"
# the migration must be safe to apply twice
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$MIG"
OUT=$(psql -d "$DB" -v ON_ERROR_STOP=1 -At -f "$HERE/10_escalation.sql" 2>&1) || { echo "$OUT" | grep -E "FAIL|ERROR" | head -5; exit 1; }
echo "$OUT" | grep -E "FAIL|GRIEVANCE ESCALATION SCENARIOS PASSED"
