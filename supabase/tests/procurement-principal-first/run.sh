#!/usr/bin/env bash
# Rehearsal of 20261009234023_procurement_hod_principal_raise on a throwaway local database.
# Exit 0 = every assertion held. Never touches a remote database.
#
# The approval-chain migrations are applied in the order production applied them (the
# 20271006/20271007 files went live BEFORE 20261008052910 and 20261009070838 — their version
# prefixes are typos), so the live-body patches in the later files see the bodies they saw live.
#
#   MIGRATION=<path>  rehearse another copy of the migration (used for mutation checks)
set -euo pipefail
export PGHOST="${PGHOST:-127.0.0.1}" PGPORT="${PGPORT:-5432}"
DB="${PROCUREMENT_REHEARSAL_DB:-procurement_principal_first_rehearsal}"
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../../.." && pwd)"
M="$ROOT/supabase/migrations"
MIGRATION="${MIGRATION:-$M/20261009234023_procurement_hod_principal_raise.sql}"

psql -d postgres -qc "DROP DATABASE IF EXISTS $DB" >/dev/null
psql -d postgres -qc "CREATE DATABASE $DB" >/dev/null
run() { psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$1" >/dev/null; }

run "$HERE/00_stubs.sql"
for f in 20271006105000_procurement_category_approval_chains \
         20271006115000_procurement_chain_requester_step \
         20271006130000_procurement_final_approval_chain \
         20271007121700_procurement_my_approvals_super_admin \
         20261008052910_procurement_chain_per_college \
         20261009070838_procurement_chain_common_plus_college; do
  run "$M/$f.sql"
done
run "$HERE/05_roles.sql"
run "$MIGRATION"
# Applied twice: the second run must be a no-op (no error, nothing patched twice).
run "$MIGRATION"

psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$HERE/10_scenarios.sql" 2>&1 | grep -E "FAIL|ERROR|PRINCIPAL-FIRST SCENARIOS PASSED"
psql -d postgres -qc "DROP DATABASE IF EXISTS $DB" >/dev/null
