#!/bin/bash
# Throwaway-Postgres rehearsal of 20271009141300_hr_salary_raises_read_paying_trust.sql:
# the raise machinery reads the paying trust from hr_staff_payroll, not from
# the salary row's copy. Stacked on everything main has (20270519090000,
# #4140, #4190, 20271007180207). Never touches production: no .env file is
# read; the only connection is 127.0.0.1:$PORT to a cluster this script
# creates and deletes.
#
#   1. probe-paying-trust.sql on main's stack WITHOUT this file: its payer
#      checks must FAIL (the bug, shown);
#   2. this file applied twice on top: every line must PASS;
#   3. #4140 + #4190's probe.sql and probe-targets.sql with and without this
#      file: the same PASS counts (nothing else moved).
# Run: bash supabase/tests/hr-salary-revision/run-paying-trust.sh   (PORT= to move it)
set -u
export LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8
BIN=${PG_BIN:-/opt/homebrew/opt/postgresql@16/bin}
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$(cd "$HERE/../../.." && pwd)"   # the repo; read-only
M="$SRC/supabase/migrations"
MIG_BASE="$M/20270519090000_hr_salary_revision_requests.sql"
MIG_4140="$M/20270524090000_hr_salary_revision_director_list.sql"
MIG_4190="$M/20271007150103_hr_salary_revision_no_self_decision.sql"
MIG_TGT="$M/20271007180207_hr_salary_revision_target_gated_raises.sql"
MIG_MINE="$M/20271009141300_hr_salary_raises_read_paying_trust.sql"
FN="$SRC/supabase/setup/02_functions.sql"
PORT=${PORT:-5551}
WORK="$(mktemp -d)"
DATA="$WORK/pgdata"
PSQL=("$BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -d rehearsal -X -q)
MIG="$WORK/combined.sql"
MIG_MAIN="$WORK/main-stack.sql"   # what main has today
cat "$MIG_BASE" "$MIG_4140" "$MIG_4190" "$MIG_TGT" > "$MIG_MAIN"
cat "$MIG_MAIN" "$MIG_MINE" > "$MIG"
teardown() { "$BIN/pg_ctl" -D "$DATA" stop -m fast >/dev/null 2>&1; rm -rf "$WORK"; echo "== torn down"; }
trap teardown EXIT

"$BIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null || exit 1
"$BIN/pg_ctl" -D "$DATA" -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" \
  -l "$WORK/pg.log" -w start >/dev/null || { cat "$WORK/pg.log"; exit 1; }
echo "== server: $("$BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -X -tAc 'select version()' | cut -c1-40)"

# The real objects the stack builds on, cut from the repo exactly as run.sh does.
{ sed -n '57,65p' "$FN"; sed -n '4119,4127p' "$FN"; sed -n '3422,3451p' "$FN"; sed -n '6740,6797p' "$FN"; } > "$WORK/helpers.sql"
echo "   permission helpers loaded: $(grep -c 'CREATE OR REPLACE FUNCTION' "$WORK/helpers.sql") (must be 4)"
awk '/^CREATE OR REPLACE FUNCTION public.fn_my_staff_ids\(\)/,/^GRANT EXECUTE ON FUNCTION public.fn_my_staff_ids\(\) TO authenticated;/' \
  "$M/20260801002600_hr_leave_rls_permission_retrofit.sql" > "$WORK/my-staff-ids.sql"
awk '/^CREATE OR REPLACE FUNCTION public.fn_my_staff_institution_ids\(\)/,/^GRANT EXECUTE ON FUNCTION public.fn_my_staff_institution_ids\(\)/' \
  "$M/20270330090000_institution_department_contacts.sql" > "$WORK/my-staff-inst.sql"
sed -n '/^-- 5\. fn_hr_set_staff_salary/,/^-- 6\. hr_staff_salary_directory/p' \
  "$M/20260902100000_hr_tds_slabs_and_allowance.sql" > "$WORK/set-salary.sql"
f="$(ls "$M"/20270520090000_*.sql 2>/dev/null | head -1)"
if [ -n "$f" ]; then cp "$f" "$WORK/pr4121.sql"
elif ! git -C "$SRC" show jicate/feat/hr-who-is-the-director:supabase/migrations/20270520090000_the_director_list.sql > "$WORK/pr4121.sql" 2>/dev/null; then
  echo "   MISSING #4121's migration: cannot rehearse"; exit 1
fi
cat > "$WORK/salary-columns.sql" <<'SQL'
ALTER TABLE public.hr_staff_salaries
  ADD COLUMN IF NOT EXISTS epf_amount       numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS eligible_for_esi boolean       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS esi_amount       numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.hr_staff_salaries
  ADD COLUMN IF NOT EXISTS allowance_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS allowance_label  text;
SQL

