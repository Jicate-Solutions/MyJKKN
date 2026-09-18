#!/usr/bin/env bash
# Block-course confirmation rehearsal on a throwaway local database.
# Exit 0 and "ALL SCENARIOS PASSED" = every assertion held. Any assertion that
# fails RAISEs, ON_ERROR_STOP aborts, and this script exits non-zero.
#
#   bash supabase/tests/scf-block-course/run.sh
#
# Needs a local Postgres (PGHOST/PGPORT, default 127.0.0.1:5432). It builds its
# own database from 00_stubs.sql, so it never touches production or the local
# Supabase instance's data.
set -euo pipefail
export PGHOST="${PGHOST:-127.0.0.1}" PGPORT="${PGPORT:-5432}"
DB="${SCF_BLOCK_COURSE_DB:-scf_block_course_rehearsal}"
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../../.." && pwd)"
MIG="$ROOT/supabase/migrations/20261226000000_scf_confirmation_status_block_course_siblings.sql"
[ -f "$MIG" ] || { echo "FAIL: migration not found at $MIG"; exit 1; }
psql -d postgres -qc "DROP DATABASE IF EXISTS $DB" >/dev/null
psql -d postgres -qc "CREATE DATABASE $DB" >/dev/null
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$HERE/00_stubs.sql"
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$MIG"
# `|| true` so a failing assertion still PRINTS its message: without it,
# set -e kills the script at the psql exit code and the reason is lost.
out="$(psql -d "$DB" -v ON_ERROR_STOP=1 -f "$HERE/10_scenarios.sql" 2>&1 || true)"
echo "$out"
grep -q 'ALL SCENARIOS PASSED' <<<"$out" || { echo "FAIL: scenarios did not reach the end"; exit 1; }
