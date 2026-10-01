#!/bin/bash
# Throwaway-Postgres rehearsal of 20270614090000_hr_pay_destination_changes.sql.
# Never touches production: no .env file is read; the only connection is
# 127.0.0.1:$PORT to a cluster this script creates and deletes.
#
# Loaded VERBATIM from the repo: the hr_staff_bank_accounts table and index
# (20260821240000), its 20261020000000 changes and the newest
# fn_hr_set_staff_bank_account, and fn_is_the_director (20270520090000).
# stubs.sql stands in for everything else. The migration is applied TWICE.
# Then three MUTATION CONTROLS: a rule removed from a copy of the migration,
# the database rebuilt, and the probe must print a FAIL.
# Run: bash supabase/tests/hr-pay-destination/run.sh
set -u
export LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8
BIN=${PG_BIN:-/opt/homebrew/opt/postgresql@16/bin}
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$(cd "$HERE/../../.." && pwd)"
M="$SRC/supabase/migrations"
MIG="$M/20270614090000_hr_pay_destination_changes.sql"
PORT=${PORT:-5541}
WORK="$(mktemp -d)"
wipe() { python3 -c 'import shutil,sys; shutil.rmtree(sys.argv[1], ignore_errors=True)' "$1"; }
stop() { "$BIN/pg_ctl" -D "$WORK/pgdata" stop -m fast >/dev/null 2>&1; }
teardown() { stop; wipe "$WORK"; }
trap teardown EXIT

{ sed -n '33,80p' "$M/20260821240000_hr_staff_bank_accounts.sql"
  sed -n '30,48p' "$M/20261020000000_hr_bank_account_ifsc_and_bank_optional.sql"
  sed -n '66,141p' "$M/20261020000000_hr_bank_account_ifsc_and_bank_optional.sql"
  awk '/^CREATE OR REPLACE FUNCTION public.fn_is_the_director\(\)/,/^GRANT  EXECUTE ON FUNCTION public.fn_is_the_director\(\)/' "$M/20270520090000_the_director_list.sql"
} > "$WORK/real.sql"
echo "== real objects cut from the repo: $(grep -c 'CREATE OR REPLACE FUNCTION' "$WORK/real.sql") functions (must be 2), $(grep -c 'CREATE TABLE' "$WORK/real.sql") table (must be 1)"

build() { # $1 = migration file to apply (twice)
  wipe "$WORK/pgdata"
  "$BIN/initdb" -D "$WORK/pgdata" -U postgres -A trust >/dev/null || exit 1
  "$BIN/pg_ctl" -D "$WORK/pgdata" -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" -l "$WORK/pg.log" -w start >/dev/null || { cat "$WORK/pg.log"; exit 1; }
  "$BIN/createdb" -h 127.0.0.1 -p "$PORT" -U postgres rehearsal
  local P=("$BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -d rehearsal -X -q -v ON_ERROR_STOP=1)
  "${P[@]}" -f "$HERE/stubs.sql" >/dev/null || { echo "stubs failed"; exit 1; }
  "${P[@]}" -f "$WORK/real.sql" >/dev/null 2>"$WORK/real.err" || { echo "real objects failed"; cat "$WORK/real.err"; exit 1; }
  "${P[@]}" -f "$1" >/dev/null 2>"$WORK/mig1.err" || { echo "migration (1st) failed"; cat "$WORK/mig1.err"; exit 1; }
  "${P[@]}" -f "$1" >/dev/null 2>"$WORK/mig2.err" || { echo "migration (2nd) failed"; cat "$WORK/mig2.err"; exit 1; }
}
probe() { "$BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -d rehearsal -X -q -tA -f "$HERE/probe.sql" 2>"$WORK/probe.err"; }

echo "== the migration as written (applied twice)"
build "$MIG"; probe | grep -E 'PASS|FAIL|RESULT'; grep -E 'ERROR' "$WORK/probe.err" | head -5; stop

mutate() { # $1 = label, $2 = text to replace, $3 = replacement
  python3 - "$MIG" "$WORK/mut.sql" "$2" "$3" <<'PY'
import sys
s = open(sys.argv[1]).read()
assert sys.argv[3] in s, 'mutation anchor missing'
open(sys.argv[2], 'w').write(s.replace(sys.argv[3], sys.argv[4], 1))
PY
  build "$WORK/mut.sql"; local out; out="$(probe)"; stop
  if echo "$out" | grep -q '^FAIL'; then echo "MUTATION CAUGHT | $1 | $(echo "$out" | grep '^FAIL' | head -1)"; else echo "MUTATION MISSED | $1"; fi
}
echo "== mutation controls"
mutate "the before-lookup ignores which row was replaced" "WHERE b.superseded_by = NEW.id AND b.id <> NEW.id" "WHERE b.staff_id = NEW.staff_id AND b.id <> NEW.id AND false"
mutate "the log is readable by everyone" "USING (public.fn_is_the_director());" "USING (true);"
mutate "the full account number is stored" "ELSE right(p_account, 4) END" "ELSE p_account END"
