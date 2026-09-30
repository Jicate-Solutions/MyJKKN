#!/bin/bash
# Throwaway-Postgres rehearsal of 20270519090000_hr_salary_revision_requests.sql.
# Never touches production: no .env file is read; the only connection is
# 127.0.0.1:$PORT to a cluster this script creates and deletes.
#
# Loaded VERBATIM from the repo (not re-typed): the permission helpers
# (setup/02_functions.sql, by line range — "functions loaded" must read 4),
# fn_my_staff_ids, fn_my_staff_institution_ids, hr_staff_salaries and its
# deferrable FK, main's newest fn_hr_set_staff_salary (20260902100000 section 5)
# and #4119's migration. stubs.sql stands in for everything else.
#
# Then: the probe on the real migration (every line must be PASS), and one
# MUTATION CONTROL per rule — the rule removed from a copy of the migration,
# the database rebuilt from scratch, and the probe must print that rule's FAIL.
# Run: bash supabase/tests/hr-salary-revision/run.sh
set -u
export LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8
BIN=${PG_BIN:-/opt/homebrew/opt/postgresql@16/bin}
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$(cd "$HERE/../../.." && pwd)"   # the repo; read-only
M="$SRC/supabase/migrations"
MIG_BASE="$M/20270519090000_hr_salary_revision_requests.sql"   # applied to production 30 Sep 2026
MIG_NEW="$M/20270524090000_hr_salary_revision_director_list.sql" # this PR
MIG=""  # the two as one, built below; the mutation controls edit this copy
FN="$SRC/supabase/setup/02_functions.sql"
PORT=${PORT:-5531}
WORK="$(mktemp -d)"
DATA="$WORK/pgdata"
PSQL=("$BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -d rehearsal -X -q)

WORK_EARLY="$(mktemp -d)"
MIG="$WORK_EARLY/combined.sql"
cat "$MIG_BASE" "$MIG_NEW" > "$MIG"
teardown() { "$BIN/pg_ctl" -D "$DATA" stop -m fast >/dev/null 2>&1; rm -rf "$WORK"; echo "== torn down"; }
trap teardown EXIT

# A sibling PR's migration: from this tree if it is merged in, else from its branch.
fetch_sibling() { # $1 = file glob in supabase/migrations, $2 = git ref, $3 = path, $4 = out
  local f; f="$(ls "$SRC"/supabase/migrations/$1 2>/dev/null | head -1)"
  if [ -n "$f" ]; then cp "$f" "$4"; echo "   from the tree: $f"; return 0; fi
  if git -C "$SRC" show "$2:$3" > "$4" 2>/dev/null; then echo "   from $2 ($(git -C "$SRC" rev-parse --short "$2"))"; return 0; fi
  return 1
}

"$BIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null || exit 1
"$BIN/pg_ctl" -D "$DATA" -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" \
  -l "$WORK/pg.log" -w start >/dev/null || { cat "$WORK/pg.log"; exit 1; }
echo "== server: $("$BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -X -tAc 'select version()' | cut -c1-40)"

# The real objects this migration builds on, cut from the repo.
{ sed -n '57,65p' "$FN"; sed -n '4119,4127p' "$FN"; sed -n '3422,3451p' "$FN"; sed -n '6740,6797p' "$FN"; } > "$WORK/helpers.sql"
echo "   permission helpers loaded: $(grep -c 'CREATE OR REPLACE FUNCTION' "$WORK/helpers.sql") (must be 4)"
awk '/^CREATE OR REPLACE FUNCTION public.fn_my_staff_ids\(\)/,/^GRANT EXECUTE ON FUNCTION public.fn_my_staff_ids\(\) TO authenticated;/' \
  "$M/20260801002600_hr_leave_rls_permission_retrofit.sql" > "$WORK/my-staff-ids.sql"
awk '/^CREATE OR REPLACE FUNCTION public.fn_my_staff_institution_ids\(\)/,/^GRANT EXECUTE ON FUNCTION public.fn_my_staff_institution_ids\(\)/' \
  "$M/20270330090000_institution_department_contacts.sql" > "$WORK/my-staff-inst.sql"
sed -n '/^-- 5\. fn_hr_set_staff_salary/,/^-- 6\. hr_staff_salary_directory/p' \
  "$M/20260902100000_hr_tds_slabs_and_allowance.sql" > "$WORK/set-salary.sql"
echo "   fn_hr_set_staff_salary lines cut from main's newest definition: $(wc -l < "$WORK/set-salary.sql" | tr -d ' ')"
echo "== #4121's migration (the Director list)"
fetch_sibling '20270520090000_*.sql' jicate/feat/hr-who-is-the-director \
  supabase/migrations/20270520090000_the_director_list.sql "$WORK/pr4121.sql" || { echo "   MISSING: cannot rehearse"; exit 1; }