cat > "$WORK/payroll-stub.sql" <<'SQL'
-- hr_staff_payroll as 20260731071358 creates it, less its audit columns,
-- payroll-entity foreign key and row rules (the probe writes it as the owner).
CREATE TABLE public.hr_staff_payroll (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL UNIQUE REFERENCES public.staff(id) ON DELETE CASCADE,
  hr_organization_id uuid NOT NULL REFERENCES public.hr_organizations(id),
  notes text, updated_at timestamptz NOT NULL DEFAULT now());
SQL

build() {  # $1 = the combined migration to apply, $2 = "targets" to load seed-targets.sql
  local PGOPTIONS="-c client_min_messages=warning"; export PGOPTIONS
  "$BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -X -q -c "DROP DATABASE IF EXISTS rehearsal" -c "CREATE DATABASE rehearsal" || return 1
  local f
  for f in "$HERE/stubs.sql" "$M/20260515001001_sync_staff_to_profiles_login_disabled.sql" \
           "$M/20251015_fix_staff_trigger_timing.sql" "$WORK/helpers.sql" "$WORK/my-staff-ids.sql" "$WORK/my-staff-inst.sql" \
           "$M/20260821191000_hr_staff_salaries.sql" "$M/20260821211000_hr_staff_salaries_superseded_by_deferrable.sql" \
           "$WORK/salary-columns.sql" "$WORK/set-salary.sql" "$WORK/pr4121.sql" \
           "$M/20270512090000_hr_salary_suggestion_inputs_rpc.sql" "$HERE/roles.sql" "$HERE/stubs-targets.sql" "$WORK/payroll-stub.sql"; do
    "${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$f" >/dev/null || { echo "   LOAD FAILED: $f"; return 1; }
  done
  "${PSQL[@]}" -c "GRANT EXECUTE ON FUNCTION public.fn_hr_set_staff_salary(uuid, uuid, numeric, date, text, text, numeric, boolean, boolean, boolean, boolean, boolean, text, numeric, boolean, numeric, numeric, text) TO authenticated, service_role" >/dev/null
  "${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$1" >/dev/null || { echo "   MIGRATION FAILED: $1"; return 1; }
  "${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$HERE/seed.sql" >/dev/null || { echo "   SEED FAILED"; return 1; }
  if [ "${2:-}" = targets ]; then
    "${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$HERE/seed-targets.sql" >/dev/null || { echo "   SEED-TARGETS FAILED"; return 1; }
  fi
}
filter() { grep -E "PASS|FAIL|ERROR" | sed 's/^.*NOTICE: *//; s/^psql:[^E]*//'; }

probe() { PGOPTIONS= "${PSQL[@]}" -f "$HERE/$1" 2>&1 | filter; }
count() { echo "$(grep -c '^PASS' "$1") PASS, $(grep -c '^FAIL' "$1") FAIL, $(grep -c 'ERROR' "$1") ERROR"; }
BAD=0

echo "== 1. main today (without this file): the payer checks must FAIL"
build "$MIG_MAIN" || exit 1
probe probe-paying-trust.sql > "$WORK/before.txt"
sed 's/^/   /' "$WORK/before.txt"
echo "   without: $(count "$WORK/before.txt")"
for rule in 'the raise skips the month the NEW paying trust has closed' \
            'the approved raise is written with the NEW paying trust' \
            'the held part is written with the payer on record now'; do
  grep -q "^FAIL $rule" "$WORK/before.txt" \
    || { echo "   the bug did not show for: $rule"; BAD=$((BAD+1)); }
done

echo "== 2. with this file, applied twice"
build "$MIG" || exit 1
PGOPTIONS="-c client_min_messages=warning" "${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$MIG_MINE" >/dev/null \
  && echo "   second apply: ok" || { echo "   second apply: FAILED"; BAD=$((BAD+1)); }
probe probe-paying-trust.sql > "$WORK/after.txt"
sed 's/^/   /' "$WORK/after.txt"
echo "   with: $(count "$WORK/after.txt")"
[ "$(grep -c '^FAIL\|ERROR' "$WORK/after.txt")" = 0 ] || BAD=$((BAD+1))
[ "$(grep -c '^PASS' "$WORK/after.txt")" -ge 8 ] || { echo "   too few lines ran"; BAD=$((BAD+1)); }

echo "== 3. the existing probes, without and with this file"
for p in probe.sql probe-targets.sql; do
  tgt=""; [ "$p" = probe-targets.sql ] && tgt=targets
  build "$MIG_MAIN" $tgt >/dev/null || exit 1; probe "$p" > "$WORK/w0.txt"
  build "$MIG" $tgt >/dev/null || exit 1;      probe "$p" > "$WORK/w1.txt"
  echo "   $p   without: $(count "$WORK/w0.txt")   with: $(count "$WORK/w1.txt")"
  diff <(sort "$WORK/w0.txt") <(sort "$WORK/w1.txt") >/dev/null || { echo "   $p changed:"; diff <(sort "$WORK/w0.txt") <(sort "$WORK/w1.txt") | sed 's/^/      /'; BAD=$((BAD+1)); }
done

[ "$BAD" = 0 ] && echo "RESULT: PASS" || echo "RESULT: FAIL ($BAD)"
exit "$BAD"
