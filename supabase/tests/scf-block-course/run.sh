#!/usr/bin/env bash
# Block-course confirmation rehearsal on a THROWAWAY local database.
# Exit 0 and "ALL SCENARIOS PASSED" = every assertion held. Any assertion that
# fails RAISEs, ON_ERROR_STOP aborts, and this script exits non-zero.
#
#   bash supabase/tests/scf-block-course/run.sh
#
# This script DROPS and CREATES a database, so before it touches anything it
# proves it is pointed somewhere disposable. Four independent checks, each of
# which alone would have stopped the accident:
#
#   1. The database name must match ^scf_test_ . A name that does not is
#      refused rather than quietly rewritten, so a typo cannot land on a real
#      database that happens to be reachable.
#   2. PGHOST must be a loopback address. A remote host is refused.
#   3. It NEVER reads a .env file, and it deliberately does not honour
#      PGDATABASE. Everything comes from PGHOST / PGPORT / PGUSER or the
#      defaults below, and every psql call names its database with -d. A
#      production DATABASE_URL sitting in the environment cannot redirect it.
#   4. The strongest one, because a tunnel can make production look like
#      loopback: after connecting to the maintenance database it checks for
#      tables only production has. Supabase's application database is itself
#      named `postgres`, which is exactly the maintenance database this script
#      connects to first, so name and host checks are not enough on their own.
#      If student_attendance, session_feedback or platform_policies is present,
#      this is a real database and the script refuses.
set -euo pipefail

export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"
unset PGDATABASE || true

DB="${SCF_BLOCK_COURSE_DB:-scf_test_block_course}"

# --- check 1: the name must say it is disposable ----------------------------
if [[ ! "$DB" =~ ^scf_test_ ]]; then
  echo "REFUSED: database name '$DB' does not match ^scf_test_ ." >&2
  echo "         This script drops the database it is given. Name it scf_test_<something>." >&2
  exit 2
fi

# --- check 2: loopback only -------------------------------------------------
case "$PGHOST" in
  localhost|127.0.0.1|::1|/*) ;;
  *)
    echo "REFUSED: PGHOST='$PGHOST' is not a loopback address." >&2
    echo "         This script only ever runs against a local throwaway server." >&2
    exit 2 ;;
esac

HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../../.." && pwd)"
MIG="$ROOT/supabase/migrations/20261226000000_scf_confirmation_status_block_course_siblings.sql"
[ -f "$MIG" ] || { echo "FAIL: migration not found at $MIG" >&2; exit 1; }

# --- role: whatever actually connects, and no password is ever invented ------
# CI's postgres:16 service is trust auth with a `postgres` superuser; a local
# Homebrew install usually has a role named after the OS user and none called
# postgres. Probe rather than assume, so the same script runs in both places.
if [ -z "${PGUSER:-}" ]; then
  for candidate in "$(id -un)" postgres; do
    if psql -U "$candidate" -d postgres -tAXc 'select 1' >/dev/null 2>&1; then
      export PGUSER="$candidate"; break
    fi
  done
fi

# --- check 3/4: is the server we reached actually a real database? ----------
# Runs against the maintenance database, before any DDL. `|| true` so a refused
# connection falls through to the psql error below instead of this check.
PROD_TABLES="$(psql -d postgres -tAX -c "
  SELECT count(*) FROM information_schema.tables
  WHERE table_schema='public'
    AND table_name IN ('student_attendance','session_feedback','platform_policies');
" 2>/dev/null || echo unreachable)"

if [ "$PROD_TABLES" = "unreachable" ]; then
  echo "FAIL: no Postgres reachable at $PGHOST:$PGPORT as '$PGUSER'." >&2
  echo "      Start one, or set PGHOST/PGPORT/PGUSER for a local throwaway server." >&2
  exit 1
fi
if [ "$PROD_TABLES" != "0" ]; then
  echo "REFUSED: the database at $PGHOST:$PGPORT holds MyJKKN application tables." >&2
  echo "         That is a real database, not a throwaway one. Nothing was changed." >&2
  exit 2
fi

echo "[scf-block-course] target $PGHOST:$PGPORT db=$DB (disposable, verified empty of app tables)"
psql -d postgres -qc "DROP DATABASE IF EXISTS $DB" >/dev/null
psql -d postgres -qc "CREATE DATABASE $DB" >/dev/null
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$HERE/00_stubs.sql"
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$MIG"
# `|| true` so a failing assertion still PRINTS its message: without it,
# set -e kills the script at the psql exit code and the reason is lost.
out="$(psql -d "$DB" -v ON_ERROR_STOP=1 -f "$HERE/10_scenarios.sql" 2>&1 || true)"
echo "$out"
grep -q 'ALL SCENARIOS PASSED' <<<"$out" || { echo "FAIL: scenarios did not reach the end" >&2; exit 1; }
