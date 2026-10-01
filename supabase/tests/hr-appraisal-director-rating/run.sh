#!/bin/bash
# Throwaway-Postgres rehearsal of 20270525090000_hr_appraisal_director_rating.sql.
# Never touches production. Loads VERBATIM: is_super_admin()/is_admin() from
# supabase/setup/02_functions.sql, fn_is_the_director() (#4121, from main or the
# tree), fn_hr_appraisal_unanswered_conditions() (#4109's migration); stubs for
# the rest. Then: the migration twice, the probe as each person, and mutation
# controls (each rule removed; the probe must print that rule's FAIL).
set -u
export LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8
BIN=${PG_BIN:-/opt/homebrew/opt/postgresql@16/bin}
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$(cd "$HERE/../../.." && pwd)"
M="$SRC/supabase/migrations"
MIG="$M/20270525090000_hr_appraisal_director_rating.sql"
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
{ sed -n '57,65p' "$FN"; sed -n '4119,4127p' "$FN"; } > "$WORK/helpers.sql"
echo "   permission helpers loaded: $(grep -c 'CREATE OR REPLACE FUNCTION' "$WORK/helpers.sql") (must be 2)"
echo "== #4121 (the Director list)"
fetch_sibling '20270520090000_*.sql' jicate/main supabase/migrations/20270520090000_the_director_list.sql "$WORK/pr4121.sql" || { echo "   MISSING"; exit 1; }
awk '/^CREATE OR REPLACE FUNCTION public.fn_hr_appraisal_unanswered_conditions\(p_payload jsonb\)/,/^\$\$;/' "$M/20270505090000_hr_appraisal_checks_on_the_appraisal.sql" > "$WORK/conditions.sql"
echo "   fn_hr_appraisal_unanswered_conditions lines: $(wc -l < "$WORK/conditions.sql" | tr -d ' ')"
build() {
  local PGOPTIONS="-c client_min_messages=warning"; export PGOPTIONS
  "$BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -X -q -c "DROP DATABASE IF EXISTS rehearsal" -c "CREATE DATABASE rehearsal" || return 1
  local f
  for f in "$HERE/stub-schema.sql" "$WORK/helpers.sql" "$WORK/pr4121.sql" "$WORK/conditions.sql" "$HERE/seed.sql"; do
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
echo "== the migration, applied twice"
build "$MIG" || exit 1
PGOPTIONS="-c client_min_messages=warning" "${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null && echo "   second apply: ok" || echo "   second apply: FAILED"
build "$MIG" || exit 1
echo "== PROBE"
probe | tee "$WORK/main.txt" | sed 's/^/   /'
echo "   total: $(grep -c '^PASS' "$WORK/main.txt") PASS, $(grep -c '^FAIL' "$WORK/main.txt") FAIL, $(grep -c 'ERROR' "$WORK/main.txt") ERROR"
CAUGHT=0; MISSED=0
mutate() { local out="$WORK/mut.sql"; sed -E "$2" "$MIG" > "$out"
  local changed; changed=$(diff "$MIG" "$out" | grep -c '^[<>]')
  if [ "$changed" = 0 ]; then echo "   [$1] the edit matched nothing — CONTROL INVALID"; MISSED=$((MISSED+1)); return; fi
  if ! build "$out"; then echo "   [$1] mutated migration did not load"; MISSED=$((MISSED+1)); return; fi
  if probe | grep -qF "FAIL $3"; then echo "   [$1] CAUGHT ($changed diff lines): FAIL $3"; CAUGHT=$((CAUGHT+1)); else echo "   [$1] NOT CAUGHT — expected FAIL $3"; MISSED=$((MISSED+1)); fi; }
echo "== MUTATION CONTROLS"
mutate "M1 the Director-list check removed" 's/^    IF NOT COALESCE\(public.fn_is_the_director\(\), false\) THEN$/    IF false THEN/' 'another super admin cannot change a rating'
mutate "M2 the reason check removed" "s/^            OR length\(trim\(COALESCE\(NEW.director_review_jsonb ->> 'reason', ''\)\)\) < 10\) THEN$/            OR false) THEN/" 'a changed rating without a reason is refused'
mutate "M3 the whole Director-only rule deleted" '/^  -- ── 30 Sep 2026: the Director.s own rating/,/^  END IF;$/d' 'an admin cannot change a rating'
echo "== mutation controls: $CAUGHT caught, $MISSED not caught"
