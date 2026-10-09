#!/usr/bin/env bash
# Grievance routing + SLA escalation rehearsal on a throwaway LOCAL database.
# Exit 0 = every assertion in 10_escalation.sql held. Never point this at production.
#   bash supabase/tests/grievance/run.sh        # local Postgres on 127.0.0.1:5432
set -euo pipefail
export PGHOST="${PGHOST:-127.0.0.1}" PGPORT="${PGPORT:-5432}" PGOPTIONS="-c client_min_messages=warning"
DB="${GRIEVANCE_REHEARSAL_DB:-grievance_rehearsal}"
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../../.." && pwd)"
# GRIEVANCE_MIGRATION: a mutated copy, to prove the scenarios fail when a rule is broken
MIG="${GRIEVANCE_MIGRATION:-$ROOT/supabase/migrations/20271010020000_grievance_sla_escalation.sql}"
case "$PGHOST" in 127.0.0.1|localhost|::1) ;; *) echo "refusing: PGHOST=$PGHOST is not local"; exit 2;; esac

psql -d postgres -qc "DROP DATABASE IF EXISTS $DB" && psql -d postgres -qc "CREATE DATABASE $DB"
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$HERE/00_stubs.sql"
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$HERE/05_preseed.sql"
# Production's My Desk reader, the REAL body from the newest migration that
# defines it, so the migration's in-place patch (section 12) is rehearsed on
# the text it will meet, not on a stub. (PL/pgSQL only checks syntax at
# CREATE, so the tables it reads need not exist here.)
DESK=$(grep -lE 'FUNCTION public\.fn_my_desk_waiting\(\)' "$ROOT"/supabase/migrations/*.sql | sort | tail -1)
sed -nE '/^CREATE (OR REPLACE )?FUNCTION public\.fn_my_desk_waiting\(\)/,/^\$function\$;/p' "$DESK" \
  | psql -d "$DB" -v ON_ERROR_STOP=1 -q
# Migration order (nothing numbered after this file re-creates what it patches),
# and the five readers exactly as main's migrations before it leave them, in
# schema "replay" (30_ patches and re-creates them): replay_readers.py.
REPLAY="$(mktemp)"; trap 'rm -f "$REPLAY"' EXIT
python3 "$HERE/replay_readers.py" "$ROOT/supabase/migrations" 20271010020000_grievance_sla_escalation.sql > "$REPLAY"
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$MIG"
# the migration must be safe to apply twice
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$MIG"
# Loaded AFTER the migration: its reader gate (section 14) would rightly refuse
# these unwrapped copies. 30_ patches them and runs the gate again.
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$REPLAY"
# Every scenario file, in order, on the same database (20_ builds on 10_'s people).
for T in "$HERE"/[1-9][0-9]_*.sql; do
  OUT=$(psql -d "$DB" -v ON_ERROR_STOP=1 -At -f "$T" 2>&1) || { echo "$(basename "$T"):"; echo "$OUT" | grep -E "FAIL|ERROR" | head -5; exit 1; }
  echo "$OUT" | grep -E "FAIL|SCENARIOS PASSED"
done
