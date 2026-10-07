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
MIG_NEW="$M/20270524090000_hr_salary_revision_director_list.sql" # #4140
MIG_MINE="$M/20271007150103_hr_salary_revision_no_self_decision.sql" # 1 Oct 2026 rulings, stacked on #4140
MIG=""  # the two as one, built below; the mutation controls edit this copy
FN="$SRC/supabase/setup/02_functions.sql"
PORT=${PORT:-5531}
WORK="$(mktemp -d)"
DATA="$WORK/pgdata"
PSQL=("$BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -d rehearsal -X -q)

WORK_EARLY="$(mktemp -d)"
MIG="$WORK_EARLY/combined.sql"
cat "$MIG_BASE" "$MIG_NEW" "$MIG_MINE" > "$MIG"
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
  # 3 Oct 2026: main's real staff→profiles sync (newest body, 20260515001001)
  # and its BEFORE trigger (20251015_fix_staff_trigger_timing), verbatim.
  for f in "$HERE/stubs.sql" "$M/20260515001001_sync_staff_to_profiles_login_disabled.sql" \
           "$M/20251015_fix_staff_trigger_timing.sql" "$WORK/helpers.sql" "$WORK/my-staff-ids.sql" "$WORK/my-staff-inst.sql" \
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
PGOPTIONS="-c client_min_messages=warning" "${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$MIG_MINE" >/dev/null && echo "   second apply of 20271007150103: ok" || echo "   second apply of 20271007150103: FAILED"
build "$MIG" || exit 1
echo "== PROBE (each person as role authenticated)"
probe | tee "$WORK/main.txt" | sed 's/^/   /'
echo "   total: $(grep -c '^PASS' "$WORK/main.txt") PASS, $(grep -c '^FAIL' "$WORK/main.txt") FAIL, $(grep -c 'ERROR' "$WORK/main.txt") ERROR"

# 1 Oct 2026: the decider seed. With ONE confirmed director@ account that has a
# profile, re-applying the file seeds the row with that profile; a second apply
# leaves an edited row alone.
echo "== 20271007150103 seed: the decider row from director@jkkn.ac.in"
"${PSQL[@]}" -c "SELECT set_config('request.jwt.claims', '', false)" \
  -c "DELETE FROM public.platform_policies WHERE policy_key = 'hr.salary_revision.list_member_raise_decider_profile_id'" \
  -c "INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ('00000000-0000-0000-0000-000000010001', ' Director@JKKN.ac.in', now()), ('00000000-0000-0000-0000-000000010017', 'director@jkkn.ac.in', NULL)" >/dev/null
PGOPTIONS="-c client_min_messages=warning" "${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$MIG_MINE" >/dev/null || echo "   re-apply FAILED"
"${PSQL[@]}" -tAc "SELECT CASE WHEN value = to_jsonb('00000000-0000-0000-0000-000000010001'::text) AND data_type = 'string' AND is_active
                     THEN 'PASS the seed names the one confirmed director@ account' ELSE 'FAIL the seed names the one confirmed director@ account [' || value::text || ']' END
                     FROM public.platform_policies WHERE policy_key = 'hr.salary_revision.list_member_raise_decider_profile_id'
                   UNION ALL SELECT 'FAIL the seed names the one confirmed director@ account [no row]'
                    WHERE NOT EXISTS (SELECT 1 FROM public.platform_policies WHERE policy_key = 'hr.salary_revision.list_member_raise_decider_profile_id')" \
  | tee -a "$WORK/main.txt" | sed 's/^/   /'
"${PSQL[@]}" -c "UPDATE public.platform_policies SET value = to_jsonb('00000000-0000-0000-0000-000000010007'::text) WHERE policy_key = 'hr.salary_revision.list_member_raise_decider_profile_id'" >/dev/null
PGOPTIONS="-c client_min_messages=warning" "${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$MIG_MINE" >/dev/null || echo "   re-apply FAILED"
"${PSQL[@]}" -tAc "SELECT CASE WHEN value = to_jsonb('00000000-0000-0000-0000-000000010007'::text)
                     THEN 'PASS re-applying never resets an edited decider row' ELSE 'FAIL re-applying never resets an edited decider row' END
                     FROM public.platform_policies WHERE policy_key = 'hr.salary_revision.list_member_raise_decider_profile_id'" \
  | tee -a "$WORK/main.txt" | sed 's/^/   /'
echo "   20271007150103 BEFORE #4140 stops, changing nothing:"
"$BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -X -q -c "DROP DATABASE IF EXISTS rehearsal" -c "CREATE DATABASE rehearsal"
"${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$HERE/stubs.sql" >/dev/null
"${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$MIG_MINE" 2>&1 | grep -o "ABORT: .*" | sed 's/^/   /'
"${PSQL[@]}" -tAc "SELECT '   objects created anyway: ' || count(*) FROM pg_proc WHERE proname LIKE '%salary_revision%'"

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
  '/^  INSERT INTO public.hr_salary_revision_outcomes$/,/^  VALUES \(p_request_id, v_r.staff_id/d; /^  ON CONFLICT \(request_id\) DO UPDATE$/,/^         starts_on = EXCLUDED\.starts_on;$/d' \
  'the person sees their own outcome after the yes'
mutate "M14 anon locked out of the ask function" \
  '/^REVOKE EXECUTE ON FUNCTION public.fn_hr_salary_revision_propose\(uuid, numeric, text\) FROM anon, PUBLIC;/d' \
  'anon cannot run the ask function'
mutate "M15 a reason is required" \
  "s/^  IF p_reason IS NULL OR btrim\(p_reason\) = '' THEN/  IF false THEN/" \
  'a blank reason is refused'
mutate "M16 an HOD's request goes via the principal" \
  "s/^  v_route := CASE WHEN v_as = 'hod' .*$/  v_route := 'direct';/" \
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
# 1 Oct 2026: who may decide (20271007150103).
mutate "M25 nobody decides their own raise (every path)" \
  's/^  IF v_own THEN$/  IF false THEN/; s/^  IF v_own_n > 0 THEN$/  IF false THEN/' \
  'the Director cannot approve his own raise'
mutate "M26 a Director-list member's raise: the Director himself only (every path)" \
  's/^    IF v_uid IS DISTINCT FROM v_decider THEN$/    IF false THEN/' \
  'a Director-list member'"'"'s raise cannot be approved by another list member'
mutate "M27 the Director's own raise is refused when asked for" \
  's/^  IF public\.hr_salary_revision_configured_decider_id\(\) = ANY \(v_ident\) THEN$/  IF false THEN/' \
  'the Director'"'"'s own raise is refused when asked for'
mutate "M28 no decider row fails CLOSED (not open)" \
  's/^    IF v_decider IS NULL THEN$/    IF false THEN/; s/^    IF v_uid IS DISTINCT FROM v_decider THEN$/    IF v_decider IS NOT NULL AND v_uid IS DISTINCT FROM v_decider THEN/' \
  'a Director-list member'"'"'s raise cannot be decided while the decider row is missing (fail closed)'
mutate "M29 only the Director list changes the decider row" \
  's/^    IF public.fn_is_the_director\(\) IS NOT TRUE THEN$/    IF false THEN/' \
  'a super admin not on the Director list cannot change who decides'
mutate "M30 the batch refuses own raises up front, and says so" \
  's/^  IF v_own_n > 0 THEN$/  IF false THEN/' \
  'a batch with the Director'"'"'s own raise ticked approves nothing and says why'
# 1 Oct 2026, second round: each decision path on its own, the ask with no
# decider row, the HOD's own raise, and the decider row's record.
mutate "M25a approve_one (the single yes) refuses one's own raise" \
  '/^-- f2\. The yes/,/^-- f3\. /s/^  PERFORM public\.hr_salary_revision_assert_may_decide\(v_r\.staff_id, v_r\.subject_profile_id, v_r\.subject_was_list_member\);$/  NULL;/; s/^  IF position\('"'"'hr_salary_revision_assert_may_decide\(v_r\.staff_id, v_r\.subject_profile_id, v_r\.subject_was_list_member\)'"'"'$/  IF false AND position('"'"'x'"'"'/' \
  'the Director cannot approve his own raise'
mutate "M25b director_decide (the no) refuses one's own raise" \
  '/^-- f3\. The single yes or no/,/^-- f4\. /s/^  PERFORM public\.hr_salary_revision_assert_may_decide\(v_r\.staff_id, v_r\.subject_profile_id, v_r\.subject_was_list_member\);$/  NULL;/' \
  'the Director cannot refuse his own raise'
mutate "M26a a list member's raise: the shared check alone (single yes and no)" \
  '/^-- c\. Rules 1 and 2/,/^-- d\. /s/^    IF v_uid IS DISTINCT FROM v_decider THEN$/    IF false THEN/' \
  "a Director-list member's raise cannot be approved by another list member"
mutate "M26b a list member's raise: the batch's up-front check alone" \
  '/^-- f4\. The tick-box batch/,/^-- g\. /s/^    IF v_uid IS DISTINCT FROM v_decider THEN$/    IF false THEN/' \
  "a batch with a Director-list member's raise approves nothing for another list member"
mutate "M31 the Director's own raise is refused even with no decider row" \
  's/^    IF v_director IS NULL THEN$/    IF false THEN/' \
  "the Director's own raise is refused when asked for, even before the decider row exists"
mutate "M32 an HOD's own raise goes straight to the Director" \
  "s/^  v_route := CASE WHEN v_as = 'hod' AND NOT COALESCE\(v_self, false\) AND v_sub_tier < 2 THEN/  v_route := CASE WHEN v_as = 'hod' AND v_sub_tier < 2 THEN/" \
  "an HOD's own raise goes straight to the Director"
mutate "M33 a change to the decider row is written to the audit log" \
  "s/^  WHEN \(NEW\.policy_key = 'hr\.salary_revision\.list_member_raise_decider_profile_id'\)$/  WHEN (false)/" \
  'the change is written to the policy audit log, naming who made it'
mutate "M34 a signed-in person cannot delete the decider row" \
  "s/^  IF TG_OP = 'DELETE' AND v_role IS NOT NULL AND v_role IS DISTINCT FROM 'service_role' THEN$/  IF false THEN/" \
  'someone on the Director list cannot delete it (switch it off instead), so its record stays'
# 1 Oct 2026, round two: whose raise it is (snapshot), the principal's check,
# yeses given before the rules, the per-row can_decide, renames.
mutate "M35 a raise for another HOD still goes via the principal" \
  "s/^  v_route := CASE WHEN v_as = 'hod' AND NOT COALESCE\(v_self, false\) AND v_sub_tier < 2 THEN/  v_route := CASE WHEN v_as = 'hod' AND NOT COALESCE(v_self, false) AND v_sub_tier < 1 THEN/" \
  'a raise for another HOD still goes to the principal first'
mutate "M36 own = the account it was about when asked (snapshot)" \
  's/^           ARRAY\[p_subject_profile_id\]$/           ARRAY[NULL::uuid]/' \
  'the Director cannot approve his own raise after unlinking his staff record'
mutate "M36b the principal's check uses the same own test" \
  's/^  IF public\.hr_salary_revision_is_own\(v_r\.staff_id, v_r\.subject_profile_id\) THEN$/  IF v_r.staff_id = ANY (public.fn_my_staff_ids()) THEN/' \
  'a principal cannot check a request about their own pay after unlinking that staff record'
mutate "M37 a list member's raise by the snapshot too" \
  's/^           ARRAY\[p_subject_profile_id\]$/           ARRAY[NULL::uuid]/' \
  'someone who joined the list after the ask and was then unlinked is still a list member for that raise'
mutate "M38 own through a staff record that is no longer active (the fallback)" \
  's/^           \|\| ARRAY\[\(SELECT s\.profile_id FROM public\.staff s WHERE s\.id = p_staff_id\)\]$/           || ARRAY[NULL::uuid]/' \
  'nobody decides their own raise through a staff record of theirs that is no longer active'
mutate "M39 an unlinked record with a Director-list email is not asked for" \
  's/^     AND public\.hr_salary_revision_email_profile_ids\(p_staff_id\) && public\.hr_salary_revision_director_ids\(\) THEN$/     AND false THEN/' \
  'an unlinked staff record whose email is on the Director list cannot be asked for until it is linked'
mutate "M40 the principal's stop on a list member's raise goes on to the Director" \
  's/^  IF public\.hr_salary_revision_is_list_member\(v_r\.staff_id, v_r\.subject_profile_id, v_r\.subject_was_list_member\) THEN$/  IF false THEN/' \
  "a principal's stop on a Director-list member's raise goes on to the Director instead"
mutate "M41 a yes against the rules is never written" \
  's/^      IF NOT v_r\.decided_under_rules$/      IF false/' \
  'a raise approved against the rules is never written, and is left exactly as it was'
mutate "M42 the held list is the Director list's only" \
  '/^-- h\. RULE 6/,/^-- g\. /s/^  IF auth\.uid\(\) IS NULL OR NOT public\.fn_hr_salary_revision_can_approve\(\) THEN$/  IF auth.uid() IS NULL THEN/' \
  'only the Director list may open the list of yeses held back'
mutate "M43 can_decide: never one's own" \
  's/^          AND NOT public\.hr_salary_revision_is_own\(r\.staff_id, r\.subject_profile_id\)$/          AND true/' \
  "the Director's list says, row by row, which ones he may decide"
mutate "M44 can_decide: a list member's raise only for the Director himself" \
  's/^               OR v_uid IS NOT DISTINCT FROM public\.hr_salary_revision_list_member_raise_decider_id\(\)\)\)$/               OR true))/' \
  "another list member's list marks their own raise and a list member's raise as not theirs to decide"
mutate "M45 the decider row cannot be renamed by a signed-in person" \
  "s/^  IF TG_OP = 'UPDATE' AND OLD\.policy_key = c_key AND NEW\.policy_key IS DISTINCT FROM c_key$/  IF false/" \
  'someone on the Director list cannot rename the decider row'
mutate "M46 the ask keeps whose raise it is" \
  's/^    p_staff_id, v_s\.profile_id, v_s\.institution_id,/    p_staff_id, NULL, v_s.institution_id,/' \
  'the account a request is about is kept when it is asked'

# 1 Oct 2026, round three: Employee Salaries (rule 7) and the stamp (rule 6).
mutate "M48 a stamped yes is always written (the stamp counts)" \
  's/^      IF NOT v_r\.decided_under_rules$/      IF true/' \
  'a stamped yes is written on its start date even after the decider setting changes (job run by a signed-in list member)'
mutate "M49 approve_one stamps its yes" \
  '/^-- f2\. The yes/,/^-- f3\. /s/^         decided_under_rules = true$/         decided_under_rules = false/' \
  'a yes given under these rules is stamped'
mutate "M50 the held list leaves stamped yeses out" \
  's/^     AND \(NOT r\.decided_under_rules OR public\.hr_salary_revision_is_unlinked\(r\.staff_id, r\.subject_profile_id\)\)$/     AND true/' \
  'a stamped yes is never on the held list, whatever the setting says now'
mutate "M51 Employee Salaries: never one's own pay" \
  's/^    IF public\.hr_salary_revision_is_own\(v_staff, NULL\) THEN$/    IF false THEN/' \
  'nobody changes their own pay on Employee Salaries'
mutate "M52 Employee Salaries: a list member's pay only by the Director himself" \
  's/^    IF public\.hr_salary_revision_is_list_member\(v_staff, NULL\)$/    IF false/' \
  'the HR head cannot change the pay of someone on the Director list'
mutate "M53 Employee Salaries: the Director himself may" \
  's/^       AND v_uid IS DISTINCT FROM public\.hr_salary_revision_list_member_raise_decider_id\(\) THEN$/       THEN/' \
  "the Director himself can change a list member's pay"
mutate "M54 the approvals job names its request" \
  "s/^      PERFORM set_config\('app\.hr_salary_revision_apply', v_r\.id::text, true\);$/      NULL;/" \
  'a stamped yes is written on its start date even after the decider setting changes (job run by a signed-in list member)'
mutate "M55 the trigger lets the approvals job through for a yes that passed" \
  "s/^  IF v_req IS NOT NULL AND TG_OP <> 'DELETE' AND EXISTS \($/  IF false AND EXISTS (/" \
  'a stamped yes is written on its start date even after the decider setting changes (job run by a signed-in list member)'

# 1 Oct 2026, round three (reviewer notes): the named decider only, rule 8
# (linked to no account), can_decide for a leaver, the decider yes/no grant.
mutate "M59 only the person the setting names now may change it" \
  "s/^       OR auth\.uid\(\)::text IS DISTINCT FROM lower\(OLD\.value #>> '\{\}'\) THEN$/       OR false THEN/" \
  'another list member who is not named in the setting cannot change it'
mutate "M60 rule 8 on the single yes and no" \
  's/^  IF public\.hr_salary_revision_is_unlinked\(p_staff_id, p_subject_profile_id\) THEN$/  IF false THEN/' \
  'nobody decides a raise for a record linked to no account'
mutate "M61 rule 8 on the batch, up front" \
  's/^                AND public\.hr_salary_revision_is_unlinked\(r\.staff_id, r\.subject_profile_id\)\) THEN$/                AND false) THEN/' \
  'a batch with a raise for a record linked to no account approves nothing and says why'
mutate "M62 rule 8 on the principal's check" \
  's/^  IF public\.hr_salary_revision_is_unlinked\(v_r\.staff_id, v_r\.subject_profile_id\) THEN$/  IF false THEN/' \
  'a principal cannot check a raise for a record linked to no account'
mutate "M63 rule 8 in the approvals job" \
  's/^      IF public\.hr_salary_revision_is_unlinked\(v_r\.staff_id, v_r\.subject_profile_id\) THEN$/      IF false THEN/' \
  'a yes for a record linked to no account is never written, and is left as it was'
mutate "M64 can_decide is false for someone who has left" \
  's/^          AND EXISTS \(SELECT 1 FROM public\.v_hr_staff vs WHERE vs\.id = r\.staff_id AND COALESCE\(vs\.is_active, false\)\)$/          AND true/' \
  'can_decide is false for someone who has left, and for a record linked to no account'
mutate "M65 can_decide is false for a record linked to no account" \
  's/^          AND NOT public\.hr_salary_revision_is_unlinked\(r\.staff_id, r\.subject_profile_id\)$/          AND true/' \
  'can_decide is false for someone who has left, and for a record linked to no account'
mutate "M66 the decider yes/no is not granted to signed-in users" \
  's/^REVOKE EXECUTE ON FUNCTION public\.fn_hr_salary_revision_is_list_member_raise_decider\(\) FROM anon, PUBLIC, authenticated;$/REVOKE EXECUTE ON FUNCTION public.fn_hr_salary_revision_is_list_member_raise_decider() FROM anon, PUBLIC;/' \
  'the decider yes/no is not open to signed-in users (no screen asks it)'

# Round six: one "who the request is about" for every decision path, and a
# staff delete's cascade to its pay rows.
mutate "M86 every decision path counts the email half of who a request is about" \
  's/^           \|\| public\.hr_salary_revision_email_profile_ids\(p_staff_id\)$/           || ARRAY[]::uuid[]/' \
  "a list member cannot approve their own raise on a record linked to a decoy but carrying their email"
mutate "M87 deleting a staff record takes its pay rows with it" \
  "s/^  IF TG_OP = 'DELETE' AND NOT EXISTS \(SELECT 1 FROM public\.staff s WHERE s\.id = OLD\.staff_id\) THEN$/  IF false THEN/" \
  'a signed-in user can still delete a staff record that has pay rows'
mutate "M88 the ask counts the email half too (linked records)" \
  's/^  v_ident := public\.hr_salary_revision_request_identity\(p_staff_id, v_s\.profile_id\);$/  v_ident := ARRAY[v_s.profile_id];/' \
  "a raise for a record linked to a decoy but carrying the Director's email is refused when asked for"
# Round seven: taking people off the Director list, and "on the list" as then
# OR now OR the Director himself by the decider row.
mutate "M94 only the Director himself takes anyone off the list" \
  's/^  IF v_uid IS DISTINCT FROM v_decider THEN$/  IF false THEN/' \
  'a list member who is not the Director himself cannot take someone off the list'
mutate "M95 a raise asked while on the list stays a list member's" \
  's/^  SELECT COALESCE\(p_was_member, false\)$/  SELECT false/' \
  "a raise asked while the person was on the Director list stays the Director's after they are taken off"
mutate "M96 the Director himself is known by the decider row, on the list or not" \
  's/^      OR COALESCE\(public\.hr_salary_revision_configured_decider_id\(\)$/      OR COALESCE(NULL::uuid/' \
  "the Director's pay cannot be changed by the HR head even when he is off the list"
mutate "M97 nobody signed in takes the Director himself off the list" \
  's/^  IF v_decider IS NOT NULL AND v_decider::text = ANY \(v_removed\) THEN$/  IF false THEN/' \
  'nor can the Director himself take himself off'
mutate "M98 switching the list off counts as taking everyone off" \
  "s/^                     AND NEW\.is_active IS TRUE AND jsonb_typeof\(NEW\.value\) = 'array'$/                     AND jsonb_typeof(NEW.value) = 'array'/" \
  'switching the list off counts as taking everyone off'
mutate "M99 the ask records whether the person was on the list" \
  's/^    v_ident && public\.hr_salary_revision_director_ids\(\)\)$/    false)/' \
  "a raise asked while the person was on the Director list stays the Director's after they are taken off"
# Round six add-ons: the identity guard's early return, blank emails, the
# legacy auto-link, and a direct delete of own / list pay.
mutate "M89 the identity guard still fires when the email changes" \
  's/^     AND NEW\.email IS NOT DISTINCT FROM OLD\.email$/     AND true/' \
  'changing the emails on your own unlinked record is refused'
mutate "M90 the identity guard still fires when the institution email changes" \
  's/^     AND NEW\.institution_email IS NOT DISTINCT FROM OLD\.institution_email THEN$/     AND true THEN/' \
  "changing a linked record's institution email to the Director's is refused"
mutate "M91 the identity guard still fires when the link changes" \
  "/^-- k\. ONE identity guard/,/^-- g\. /s/^     AND NEW\.profile_id IS NOT DISTINCT FROM OLD\.profile_id$/     AND true/" \
  'linking your own unlinked record to a decoy is refused'
mutate "M92 a blank email matches nobody" \
  "s/IN \(lower\(NULLIF\(btrim\(p_email\), ''\)\), lower\(NULLIF\(btrim\(p_institution_email\), ''\)\)\)$/IN (lower(btrim(p_email)), lower(btrim(p_institution_email)))/" \
  "a record with a blank email matches no account with a blank email"
mutate "M93 the sync linking a legacy record to the account its email already matched is not a change of who it is" \
  's/^  IF v_old = v_new THEN$/  IF v_old = v_new AND NEW.profile_id IS NOT DISTINCT FROM OLD.profile_id THEN/' \
  "an unrelated edit on a legacy unlinked record with an open raise passes"
# Round five add-ons: pay only for a linked record (except a joiner's first
# pay), and the approvals-job pass limited to the "replaced by" pointer.
mutate "M83 no signed-in pay change on a record linked to no account" \
  's/^    IF NOT EXISTS \(SELECT 1 FROM public\.staff s WHERE s\.id = v_staff AND s\.profile_id IS NOT NULL\)$/    IF false/' \
  'nobody signed in changes the pay of a record linked to no account'
mutate "M84 a new joiner's first pay can still be set" \
  "s/^       AND NOT \(TG_OP = 'INSERT'$/       AND NOT (false/" \
  "a new joiner's first pay can be set before the record is linked, but not changed after"
mutate "M85 the job's pass changes only the replaced-by pointer" \
  "s/^                     AND to_jsonb\(NEW\) - ARRAY\['superseded_by', 'updated_at', 'updated_by', 'annual_gross'\]$/                     AND true OR to_jsonb(NEW) - ARRAY['superseded_by', 'updated_at', 'updated_by', 'annual_gross']/" \
  'while the job names a request, the row it replaces may change only its "replaced by" pointer'
# Round five (3 Oct 2026): ONE identity guard on staff (who a record is: its
# linked account plus the accounts its emails belong to), and the decider's own
# active records in the rule-6 judge.
mutate "M71 nobody changes who their own record is" \
  's/^  IF v_uid = ANY \(v_all\) THEN$/  IF false THEN/' \
  'nobody relinks their own record to another account (or unlinks it)'
mutate "M72 nobody changes who a list member's record is" \
  's/^  IF v_all && public\.hr_salary_revision_director_ids\(\) THEN$/  IF false THEN/' \
  "nobody relinks a Director-list member's record, or links one to a list member"
mutate "M73 a record with an open revision keeps who it is" \
  "s/^                AND r\.status IN \('waiting_principal', 'waiting_director', 'approved'\)\) THEN$/                AND false) THEN/" \
  'a record with an open salary revision keeps its link until it is decided'
mutate "M74 a new joiner's record can still be linked (no over-blocking)" \
  's/^  IF v_all && public\.hr_salary_revision_director_ids\(\) THEN$/  IF v_all IS NOT NULL THEN/' \
  "HR links a new joiner's record to their new account"
mutate "M77 super admins are not exempt from the identity guard" \
  "/^-- k\. ONE identity guard/,/^-- g\. /s/^  IF v_uid IS NULL OR auth\.role\(\) IS NOT DISTINCT FROM 'service_role' THEN$/  IF v_uid IS NULL OR auth.role() IS NOT DISTINCT FROM 'service_role' OR public.is_super_admin() IS TRUE THEN/" \
  'a super admin cannot relink or unlink their own record'
mutate "M78 nobody creates a record that is themselves" \
  's/^    IF v_uid = ANY \(v_new\) THEN$/    IF false THEN/' \
  'nobody signed in creates a record that is themselves'
mutate "M79 nobody signed in creates a record that is a list member" \
  's/^    IF v_new && public\.hr_salary_revision_director_ids\(\) THEN$/    IF false THEN/' \
  'nobody signed in creates a record that is someone on the Director list'
mutate "M80 a record's emails are part of who it is" \
  's/^                \|\| public\.hr_salary_revision_email_profile_ids_for\(p_email, p_institution_email\)\) AS x$/                ) AS x/' \
  'linking your own unlinked record to a decoy is refused'
mutate "M81 the identity guard fires after the sync trigger" \
  's/trg_zz_staff_identity_raise_guard/trg_aa_staff_identity_raise_guard/g' \
  'setting institution_email on a record with an open revision (the sync relinks it) is refused'
mutate "M76 rule 6 counts a yes through the decider's own record" \
  's/^         AND \(p_decided_by = ANY \(public\.hr_salary_revision_request_identity\(p_staff_id, p_subject_profile_id\)\)$/         AND (false/; s/^              OR p_staff_id IN \(SELECT s\.id FROM public\.staff s WHERE s\.profile_id = p_decided_by AND s\.is_active\)\)$/              OR false)/' \
  "a yes approved through the decider's own active record is held back"

# Round four (3 Oct 2026): a staff record linked to no account is matched by email.
mutate "M67 Employee Salaries: an unlinked record with the caller's email is their own" \
  's/^           \|\| public\.hr_salary_revision_email_profile_ids\(p_staff_id\)$/           || ARRAY[]::uuid[]/' \
  'unlinking your own record does not let you change your own pay'
mutate "M68 Employee Salaries: an unlinked record with a list member's email is theirs" \
  's/^           \|\| public\.hr_salary_revision_email_profile_ids\(p_staff_id\)$/           || ARRAY[]::uuid[]/' \
  "unlinking the Director's record does not let the HR head change his pay"
mutate "M69 Employee Salaries: a new joiner with nobody's email stays editable" \
  's/^         && public\.hr_salary_revision_director_ids\(\)$/         IS NOT NULL/' \
  'HR still sets the pay of a new joiner with no account and nobody'"'"'s email'
mutate "M70 the email match covers the institution email too" \
  "s/^   WHERE lower\(btrim\(u\.email\)\) IN \(lower\(NULLIF\(btrim\(p_email\), ''\)\), lower\(NULLIF\(btrim\(p_institution_email\), ''\)\)\)$/   WHERE lower(btrim(u.email)) = lower(NULLIF(btrim(p_email), ''))/" \
  'unlinking your own record does not let you change your own pay'

# Section 0's ledger check and the end self-check act while the file is being
# applied, so they are checked here, on a database that has everything up to
# #4140 (and, for the ledger, a supabase_migrations table as production has).
cat "$MIG_BASE" "$MIG_NEW" > "$WORK/upto4140.sql"
apply_over_4140() {  # $1 = the 20271007150103 file; $2 = ledger: none | empty | recorded | byname | recorded-noname
  build "$WORK/upto4140.sql" >/dev/null || { echo "build failed"; return; }
  if [ "$2" = recorded-noname ]; then
    "${PSQL[@]}" -c "CREATE SCHEMA supabase_migrations" -c "CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY)" \
      -c "INSERT INTO supabase_migrations.schema_migrations VALUES ('20270524090000')" >/dev/null
  elif [ "$2" != none ]; then
    "${PSQL[@]}" -c "CREATE SCHEMA supabase_migrations" -c "CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY, name text)" >/dev/null
    [ "$2" = recorded ] && "${PSQL[@]}" -c "INSERT INTO supabase_migrations.schema_migrations VALUES ('20270524090000', 'hr_salary_revision_director_list')" >/dev/null
    # Hand-applied under another version: found by its name.
    [ "$2" = byname ] && "${PSQL[@]}" -c "INSERT INTO supabase_migrations.schema_migrations VALUES ('20270930120000', 'hr_salary_revision_director_list')" >/dev/null
  fi
  if PGOPTIONS="-c client_min_messages=warning" "${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$1" > "$WORK/apply.out" 2>&1; then
    echo "applied"
  else
    grep -oE "(ABORT|SELF-CHECK): .*" "$WORK/apply.out" | head -1
  fi
  "${PSQL[@]}" -tAc "SELECT 'column created: ' || count(*) FROM information_schema.columns WHERE table_name = 'hr_salary_revision_requests' AND column_name = 'subject_profile_id'"
}
ledger_check() {  # $1 = file; prints PASS or FAIL
  local a b c d
  a="$(apply_over_4140 "$1" empty | tr '\n' ' ')"
  b="$(apply_over_4140 "$1" recorded | tr '\n' ' ')"
  c="$(apply_over_4140 "$1" byname | tr '\n' ' ')"
  d="$(apply_over_4140 "$1" recorded-noname | tr '\n' ' ')"
  if [[ "$a$b$c$d" == *"build failed"* ]]; then
    echo "INVALID the database up to #4140 did not build"; return
  fi
  if [[ "$a" == "ABORT: 20270524090000 (#4140) is not recorded"*"Apply #4140 through the wave first."*"column created: 0"* && "$b" == "applied column created: 1"* && "$c" == "applied column created: 1"* && "$d" == "applied column created: 1"* ]]; then
    echo "PASS the file refuses to run until #4140 is in the migration ledger (by version, or by name)"
  else
    echo "FAIL the file refuses to run until #4140 is in the migration ledger (by version, or by name)  [$a | $b | $c | $d]"
  fi
}
selfcheck_check() {  # $1 = file; $2 = expect: applied | SELF-CHECK
  local a; a="$(apply_over_4140 "$1" none | head -1)"
  if [[ "$a" == "build failed"* ]]; then echo "INVALID the database up to #4140 did not build"; return; fi
  if [[ "$a" == "$2"* ]]; then echo "PASS self-check: $2"; else echo "FAIL self-check: expected $2, got [$a]"; fi
}
echo "== section 0's ledger check and the end self-check"
ledger_check "$MIG_MINE" | tee -a "$WORK/main.txt" | sed 's/^/   /'
selfcheck_check "$MIG_MINE" applied | tee -a "$WORK/main.txt" | sed 's/^/   /'
sed -E "s/^  IF to_regclass\('supabase_migrations\.schema_migrations'\) IS NOT NULL THEN$/  IF false THEN/" "$MIG_MINE" > "$WORK/mine-noledger.sql"
if [ "$(diff "$MIG_MINE" "$WORK/mine-noledger.sql" | grep -c '^[<>]')" = 0 ]; then
  echo "   [M56 the ledger check] CONTROL INVALID"; MISSED=$((MISSED+1))
elif ledger_check "$WORK/mine-noledger.sql" | grep -q '^FAIL'; then
  echo "   [M56 the ledger check] CAUGHT: FAIL the file refuses to run until #4140 is in the migration ledger"; CAUGHT=$((CAUGHT+1))
else
  echo "   [M56 the ledger check] NOT CAUGHT"; MISSED=$((MISSED+1))
fi
sed -E '/^-- f2\. The yes/,/^-- f3\. /s/^  PERFORM public\.hr_salary_revision_assert_may_decide\(v_r\.staff_id, v_r\.subject_profile_id, v_r\.subject_was_list_member\);$/  NULL;/' "$MIG_MINE" > "$WORK/mine-nocheck.sql"
if [ "$(diff "$MIG_MINE" "$WORK/mine-nocheck.sql" | grep -c '^[<>]')" = 0 ]; then
  echo "   [M57 the end self-check] CONTROL INVALID"; MISSED=$((MISSED+1))
elif selfcheck_check "$WORK/mine-nocheck.sql" SELF-CHECK | grep -q '^PASS'; then
  echo "   [M57 the end self-check] CAUGHT: a file whose approve_one lost the check stops with SELF-CHECK"; CAUGHT=$((CAUGHT+1))
else
  echo "   [M57 the end self-check] NOT CAUGHT"; MISSED=$((MISSED+1))
fi

sed -E 's/Apply #4140 through the wave first\./Record it first./' "$MIG_MINE" > "$WORK/mine-oldmsg.sql"
if [ "$(diff "$MIG_MINE" "$WORK/mine-oldmsg.sql" | grep -c '^[<>]')" = 0 ]; then
  echo "   [M58 the ledger refusal says: through the wave] CONTROL INVALID"; MISSED=$((MISSED+1))
elif ledger_check "$WORK/mine-oldmsg.sql" | grep -q '^FAIL'; then
  echo "   [M58 the ledger refusal says: through the wave] CAUGHT: FAIL the file refuses to run until #4140 is in the migration ledger"; CAUGHT=$((CAUGHT+1))
else
  echo "   [M58 the ledger refusal says: through the wave] NOT CAUGHT"; MISSED=$((MISSED+1))
fi

sed -E "s/OR name LIKE \\\$2\\)'$/OR (false AND name LIKE \$2))'/" "$MIG_MINE" > "$WORK/mine-noname.sql"
if [ "$(diff "$MIG_MINE" "$WORK/mine-noname.sql" | grep -c '^[<>]')" = 0 ]; then
  echo "   [M75 the ledger finds #4140 by name] CONTROL INVALID"; MISSED=$((MISSED+1))
elif ledger_check "$WORK/mine-noname.sql" | grep -q '^FAIL'; then
  echo "   [M75 the ledger finds #4140 by name] CAUGHT: FAIL the file refuses to run until #4140 is in the migration ledger (by version, or by name)"; CAUGHT=$((CAUGHT+1))
else
  echo "   [M75 the ledger finds #4140 by name] NOT CAUGHT"; MISSED=$((MISSED+1))
fi

# The backfill runs only when the file is applied over older requests, so it
# is checked here, on a request written before a (re-)apply, not in the probe.
backfill() {  # $1 = the 20271007150103 file to re-apply; prints PASS or FAIL
  build "$MIG" >/dev/null || { echo "FAIL backfill: build"; return; }
  "${PSQL[@]}" -c "SELECT set_config('request.jwt.claims', '', false)" \
    -c "INSERT INTO public.hr_salary_revision_requests (staff_id, institution_id, asked_by, asked_as, route, current_monthly_gross, asked_monthly_gross, reason, status, director_decided_by, director_decided_at) VALUES ('00000000-0000-0000-0000-000000020011', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000010002', 'hr_head', 'direct', 48000, 50000, 'older', 'refused', '00000000-0000-0000-0000-000000010001', now()), ('00000000-0000-0000-0000-000000020001', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000010002', 'hr_head', 'direct', 200000, 210000, 'older D', 'refused', '00000000-0000-0000-0000-000000010001', now())" >/dev/null
  PGOPTIONS="-c client_min_messages=warning" "${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$1" >/dev/null || { echo "FAIL backfill: re-apply"; return; }
  "${PSQL[@]}" -tAc "SELECT CASE WHEN subject_profile_id = '00000000-0000-0000-0000-000000010011' THEN 'PASS' ELSE 'FAIL' END
                     || ' the migration fills in whose raise it is for older requests'
                     FROM public.hr_salary_revision_requests WHERE reason = 'older'"
  # 3 Oct 2026: and whether the person was on the Director list (D is; F1 is not).
  "${PSQL[@]}" -tAc "SELECT CASE WHEN (SELECT subject_was_list_member FROM public.hr_salary_revision_requests WHERE reason = 'older') IS FALSE
                                  AND (SELECT subject_was_list_member FROM public.hr_salary_revision_requests WHERE reason = 'older D') IS TRUE
                     THEN 'PASS' ELSE 'FAIL' END || ' the migration fills in whether the person was on the Director list'"
}
echo "== the backfill of subject_profile_id"
backfill "$MIG_MINE" | tee -a "$WORK/main.txt" | sed 's/^/   /'
sed -E 's/^   AND r\.subject_profile_id IS NULL$/   AND false/' "$MIG_MINE" > "$WORK/mine-nobackfill.sql"
if [ "$(diff "$MIG_MINE" "$WORK/mine-nobackfill.sql" | grep -c '^[<>]')" = 0 ]; then
  echo "   [M47 the backfill] the edit matched nothing — CONTROL INVALID"; MISSED=$((MISSED+1))
elif backfill "$WORK/mine-nobackfill.sql" | grep -q '^FAIL the migration fills in'; then
  echo "   [M47 the backfill] CAUGHT: FAIL the migration fills in whose raise it is for older requests"; CAUGHT=$((CAUGHT+1))
else
  echo "   [M47 the backfill] NOT CAUGHT"; MISSED=$((MISSED+1))
fi
sed -E 's/^ WHERE r\.subject_was_list_member IS NULL;$/ WHERE false;/' "$MIG_MINE" > "$WORK/mine-nowasbackfill.sql"
if [ "$(diff "$MIG_MINE" "$WORK/mine-nowasbackfill.sql" | grep -c '^[<>]')" = 0 ]; then
  echo "   [M100 the was-on-the-list backfill] CONTROL INVALID"; MISSED=$((MISSED+1))
elif backfill "$WORK/mine-nowasbackfill.sql" | grep -q '^FAIL the migration fills in whether the person was on the Director list'; then
  echo "   [M100 the was-on-the-list backfill] CAUGHT: FAIL the migration fills in whether the person was on the Director list"; CAUGHT=$((CAUGHT+1))
else
  echo "   [M100 the was-on-the-list backfill] NOT CAUGHT"; MISSED=$((MISSED+1))
fi
echo "== mutation controls: $CAUGHT caught, $MISSED not caught"
