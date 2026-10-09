#!/bin/bash
# Throwaway-Postgres rehearsal of 20270614090000_hr_pay_destination_changes.sql.
# Never touches production: no .env file is read; the only connection is
# 127.0.0.1:$PORT to a cluster this script creates and deletes.
#
# Loaded VERBATIM from the repo: the hr_staff_bank_accounts table and index
# (20260821240000), its 20261020000000 changes and the newest
# fn_hr_set_staff_bank_account, and fn_is_the_director (20270520090000).
# stubs.sql stands in for everything else. The migration is applied TWICE.
# Then MUTATION CONTROLS: a rule removed from a copy of the migration,
# the database rebuilt, and the probe must print a FAIL.
# Run: bash supabase/tests/hr-pay-destination/run.sh
set -u
export LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8
BIN=${PG_BIN:-/opt/homebrew/opt/postgresql@16/bin}
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$(cd "$HERE/../../.." && pwd)"
M="$SRC/supabase/migrations"
MIG="$M/20270614090000_hr_pay_destination_changes.sql"
PORT=${PORT:-54617}
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
build "$MIG"; out="$(probe)"; echo "$out" | grep -E 'PASS|FAIL|RESULT'; grep -E 'ERROR' "$WORK/probe.err" | head -5; stop
# A check that errors out prints nothing, which would look like a pass: count them.
EXPECT=50; got=$(echo "$out" | grep -cE '^(PASS|FAIL) ')
[ "$got" -eq "$EXPECT" ] && echo "CHECK COUNT OK | $got of $EXPECT checks ran" || echo "CHECK COUNT WRONG | $got of $EXPECT checks ran"

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
mutate "the before-lookup ignores which row was replaced" "WHERE b.staff_id = NEW.staff_id AND b.superseded_by = NEW.id AND b.id <> NEW.id" "WHERE b.staff_id = NEW.staff_id AND b.superseded_by = NEW.id AND false"
mutate "the before-lookup forgets what the log last saw" "WHERE c.staff_id = NEW.staff_id AND c.kind = 'bank'" "WHERE c.staff_id = NEW.staff_id AND false"
mutate "deleting the account in use is not logged" "IF OLD.superseded_by IS NULL
       AND EXISTS" "IF false
       AND EXISTS"
mutate "retiring the account in use with nothing in its place is not logged" "IF TG_OP = 'UPDATE' AND OLD.superseded_by IS NULL
       AND EXISTS" "IF false
       AND EXISTS"
mutate "the log is readable by everyone" "USING (public.fn_is_the_director());" "USING (true);"
mutate "the full account number is stored" "ELSE right(p_account, 4) END" "ELSE p_account END"
mutate "a staff delete erases the history" "ON DELETE SET NULL," "ON DELETE CASCADE,"
mutate "the list inner-joins staff" "    LEFT JOIN public.staff s ON s.id = c.staff_id" "    JOIN public.staff s ON s.id = c.staff_id"
mutate "who the change was for is not kept" "IF NEW.staff_id IS NOT NULL THEN" "IF false THEN"
mutate "the true count stops at the cap" "count(*) OVER ()" "least(count(*) OVER (), 2000)"
mutate "a bank row can be moved to another person" "IF TG_OP = 'UPDATE' AND OLD.staff_id IS DISTINCT FROM NEW.staff_id THEN
    RAISE" "IF false THEN
    RAISE"
mutate "a bank row can point at another person's" "IF NEW.superseded_by IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.hr_staff_bank_accounts n
                  WHERE n.id = NEW.superseded_by AND n.staff_id IS DISTINCT FROM NEW.staff_id) THEN" "IF false THEN"
mutate "another person's row can be written where a pointer waits" "IF EXISTS (SELECT 1 FROM public.hr_staff_bank_accounts o
              WHERE o.superseded_by = NEW.id AND o.id <> NEW.id
                AND o.staff_id IS DISTINCT FROM NEW.staff_id) THEN" "IF false THEN"
mutate "a payer row can be moved to another person" "  IF OLD.staff_id IS DISTINCT FROM NEW.staff_id THEN
    RAISE EXCEPTION 'A paying-trust" "  IF false THEN
    RAISE EXCEPTION 'A paying-trust"
mutate "a row written already retired leaves no removal" "IF TG_OP = 'INSERT'
       AND EXISTS (SELECT 1 FROM public.hr_staff_bank_accounts o" "IF false
       AND EXISTS (SELECT 1 FROM public.hr_staff_bank_accounts o"
mutate "an edit of a register line's number is not logged" "  IF TG_OP = 'UPDATE' AND OLD.bank_account_number IS DISTINCT FROM NEW.bank_account_number THEN
    v_before" "  IF false THEN
    v_before"
mutate "a register line not matching the account on file is not logged" "    IF v_file_number IS NOT DISTINCT FROM NEW.bank_account_number THEN" "    IF true THEN"
mutate "a register entry counts as the account on file" "WHERE c.staff_id = NEW.staff_id AND c.kind = 'bank'" "WHERE c.staff_id = NEW.staff_id"
mutate "the weekly bound is ignored" "     AND (p_until IS NULL OR c.changed_at < p_until)" "     AND true"
mutate "an edit of a register line's trust is not logged" "  IF TG_OP = 'UPDATE' AND OLD.paid_by_organization_id IS DISTINCT FROM NEW.paid_by_organization_id THEN
    IF OLD" "  IF false THEN
    IF OLD"
mutate "a register line naming a trust not on file is not logged" "    IF v_file_org IS NOT DISTINCT FROM NEW.paid_by_organization_id THEN" "    IF true THEN"
mutate "every register line is logged, even with the trust on file" "    IF v_file_org IS NOT DISTINCT FROM NEW.paid_by_organization_id THEN" "    IF false THEN"
mutate "a register line's trust is not watched at all" "  AFTER INSERT OR UPDATE OF paid_by_organization_id, staff_id ON public.hr_salary_register_lines" "  AFTER DELETE ON public.hr_salary_register_lines"