cat > "$WORK/salary-columns.sql" <<'SQL'
-- The columns 20260901120000 and 20260902100000 add, as they add them.
ALTER TABLE public.hr_staff_salaries
  ADD COLUMN IF NOT EXISTS epf_amount       numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS eligible_for_esi boolean       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS esi_amount       numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.hr_staff_salaries
  ADD COLUMN IF NOT EXISTS allowance_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS allowance_label  text;
SQL

build() {  # $1 = the migration file to apply
  local PGOPTIONS="-c client_min_messages=warning"; export PGOPTIONS
  "$BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -X -q -c "DROP DATABASE IF EXISTS rehearsal" -c "CREATE DATABASE rehearsal" || return 1
  local f
  for f in "$HERE/stubs.sql" "$WORK/helpers.sql" "$WORK/my-staff-ids.sql" "$WORK/my-staff-inst.sql" \
           "$M/20260821191000_hr_staff_salaries.sql" "$M/20260821211000_hr_staff_salaries_superseded_by_deferrable.sql" \
           "$WORK/salary-columns.sql" "$WORK/set-salary.sql" "$WORK/pr4121.sql" \
           "$M/20270512090000_hr_salary_suggestion_inputs_rpc.sql" "$HERE/roles.sql"; do
    "${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$f" >/dev/null || { echo "   LOAD FAILED: $f"; return 1; }
  done
  "${PSQL[@]}" -c "GRANT EXECUTE ON FUNCTION public.fn_hr_set_staff_salary(uuid, uuid, numeric, date, text, text, numeric, boolean, boolean, boolean, boolean, boolean, text, numeric, boolean, numeric, numeric, text) TO authenticated, service_role" >/dev/null
  "${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$1" >/dev/null || { echo "   MIGRATION FAILED: $1"; return 1; }
  "${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$HERE/seed.sql" >/dev/null || { echo "   SEED FAILED"; return 1; }
}
probe() { PGOPTIONS= "${PSQL[@]}" -f "$HERE/probe.sql" 2>&1 | grep -E "PASS|FAIL|ERROR" | sed 's/^.*NOTICE: *//; s/^psql:[^E]*//'; }

echo "== SECTION 0: this PR's migration BEFORE #4121 must stop, changing nothing"
"$BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -X -q -c "DROP DATABASE IF EXISTS rehearsal" -c "CREATE DATABASE rehearsal"
"${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$HERE/stubs.sql" >/dev/null
"${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$MIG_NEW" 2>&1 | grep -o "ABORT: .*" | sed 's/^/   /'
"${PSQL[@]}" -tAc "SELECT '   objects created anyway: ' || count(*) FROM pg_proc WHERE proname LIKE '%salary_revision%'"

echo "== the applied migration, then this PR's, then this PR's again (it must be re-runnable)"
build "$MIG" || exit 1
PGOPTIONS="-c client_min_messages=warning" "${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$MIG_NEW" >/dev/null && echo "   second apply of this PR's file: ok" || echo "   second apply: FAILED"
build "$MIG" || exit 1
echo "== PROBE (each person as role authenticated)"
probe | tee "$WORK/main.txt" | sed 's/^/   /'
echo "   total: $(grep -c '^PASS' "$WORK/main.txt") PASS, $(grep -c '^FAIL' "$WORK/main.txt") FAIL, $(grep -c 'ERROR' "$WORK/main.txt") ERROR"

CAUGHT=0; MISSED=0
mutate() {  # $1 label, $2 sed program, $3 the FAIL line that must appear
  local out="$WORK/mut.sql"
  sed -E "$2" "$MIG" > "$out"
  local changed; changed=$(diff "$MIG" "$out" | grep -c '^[<>]')
  if [ "$changed" = 0 ]; then echo "   [$1] the edit matched nothing — CONTROL INVALID"; MISSED=$((MISSED+1)); return; fi
  if ! build "$out"; then echo "   [$1] mutated migration did not load"; MISSED=$((MISSED+1)); return; fi
  if probe | grep -qF "FAIL $3"; then
    echo "   [$1] CAUGHT ($changed diff lines): FAIL $3"; CAUGHT=$((CAUGHT+1))
  else
    echo "   [$1] NOT CAUGHT — expected FAIL $3"; MISSED=$((MISSED+1))
  fi
}
echo "== MUTATION CONTROLS: each rule removed; the probe must catch it"
mutate "M1 HOD's department check" \
  's/^        AND v_s.department_id = ANY \(public.fn_hr_salary_revision_my_department_ids\(\)\) THEN/        THEN/' \
  'HOD cannot ask outside own department'
mutate "M2 principal's college check" \
  's/^        AND v_s.institution_id = ANY \(public.fn_my_staff_institution_ids\(\)\) THEN/        THEN/' \
  'principal cannot ask for another college'
mutate "M3 one open request (index AND check removed)" \
  's/^CREATE UNIQUE INDEX IF NOT EXISTS hr_salary_revision_requests_one_open/CREATE INDEX IF NOT EXISTS hr_salary_revision_requests_one_open/; s/^  IF v_open IS NOT NULL THEN/  IF false THEN/' \
  'a second request for a person is refused while one is open'
