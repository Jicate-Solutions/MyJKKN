#!/bin/bash
# Throwaway-Postgres rehearsal of 20271009090000_hr_appraisal_director_rating.sql.
# Never touches production. Loads VERBATIM: is_super_admin() from
# supabase/setup/02_functions.sql, fn_is_the_director() (20270520090000, from
# the tree or main) and main's appraisal column guard (20270501090100, the body
# this migration is built on); stubs for the rest. Then: the preconditions, the
# migration twice, the probe as each person, and mutation controls (each rule
# removed; the probe must print that rule's FAIL).
set -u
export LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8
BIN=${PG_BIN:-/opt/homebrew/opt/postgresql@16/bin}
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$(cd "$HERE/../../.." && pwd)"
M="$SRC/supabase/migrations"
MIG="$M/20271009090000_hr_appraisal_director_rating.sql"
GUARD="$M/20270501090100_hr_appraisal_column_guard.sql"
FN="$SRC/supabase/setup/02_functions.sql"
PORT=${PORT:-5533}
WORK="$(mktemp -d)"
DATA="$WORK/pgdata"
PSQL=("$BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -d rehearsal -X -q)
teardown() { "$BIN/pg_ctl" -D "$DATA" stop -m fast >/dev/null 2>&1; find "$WORK" -depth -delete; echo "== torn down"; }
trap teardown EXIT
fetch_sibling() { local f; f="$(ls "$SRC"/supabase/migrations/$1 2>/dev/null | head -1)"
  if [ -n "$f" ]; then cp "$f" "$4"; echo "   from the tree: $f"; return 0; fi
  if git -C "$SRC" show "$2:$3" > "$4" 2>/dev/null; then echo "   from $2 ($(git -C "$SRC" rev-parse --short "$2"))"; return 0; fi
  return 1; }
"$BIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null || exit 1
"$BIN/pg_ctl" -D "$DATA" -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" -l "$WORK/pg.log" -w start >/dev/null || { cat "$WORK/pg.log"; exit 1; }
echo "== server: $("$BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -X -tAc 'select version()' | cut -c1-40)"
# By name, not line number, so a moved definition cannot load the wrong function.
awk '/^CREATE OR REPLACE FUNCTION public.is_super_admin\(\)/{f=1} f{print} f&&/^\$\$;/{exit}' "$FN" > "$WORK/helpers.sql"
echo "   permission helpers loaded: $(grep -c 'FUNCTION public.is_super_admin()' "$WORK/helpers.sql") is_super_admin (must be 1)"
echo "== #4121 (the Director list)"
fetch_sibling '20270520090000_*.sql' jicate/main supabase/migrations/20270520090000_the_director_list.sql "$WORK/pr4121.sql" || { echo "   MISSING"; exit 1; }
[ -f "$GUARD" ] || { echo "   MISSING: $GUARD"; exit 1; }
echo "== main's column guard: $GUARD"
build() {
  local PGOPTIONS="-c client_min_messages=warning"; export PGOPTIONS
  "$BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -X -q -c "DROP DATABASE IF EXISTS rehearsal" -c "CREATE DATABASE rehearsal" || return 1
  local f
  for f in "$HERE/stub-schema.sql" "$WORK/helpers.sql" "$WORK/pr4121.sql" "$HERE/seed.sql" "$GUARD"; do
    "${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$f" >/dev/null || { echo "   LOAD FAILED: $f"; return 1; }
  done
  "${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$1" >/dev/null || { echo "   MIGRATION FAILED: $1"; return 1; }
}
probe() { PGOPTIONS= "${PSQL[@]}" -f "$HERE/probe.sql" 2>&1 | grep -E "PASS|FAIL|ERROR" | sed 's/^.*NOTICE: *//; s/^psql:[^E]*//'; }
echo "== SECTION 0: the migration BEFORE #4121 must stop, changing nothing"
"$BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -X -q -c "DROP DATABASE IF EXISTS rehearsal" -c "CREATE DATABASE rehearsal"
"${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$HERE/stub-schema.sql" >/dev/null
"${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$MIG" 2>&1 | grep -o "ABORT: .*" | sed 's/^/   /'
"${PSQL[@]}" -tAc "SELECT '   column added anyway: ' || count(*) FROM information_schema.columns WHERE table_name='hr_performance_reviews' AND column_name='director_review_jsonb'"
echo "== SECTION 0: a live guard that differs from main's must stop it, changing nothing"
"$BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -X -q -c "DROP DATABASE IF EXISTS rehearsal" -c "CREATE DATABASE rehearsal"
for f in "$HERE/stub-schema.sql" "$WORK/helpers.sql" "$WORK/pr4121.sql" "$HERE/seed.sql"; do PGOPTIONS="-c client_min_messages=warning" "${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$f" >/dev/null; done
sed -E 's/^(  v_admin := .*)$/\1  -- a later change on main/' "$GUARD" | PGOPTIONS="-c client_min_messages=warning" "${PSQL[@]}" -v ON_ERROR_STOP=1 >/dev/null
DRIFT=$("${PSQL[@]}" -tAc "SELECT md5(prosrc) FROM pg_proc WHERE oid='public.fn_hr_performance_review_guard()'::regprocedure")
"${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$MIG" 2>&1 | grep -o "ABORT: .*" | cut -c1-90 | sed 's/^/   /'
"${PSQL[@]}" -tAc "SELECT '   column added anyway: ' || count(*) FROM information_schema.columns WHERE table_name='hr_performance_reviews' AND column_name='director_review_jsonb'"
"${PSQL[@]}" -tAc "SELECT '   drifted guard left as it was: ' || (md5(prosrc) = '$DRIFT') FROM pg_proc WHERE oid='public.fn_hr_performance_review_guard()'::regprocedure"
echo "== main's guard body, as loaded here: $(build "$GUARD" >/dev/null 2>&1; "${PSQL[@]}" -tAc "SELECT md5(prosrc) FROM pg_proc WHERE oid='public.fn_hr_performance_review_guard()'::regprocedure") (the migration expects 5c999093e927c9160bbc38d7a957269b)"
echo "== the migration, applied twice"
build "$MIG" || exit 1
PGOPTIONS="-c client_min_messages=warning" "${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null && echo "   second apply: ok" || echo "   second apply: FAILED"
build "$MIG" || exit 1
echo "== PROBE"
probe | tee "$WORK/main.txt" | sed 's/^/   /'
echo "   total: $(grep -c '^PASS' "$WORK/main.txt") PASS, $(grep -c '^FAIL' "$WORK/main.txt") FAIL, $(grep -c 'ERROR' "$WORK/main.txt") ERROR"
CAUGHT=0; MISSED=0
mutate() { local out="$WORK/mut.sql"; sed -E "$2" "$MIG" | sed "s/RAISE EXCEPTION 'SELF-CHECK FAILED/RAISE NOTICE 'SELF-CHECK FAILED/" > "$out"
  local changed; changed=$(diff "$MIG" "$out" | grep -c '^[<>]')
  if [ "$changed" = 0 ]; then echo "   [$1] the edit matched nothing — CONTROL INVALID"; MISSED=$((MISSED+1)); return; fi
  if ! build "$out"; then echo "   [$1] mutated migration did not load"; MISSED=$((MISSED+1)); return; fi
  if probe | grep -qF "FAIL $3"; then echo "   [$1] CAUGHT ($changed diff lines): FAIL $3"; CAUGHT=$((CAUGHT+1)); else echo "   [$1] NOT CAUGHT — expected FAIL $3"; MISSED=$((MISSED+1)); fi; }
