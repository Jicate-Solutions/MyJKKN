#!/bin/bash
# Throwaway-Postgres rehearsal of hr_salary_suggestion_inputs(). Never touches production:
# no .env file is read; the only connection is 127.0.0.1:$PORT to a cluster this script creates.
# The four permission helpers are cut from supabase/setup/02_functions.sql by LINE RANGE; if that file
# moves, the "functions loaded" count below stops reading 4 and the run must not be trusted.
# Expected output: see the header of probe.sql. Run: bash supabase/tests/hr-salary-suggestion/run.sh
set -u
export LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8
BIN=${PG_BIN:-/opt/homebrew/opt/postgresql@16/bin}
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$(cd "$HERE/../../.." && pwd)"   # the repo; read-only
MIG="$SRC/supabase/migrations/20270512090000_hr_salary_suggestion_inputs_rpc.sql"
FN="$SRC/supabase/setup/02_functions.sql"
PORT=${PORT:-5518}
WORK="$(mktemp -d)"   # cluster, log and generated SQL live outside the repo
DATA="$WORK/pgdata"
PSQL=("$BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -d rehearsal -X -q -v ON_ERROR_STOP=1)

teardown() { "$BIN/pg_ctl" -D "$DATA" stop -m fast >/dev/null 2>&1; rm -rf "$WORK"; echo "== torn down"; }
trap teardown EXIT

rm -rf "$DATA"
"$BIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null || exit 1
"$BIN/pg_ctl" -D "$DATA" -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" \
  -l "$WORK/pg.log" -w start >/dev/null || { cat "$WORK/pg.log"; exit 1; }
"$BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -X -q -c "CREATE DATABASE rehearsal" || exit 1

echo "== server: $("${PSQL[@]}" -tAc 'select version()' | cut -c1-40)"
echo "== stubs";  "${PSQL[@]}" -f "$HERE/stubs.sql" || exit 1
echo "== permission helpers, verbatim from supabase/setup/02_functions.sql"
{ sed -n '57,65p' "$FN"; sed -n '4119,4127p' "$FN"; sed -n '3422,3451p' "$FN"; sed -n '6740,6797p' "$FN"; } > "$WORK/helpers.sql"
grep -c "CREATE OR REPLACE FUNCTION" "$WORK/helpers.sql" | sed 's/^/   functions loaded: /'
"${PSQL[@]}" -f "$WORK/helpers.sql" || exit 1

echo "== migration (repo file, unmodified), applied twice"
"${PSQL[@]}" -f "$MIG" || exit 1
"${PSQL[@]}" -f "$MIG" || exit 1

probe() { "${PSQL[@]}" -f "$HERE/probe.sql" 2>&1 | grep -E "SEES|REFUSED|ERROR|HOLE|GRANTS" | sed 's/^.*NOTICE: *//; s/^ *//; s/^/   /'; }

echo "== PROBE, each person as role authenticated"
probe

echo "== MUTATION CONTROL 1: the college filter removed; the own-scope holder must now see B and C"
sed 's/AND public.role_has_institution_access(s.institution_id);/;/' "$MIG" > "$WORK/m1.sql"
"${PSQL[@]}" -f "$WORK/m1.sql" || exit 1
probe | grep "own-scope holder  "

echo "== MUTATION CONTROL 2: the never-published filter removed; B must now read its draft (999) as a college rule"
"${PSQL[@]}" -f "$MIG" >/dev/null || exit 1
sed "/AND rc.publication_state <> 'draft_only'/d" "$MIG" > "$WORK/m2.sql"
"${PSQL[@]}" -f "$WORK/m2.sql" || exit 1
probe | grep "all-scope holder .*person B"

echo "== MUTATION CONTROL 3: the has-an-amount test removed; C must now read its amount-less row as its college rule"
"${PSQL[@]}" -f "$MIG" >/dev/null || exit 1
python3 - "$MIG" > "$WORK/m3.sql" <<'PY'
import re, sys
s = open(sys.argv[1]).read()
s, n = re.subn(r"\n +AND \(jsonb_typeof\(rc\.value.*?\"number\"\)'\)\)", "", s, flags=re.S)
assert n == 1, n
print(s)
PY
"${PSQL[@]}" -f "$WORK/m3.sql" || exit 1
probe | grep "all-scope holder .*person C"

echo "== MUTATION CONTROL 4: the REVOKE removed (fresh function); anon must now get through"
"${PSQL[@]}" -c "DROP FUNCTION public.hr_salary_suggestion_inputs(uuid)" || exit 1
sed '/^REVOKE EXECUTE ON FUNCTION public.hr_salary_suggestion_inputs/d' "$MIG" > "$WORK/m4.sql"
"${PSQL[@]}" -f "$WORK/m4.sql" || exit 1
probe | grep -E "anon|GRANTS"