mutate "M4 only the Director approves" \
  's/^  IF v_uid IS NULL OR NOT public.fn_hr_salary_revision_can_approve\(\) THEN/  IF v_uid IS NULL THEN/' \
  'principal cannot approve'
mutate "M5 principal's check is own college only" \
  's/^     OR NOT \(v_r.institution_id = ANY \(public.fn_my_staff_institution_ids\(\)\)\) THEN/     THEN/' \
  'other college principal cannot check'
mutate "M6 nobody sees a request about their own pay" \
  's/^      NOT \(p_staff_id = ANY \(public.fn_my_staff_ids\(\)\)\)$/      true/' \
  'principal cannot see a request about their own pay'
mutate "M7 HOD sees own department only (RLS)" \
  's/^            AND p_department_id = ANY \(public.fn_hr_salary_revision_my_department_ids\(\)\)\)/            )/' \
  'HOD does not see requests from outside their department'
mutate "M8 reason for a no: asker and principal only" \
  's/^         AND \(r.asked_by = auth.uid\(\)$/         AND (true/' \
  'HR head sees the refused request but not the reason'
mutate "M9 a person sees only their own outcome" \
  's/^    staff_id = ANY \(public.fn_my_staff_ids\(\)\)$/    true/' \
  'the person cannot see anybody else'
mutate "M10 the 1st of NEXT month" \
  "s/^  v_start date := \(date_trunc\('month', p_today\) \+ interval '1 month'\)::date;/  v_start date := date_trunc('month', p_today)::date;/" \
  'approved raise starts on the 1st of next month, at his figure'
mutate "M11 the register reads the pay in force for its month" \
  's/^     WHERE c.effective_from > p_on AND c.depth < 100/     WHERE false/' \
  'this month'"'"'s register still reads the old pay after the raise is written'
mutate "M12 nothing is written before the start date" \
  's/^     WHERE status = '"'"'approved'"'"' AND starts_on <= p_today/     WHERE status = '"'"'approved'"'"'/' \
  'nothing is written before the start date'
mutate "M13 the person is told only after a yes (outcome row)" \
  '/^  INSERT INTO public.hr_salary_revision_outcomes$/,/^  VALUES \(p_request_id, v_r.staff_id/d' \
  'the person sees their own outcome after the yes'
mutate "M14 anon locked out of the ask function" \
  '/^REVOKE EXECUTE ON FUNCTION public.fn_hr_salary_revision_propose\(uuid, numeric, text\) FROM anon, PUBLIC;/d' \
  'anon cannot run the ask function'
mutate "M15 a reason is required" \
  "s/^  IF p_reason IS NULL OR btrim\(p_reason\) = '' THEN/  IF false THEN/" \
  'a blank reason is refused'
mutate "M16 an HOD's request goes via the principal" \
  "s/^  v_route := CASE WHEN v_as = 'hod' AND v_sub_tier < 2 THEN 'via_principal' ELSE 'direct' END;/  v_route := 'direct';/" \
  'HOD request goes to the principal first'
mutate "M17 the ask keys granted to hod" \
  "s/^ WHERE role_key = 'hod';/ WHERE role_key = 'nobody';/" \
  'migration grants the ask keys to principal, hod and hr_head only'
mutate "M18 a month payroll is already working on" \
  's/^    EXIT WHEN NOT EXISTS \($/    EXIT WHEN true OR NOT EXISTS (/' \
  'a month payroll is already working on is skipped'
mutate "M19 the refusal stays away from the person" \
  "s/^    ARRAY\[v_r.asked_by\],$/    ARRAY[v_r.asked_by, (SELECT profile_id FROM public.staff WHERE id = v_r.staff_id)],/" \
  'nobody tells the person about a no'
mutate "M20 only the LIST gives the final yes (30 Sep)" \
  's/^  SELECT public.fn_is_the_director\(\)$/  SELECT public.fn_is_the_director() OR public.is_super_admin()/' \
  'a super admin who is not on the list cannot give the final yes'
mutate "M21 a leaver is cancelled, never written (30 Sep)" \
  '/^      -- 30 Sep: the person left before the start date: cancelled, both told.$/,/^      END IF;$/d' \
  'a raise for someone who left is cancelled, not written'
mutate "M22 a missed start is never written late (30 Sep)" \
  's/^      IF v_r.starts_on < p_today THEN$/      IF false THEN/' \
  'a missed start goes back to the Director instead of being written late'
mutate "M23 comments follow the request-level visibility (30 Sep)" \
  's/^  USING \(EXISTS \(SELECT 1 FROM public.hr_salary_revision_requests r$/  USING (true OR EXISTS (SELECT 1 FROM public.hr_salary_revision_requests r/' \
  'a team member cannot read comments on a request they may not see'
mutate "M24 a principal who is also the HOD is marked (30 Sep)" \
  "s/^  v_also_hod := v_as = 'principal'$/  v_also_hod := false/" \
  'a principal who is also the head of the department goes straight to the Director, marked'
echo "== mutation controls: $CAUGHT caught, $MISSED not caught"