echo "== MUTATION CONTROLS"
sed -E 's/^      IF public.fn_is_the_director\(\) IS NOT TRUE THEN$/      IF false THEN/' "$MIG" > "$WORK/m0.sql"
if cmp -s "$MIG" "$WORK/m0.sql"; then echo "   [M0] the edit matched nothing — CONTROL INVALID"; MISSED=$((MISSED+1))
elif build "$WORK/m0.sql" 2>/dev/null; then echo "   [M0 a changed body with the self-check left in] LOADED — SELF-CHECK NOT REAL"; MISSED=$((MISSED+1)); else echo "   [M0 a changed body with the self-check left in] CAUGHT: the self-check refused it"; CAUGHT=$((CAUGHT+1)); fi
mutate "M1 the Director-list check removed" 's/^      IF public.fn_is_the_director\(\) IS NOT TRUE THEN$/      IF false THEN/' 'another super admin cannot sign off'
mutate "M2 the reason check removed" "s/^       OR length\(trim\(COALESCE\(NEW.director_review_jsonb ->> 'reason', ''\)\)\) < 10 THEN$/       OR false THEN/" 'a changed rating without a reason is refused'
mutate "M3 the whole sign-off rule deleted" '/^  -- ── Sign-off belongs to the named Director list/,/^  END IF;$/d' 'an admin cannot sign off'
mutate "M4 the own-appraisal check removed" 's/^      IF v_self THEN$/      IF false THEN/' 'the Director cannot sign off his own appraisal'
mutate "M5 signed-off-is-final removed" "s/^      IF OLD.status = 'final_approved' THEN$/      IF false THEN/" 'the Director cannot change the score after sign-off'
mutate "M6 the change-only-at-sign-off rule removed" "s/^         AND NOT \(OLD.status = 'sedc_reviewed' AND NEW.status = 'final_approved'\) THEN$/         AND false THEN/" 'the Director cannot write his change outside a sign-off'
mutate "M7 the band check removed" "s/^            OR \(e.value #>> '\{\}'\) NOT IN \('exceeds', 'meets', 'below'\)$/            OR false/" 'an unknown band is refused'
mutate "M8 send-back from the Director's step not counted" "s/OR OLD.status IN \('sedc_reviewed', 'final_approved'\)\)\)/OR OLD.status IN ('final_approved')))/" "an admin cannot send back from the Director's step"
mutate "M9 the area check removed" "s/^         WHERE e.key NOT IN \('teaching', 'research', 'service', 'collegiality'\)$/         WHERE false/" 'an unknown area is refused'
echo "== mutation controls: $CAUGHT caught, $MISSED not caught"
