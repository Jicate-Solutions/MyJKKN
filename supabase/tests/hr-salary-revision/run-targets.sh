#!/bin/bash
# Throwaway-Postgres rehearsal of 20271007180207_hr_salary_revision_target_gated_raises.sql
# (target-gated raises, rulings of 7 Oct 2026), stacked on #4140 and #4190.
# Never touches production: no .env file is read; the only connection is
# 127.0.0.1:$PORT to a cluster this script creates and deletes.
#
# The same real objects run.sh loads, verbatim from the repo, plus
# stubs-targets.sql (the five target sources). Then:
#   1. this file BEFORE #4190 stops, changing nothing; it re-applies cleanly;
#   2. #4140 + #4190's own probe (probe.sql) on the full stack, with the
#      increment set to 100% so nothing is held: every line must still PASS
#      (the re-created approve_one, apply_due_on and pay guard keep their rules);
#   3. probe-targets.sql (every line must be PASS);
#   4. one MUTATION CONTROL per rule of this file: the rule removed from a
#      copy, the database rebuilt, and probe-targets.sql must print its FAIL.
# Run: bash supabase/tests/hr-salary-revision/run-targets.sh   (PORT= to move it)
set -u
export LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8
BIN=${PG_BIN:-/opt/homebrew/opt/postgresql@16/bin}
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$(cd "$HERE/../../.." && pwd)"   # the repo; read-only
M="$SRC/supabase/migrations"
MIG_BASE="$M/20270519090000_hr_salary_revision_requests.sql"
MIG_4140="$M/20270524090000_hr_salary_revision_director_list.sql"
MIG_4190="$M/20271007150103_hr_salary_revision_no_self_decision.sql"
MIG_MINE="$M/20271007180207_hr_salary_revision_target_gated_raises.sql"
FN="$SRC/supabase/setup/02_functions.sql"
PORT=${PORT:-5541}
WORK="$(mktemp -d)"
DATA="$WORK/pgdata"
PSQL=("$BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -d rehearsal -X -q)
MIG="$WORK/combined.sql"
cat "$MIG_BASE" "$MIG_4140" "$MIG_4190" "$MIG_MINE" > "$MIG"
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

build() {  # $1 = the combined migration to apply, $2 = "targets" to load seed-targets.sql
  local PGOPTIONS="-c client_min_messages=warning"; export PGOPTIONS
  "$BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -X -q -c "DROP DATABASE IF EXISTS rehearsal" -c "CREATE DATABASE rehearsal" || return 1
  local f
  for f in "$HERE/stubs.sql" "$M/20260515001001_sync_staff_to_profiles_login_disabled.sql" \
           "$M/20251015_fix_staff_trigger_timing.sql" "$WORK/helpers.sql" "$WORK/my-staff-ids.sql" "$WORK/my-staff-inst.sql" \
           "$M/20260821191000_hr_staff_salaries.sql" "$M/20260821211000_hr_staff_salaries_superseded_by_deferrable.sql" \
           "$WORK/salary-columns.sql" "$WORK/set-salary.sql" "$WORK/pr4121.sql" \
           "$M/20270512090000_hr_salary_suggestion_inputs_rpc.sql" "$HERE/roles.sql" "$HERE/stubs-targets.sql"; do
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
probe_targets() { PGOPTIONS= "${PSQL[@]}" -f "$HERE/probe-targets.sql" 2>&1 | filter; }
probe_off() { PGOPTIONS= "${PSQL[@]}" -f "$HERE/probe-targets-off.sql" 2>&1 | filter; }

echo "== SECTION 0: this file BEFORE #4190 must stop, changing nothing"
cat "$MIG_BASE" "$MIG_4140" > "$WORK/no4190.sql"
build "$WORK/no4190.sql" >/dev/null || exit 1
"${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$MIG_MINE" 2>&1 | grep -o "ABORT: .*" | sed 's/^/   /'
"${PSQL[@]}" -tAc "SELECT '   objects created anyway: ' || ((SELECT count(*) FROM pg_proc WHERE proname LIKE '%salary_revision_target%')
                                                       + (SELECT count(*) FROM pg_class WHERE relname LIKE 'hr_salary_revision_target%'))"

echo "== the full stack, then this file again (it must be re-runnable)"
build "$MIG" targets || exit 1
PGOPTIONS="-c client_min_messages=warning" "${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$MIG_MINE" >/dev/null \
  && echo "   second apply of 20271007180207: ok" || echo "   second apply of 20271007180207: FAILED"
"${PSQL[@]}" -tAc "SELECT '   seed left alone on re-apply: ' || (SELECT count(*) FROM public.platform_policies WHERE policy_key = 'hr.salary_revision.target_rules')"

echo "== #4140 + #4190's probe on the full stack (increment set to 100%: nothing held)"
build "$MIG" || exit 1
"${PSQL[@]}" -c "UPDATE public.platform_policies SET value = jsonb_set(value, '{annual_increment_percent}', '100') WHERE policy_key = 'hr.salary_revision.target_rules'" >/dev/null
PGOPTIONS= "${PSQL[@]}" -f "$HERE/probe.sql" 2>&1 | filter > "$WORK/stacked.txt"
echo "   total: $(grep -c '^PASS' "$WORK/stacked.txt") PASS, $(grep -c '^FAIL' "$WORK/stacked.txt") FAIL, $(grep -c 'ERROR' "$WORK/stacked.txt") ERROR"
grep -E '^FAIL|ERROR' "$WORK/stacked.txt" | sed 's/^/   /'

echo "== #4140 + #4190's probe on the full stack at the real 5% (the start-date figure is pay + increment)"
build "$MIG" || exit 1
PGOPTIONS= "${PSQL[@]}" -f "$HERE/probe.sql" 2>&1 | filter > "$WORK/stacked5.txt"
echo "   total: $(grep -c '^PASS' "$WORK/stacked5.txt") PASS, $(grep -c '^FAIL' "$WORK/stacked5.txt") FAIL, $(grep -c 'ERROR' "$WORK/stacked5.txt") ERROR"
grep -E '^FAIL|ERROR' "$WORK/stacked5.txt" | sed 's/^/   /'

echo "== PROBE (raise targets; each person as role authenticated)"
build "$MIG" targets || exit 1
probe_targets | tee "$WORK/main.txt" | sed 's/^/   /'
echo "   total: $(grep -c '^PASS' "$WORK/main.txt") PASS, $(grep -c '^FAIL' "$WORK/main.txt") FAIL, $(grep -c 'ERROR' "$WORK/main.txt") ERROR"

echo "== PROBE (round 6: measurement switched OFF, the shipped state)"
build "$MIG" targets || exit 1
probe_off | tee "$WORK/off.txt" | sed 's/^/   /'
echo "   total: $(grep -c '^PASS' "$WORK/off.txt") PASS, $(grep -c '^FAIL' "$WORK/off.txt") FAIL, $(grep -c 'ERROR' "$WORK/off.txt") ERROR"

[ "${SKIP_MUT:-}" = 1 ] && exit 0   # quick runs while editing
CAUGHT=0; MISSED=0
mutate() {  # $1 label, $2 sed program (applied to the combined file), $3 the FAIL line that must appear
  local out="$WORK/mut.sql"
  sed -E "$2" "$MIG" > "$out"
  local changed; changed=$(diff "$MIG" "$out" | grep -c '^[<>]')
  if [ "$changed" = 0 ]; then echo "   [$1] the edit matched nothing — CONTROL INVALID"; MISSED=$((MISSED+1)); return; fi
  if ! build "$out" targets >/dev/null; then echo "   [$1] mutated migration did not load"; MISSED=$((MISSED+1)); return; fi
  if probe_targets | grep -qF "FAIL $3"; then
    echo "   [$1] CAUGHT ($changed diff lines): FAIL $3"; CAUGHT=$((CAUGHT+1))
  else
    echo "   [$1] NOT CAUGHT — expected FAIL $3"; MISSED=$((MISSED+1))
  fi
}
mutate_off() {  # as mutate, against probe-targets-off.sql
  local out="$WORK/mut.sql"
  sed -E "$2" "$MIG" > "$out"
  local changed; changed=$(diff "$MIG" "$out" | grep -c '^[<>]')
  if [ "$changed" = 0 ]; then echo "   [$1] the edit matched nothing — CONTROL INVALID"; MISSED=$((MISSED+1)); return; fi
  if ! build "$out" targets >/dev/null; then echo "   [$1] mutated migration did not load"; MISSED=$((MISSED+1)); return; fi
  if probe_off | grep -qF "FAIL $3"; then
    echo "   [$1] CAUGHT ($changed diff lines): FAIL $3"; CAUGHT=$((CAUGHT+1))
  else
    echo "   [$1] NOT CAUGHT — expected FAIL $3"; MISSED=$((MISSED+1))
  fi
}
echo "== MUTATION CONTROLS: each rule removed; the probe must catch it"
mutate "T1 the split holds back the rest" \
  "s/^                 THEN LEAST\(round\(v_base \* \(v_rules->>'annual_increment_percent'\)::numeric \/ 100\), v_final - v_base\)$/                 THEN v_final - v_base/" \
  'the yes splits a raise: 5% of the pay now as the increment, the rest held'
mutate "T2 a raise below 5% is all increment" \
  "s/LEAST\(round\(v_base \* \(v_rules->>'annual_increment_percent'\)::numeric \/ 100\), v_final - v_base\)/round(v_base * (v_rules->>'annual_increment_percent')::numeric \/ 100)/" \
  'a raise below the increment is all increment, nothing held'
mutate "T3 the start date writes pay + increment only" \
  's/^      v_held := COALESCE\(\(SELECT p\.held_amount FROM public\.hr_salary_revision_target_plans p$/      v_held := 0 * COALESCE((SELECT p.held_amount FROM public.hr_salary_revision_target_plans p/' \
  'the start date writes pay + increment, not the held part'
mutate "T4 the apply marker expects the figure less the held part" \
  's/^( +)- COALESCE\(\(SELECT p\.held_amount FROM public\.hr_salary_revision_target_plans p$/\1- 0 * COALESCE((SELECT p.held_amount FROM public.hr_salary_revision_target_plans p/' \
  "a Director-list member's increment is written when HR runs the approvals job (the apply marker)"
mutate "T5 only a met month releases" \
  "s/^        IF v_p\.state = 'waiting' AND v_row\.status IN \('met', 'decided_met'\) THEN$/        IF v_p.state = 'waiting' AND v_row.status IN ('met', 'decided_met', 'missed') THEN/" \
  'month 1 with one target missed is counted as missed, and nothing is paid'
mutate "T6 the 1st after the met month, when run on that 1st" \
  's/hr_salary_revision_start_date\(v_p\.staff_id, p_today - 1\)/hr_salary_revision_start_date(v_p.staff_id, p_today)/' \
  'the first month with all five met releases the held part on the 1st of the next month, at pay + held'
mutate "T7 never backdated" \
  "s/^  v_eff := public\.hr_salary_revision_start_date\(v_p\.staff_id, p_today - 1\);$/  v_eff := date_trunc('month', p_today)::date;/" \
  'a month the Director decides as met releases the held part, from the NEXT 1st (never backdated)'
mutate "T8 window over: back to the Director" \
  "s/^           SET state = 'back_to_director', state_reason = 'window_over', updated_at = now\(\)$/           SET updated_at = now()/" \
  'not met by month 6: back to the Director with the numbers, nothing held paid'
mutate "T9 only the window's months count" \
  's/^                     THEN \(v_p\.window_start \+ make_interval\(months => v_p\.window_months - 1\)\)::date$/                     THEN v_cur_m/' \
  'nothing is paid after the window, even for a month with all five met'
mutate "T10 three missed months pause it" \
  "s/^          IF v_p\.missed_in_row \+ 1 >= \(v_p\.rules->>'pause_after_missed_months'\)::int THEN$/          IF v_p.missed_in_row + 1 >= 99 THEN/" \
  'three missed months in a row pause the held part: pay - held, from the 1st'
mutate "T11 the pause is exactly pay - held" \
  "s/THEN -v_p\.held_amount ELSE v_p\.held_amount END;$/THEN -2 * v_p.held_amount ELSE v_p.held_amount END;/" \
  'three missed months in a row pause the held part: pay - held, from the 1st'
mutate "T12 back on target resumes it" \
  "s/^        ELSIF v_p\.state = 'paused' AND v_row\.status IN \('met', 'decided_met'\) THEN$/        ELSIF false THEN/" \
  'back on target: the held part is paid again, from the next 1st'
mutate "T13 a month with no classes counts neither way" \
  "s/^                         WHEN COALESCE\(v_t1_den, 0\) = 0 THEN 'not_counted'  -- default d$/                         WHEN false THEN 'not_counted'/" \
  'a month with no classes counts neither way'
mutate "T14 a flagged month counts neither way" \
  "s/^        v_status := CASE WHEN v_flagged THEN 'flagged'$/        v_status := CASE WHEN false THEN 'flagged'/" \
  'a flagged month is counted as neither met nor missed: all five met, still nothing paid'
mutate "T15 Director list at the yes" \
  's/^  ELSIF public\.hr_salary_revision_is_list_member\(v_r\.staff_id, v_r\.subject_profile_id, v_r\.subject_was_list_member\) THEN$/  ELSIF false THEN/' \
  "a Director-list member's held part is listed at the yes, never measured"
mutate "T16 Director list at the run" \
  's/^        IF public\.hr_salary_revision_is_list_member\(v_r\.staff_id, v_r\.subject_profile_id, v_r\.subject_was_list_member\) THEN$/        IF false THEN/' \
  'someone put on the Director list after the yes is not released either'
mutate "T17 the principal waits for principal targets" \
  's/^    IF v_wait IS NOT NULL THEN$/    IF false THEN/' \
  "the principal's own raise gets no target-based part, even holding the faculty role"
mutate "T18 not teaching: nothing target-based" \
  "s/v_state := 'held_listed'; v_reason := 'no_teaching_timetable';/v_state := 'waiting'; v_role := 'faculty';/" \
  'someone who does not teach gets no target-based part: parked, no teaching timetable (a timetable made just now and never marked does not count)'
mutate "T19 the raise keeps its own copy of the targets" \
  "s/FROM public\.hr_salary_revision_target_measure\(v_p\.staff_id, v_m, v_p\.rules->'targets'\) m;/FROM public.hr_salary_revision_target_measure(v_p.staff_id, v_m, public.hr_salary_revision_target_rules()->'role_targets'->v_p.target_role) m;/" \
  "month 2 was measured on the raise's own copy (85), not the edited setting (99)"
mutate "T20 only the Director list edits the rules" \
  "s/^    IF v_role IS DISTINCT FROM 'authenticated' OR public\.fn_is_the_director\(\) IS NOT TRUE THEN$/    IF v_role IS DISTINCT FROM 'authenticated' THEN/" \
  'a super admin not on the Director list cannot change the raise rules'
mutate "T21 the rules' shape is checked" \
  "s/^  IF NEW\.policy_key = 'hr\.salary_revision\.target_rules' AND NOT public\.hr_salary_revision_target_rules_ok\(NEW\.value\) THEN$/  IF false THEN/" \
  'a malformed raise rules value is refused, even from the Director'
mutate "T22 no rules, no yes (fail closed)" \
  's/^  IF v_rules IS NULL THEN$/  IF false THEN/' \
  'with the raise rules switched off, the yes is refused and nothing changes'
mutate "T23 the run refuses a signed-in session" \
  "s/^  IF auth\.uid\(\) IS NOT NULL OR COALESCE\(auth\.role\(\), 'service_role'\) <> 'service_role' THEN$/  IF false THEN/" \
  "the run refuses a session carrying a signed-in user, even the database owner's"
mutate "T24 the cron (service role) may run it" \
  's/^GRANT  EXECUTE ON FUNCTION public\.fn_hr_salary_revision_targets_run\(\) TO service_role;$/REVOKE EXECUTE ON FUNCTION public.fn_hr_salary_revision_targets_run() FROM service_role;/' \
  'the service role (the cron) runs it'
mutate "T25 internal functions stay internal" \
  '/^REVOKE EXECUTE ON FUNCTION public\.hr_salary_revision_target_pay\(uuid, text, date\) FROM anon, PUBLIC, authenticated;$/d' \
  'signed-in users cannot call the new internal functions'
mutate "T26 moving college lapses the held part" \
  's/^        IF NOT EXISTS \(SELECT 1 FROM public\.v_hr_staff s$/        IF false AND NOT EXISTS (SELECT 1 FROM public.v_hr_staff s/' \
  'moving to another college while waiting: the held part lapses, listed'
mutate "T27 only a principal flags" \
  "/^CREATE OR REPLACE FUNCTION public\.fn_hr_salary_revision_target_flag\(/,/^\\\$function\\\$;/s/^  IF NOT public\.user_has_permission\('hr\.payroll\.salary_revision\.college_check'\)$/  IF false/" \
  "a head of department (no principal's check) cannot flag a month"
mutate "T28 never on one's own raise" \
  's/^     OR public\.hr_salary_revision_is_own\(v_r\.staff_id, v_r\.subject_profile_id\) THEN$/     THEN/' \
  'a principal cannot flag a month of their own raise'
mutate "T29 only the Director decides a flagged month" \
  '/^CREATE OR REPLACE FUNCTION public\.fn_hr_salary_revision_target_decide\(/,/^\$function\$;/s/^  IF v_uid IS NULL OR NOT public\.fn_hr_salary_revision_can_approve\(\) THEN$/  IF v_uid IS NULL THEN/' \
  'a super admin not on the Director list cannot decide a flagged month'
mutate "T30 the person never sees the principal's note" \
  '/^CREATE POLICY hr_salary_revision_target_flags_select/,/can_read/s/^  USING \(public\.hr_salary_revision_target_can_read\(request_id\)\);$/  USING (true);/' \
  "the person sees their own plan and months, never the principal's note"
mutate "T31 nobody writes the plans directly" \
  '/^REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.hr_salary_revision_target_plans, public\.hr_salary_revision_target_months,$/,/FROM authenticated;$/d' \
  'the person cannot write their own plan or months'
mutate "T32 pay guard: exactly the held amount" \
  "s/AND NEW\.monthly_gross = \(SELECT x\.monthly_gross \+ CASE WHEN p\.pending_action = 'pause' THEN -p\.held_amount ELSE p\.held_amount END$/AND NEW.monthly_gross > 0 AND 0 < (SELECT x.monthly_gross + CASE WHEN p.pending_action = 'pause' THEN -p.held_amount ELSE p.held_amount END/" \
  'the marker with the wrong amount is refused'
mutate "T33 pay guard: only that person" \
  's/^            AND p\.staff_id = NEW\.staff_id AND r\.staff_id = NEW\.staff_id$/            AND true/' \
  'the marker on the wrong person is refused'
mutate "T34 pay guard: only the step the state calls for" \
  "s/^            AND \(\(p\.pending_action = 'release' AND p\.state = 'waiting'\)$/            AND ((p.pending_action IS NOT NULL)/" \
  'the marker for a step the state does not call for (resume while paid) is refused'
mutate "T35 pay guard: only on the planned date" \
  's/^                        NEW\.effective_from = p\.pending_effective_from$/                        NEW.effective_from IS NOT NULL/' \
  'the marker on the wrong date is refused'
mutate "T36 pay guard: the marker refuses, never waves through" \
  "s/^    RAISE EXCEPTION 'The held part of a raise can be written only by the monthly targets run, for that person, at exactly the pay in force plus or minus the held part\\.'$/    RETURN NEW; RAISE EXCEPTION 'x'/" \
  'the marker alone (no planned step) is refused, even for the SQL console'
mutate "T37 T1: marked by them" \
  's/^  SELECT k\.\* FROM marks k, me WHERE me\.who IS NOT NULL AND k\.marker_id = me\.who AND k\.marked_at IS NOT NULL$/  SELECT k.* FROM marks k, me WHERE me.who IS NOT NULL AND k.marker_id IS NOT NULL AND k.marked_at IS NOT NULL/' \
  "T1 counts only periods the server stamped as theirs within 24 h of the end and not before the start, each period once: not late, not early, not someone else's, not unstamped, not a second period of the same name"
mutate "T38 T1: within 24 h" \
  "s/^                    \+ make_interval\(hours => \(p_targets->>'t1_mark_within_hours'\)::int\)$/                    + interval '1000 days'/" \
  "T1 counts only periods the server stamped as theirs within 24 h of the end and not before the start, each period once: not late, not early, not someone else's, not unstamped, not a second period of the same name"
mutate "T39 T1: off-days left out" \
  's/^                      WHERE o\.institution_id = t\.institution_id AND o\.off_date = dd\.d\)$/                      WHERE false)/' \
  'T1 leaves out off-days, approved college leaves and nameless periods (not pending leaves); an ended, switched-off timetable still counts, its replacement does not count twice'
mutate "T40 T1: only approved leaves left out" \
  "s/^                      WHERE l\.institution_id = t\.institution_id AND l\.status = 'approved'$/                      WHERE l.institution_id = t.institution_id/" \
  'T1 leaves out off-days, approved college leaves and nameless periods (not pending leaves); an ended, switched-off timetable still counts, its replacement does not count twice'
mutate "T41 T2: their own draft left fails the course" \
  's/^                        AND l\.created_by::text = me\.who\)$/                        AND false)/' \
  'T2 is not met with their own draft left, or with only a lesson they typed and published themselves'
mutate "T41b T2: a colleague's draft does not count against them" \
  's/^                        AND l\.created_by::text = me\.who\)$/                        )/' \
  "T2: a colleague's draft does not count against them; a self-typed lesson still does not count"
mutate "T41c T2: a self-typed, self-published lesson does not count" \
  "s/^                    AND \(l\.source <> 'faculty' OR l\.created_by::text IS DISTINCT FROM me\.who\)\)$/                    )/" \
  'T2 is not met with their own draft left, or with only a lesson they typed and published themselves'
mutate "T42 T3 waits for T2" \
  's/^       \(SELECT t2\.den > 0 AND t2\.num = t2\.den FROM t2\)$/       true/' \
  'T3 is counted only once T2 is met: 11 of 17 linked on the approved course, still not met'
mutate "T43 T4: material switched off does not count" \
  's/^               AND r\.is_active$/               AND true/' \
  'T4 counts their own periods with material posted by the end of the day and still on (4 of 21 is below 25%)'
mutate "T43b T4: posted by the end of that day" \
  "s/^               AND r\.posted_at < \(\(k\.d \+ 1\)::timestamp AT TIME ZONE 'Asia\/Kolkata'\)\)\)::int AS num$/               AND true))::int AS num/" \
  'T4 counts their own periods with material posted by the end of the day and still on (4 of 21 is below 25%)'
mutate "T43c T4: only their own scheduled periods" \
  's/^               AND r\.timetable_id = k\.timetable_id AND r\.attendance_date = k\.d AND r\.period_id = k\.entry_id$/               AND r.timetable_id = k.timetable_id/' \
  'T4 counts their own periods with material posted by the end of the day and still on (4 of 21 is below 25%)'
mutate "T44 T5: an automatic pulse does not count" \
  's/^    JOIN me ON me\.who IS NOT NULL AND lp\.created_by::text = me\.who$/    JOIN me ON me.who IS NOT NULL AND (lp.created_by::text = me.who OR lp.created_by IS NULL)/' \
  'T5 counts only pulses they opened in that week: not a poll drafted and closed, not one the automation opened, not one opened later for a past week'
mutate "T44b T5: a poll drafted and closed never reached open" \
  "s/^                     AND ip\.issued_at IS NOT NULL AND ip\.created_by::text = me\.who$/                     AND ip.created_by::text = me.who/; s/^                     AND date_trunc\('week', \(ip\.issued_at AT TIME ZONE 'Asia\/Kolkata'\)::date\) = date_trunc\('week', lp\.attendance_date\)\)$/                     AND true)/" \
  'T5 counts only pulses they opened in that week: not a poll drafted and closed, not one the automation opened, not one opened later for a past week'
mutate "T44d T5: a poll the automation opened is not theirs" \
  's/^                     AND ip\.issued_at IS NOT NULL AND ip\.created_by::text = me\.who$/                     AND ip.issued_at IS NOT NULL/' \
  'T5 counts only pulses they opened in that week: not a poll drafted and closed, not one the automation opened, not one opened later for a past week'
mutate "T44e T5: a poll that reached open counts" \
  's/^     AND \(EXISTS \(SELECT 1 FROM public\.induction_session_poll ip$/     AND (false AND EXISTS (SELECT 1 FROM public.induction_session_poll ip/' \
  'T5 is met with a pulse they opened in every course-week (one week only through a poll that reached open, one only through direct pulses closed since)'
mutate "T44c T5: Monday-to-Sunday weeks" \
  "s/^  SELECT DISTINCT course_id, date_trunc\('week', d\)::date AS wk FROM slots$/  SELECT DISTINCT course_id, date_trunc('month', d)::date AS wk FROM slots/" \
  'T5 counts only pulses they opened in that week: not a poll drafted and closed, not one the automation opened, not one opened later for a past week'
mutate "T45 each slot paired with one attendance entry" \
  's/^                        AND n\.period_name = s\.period_name AND n\.rn = s\.rn$/                        AND n.period_name = s.period_name/' \
  'T4 at 7 of 21 (33%) is met: material for one of two same-named periods counts once'
mutate "T46 T1: a nameless period is left out" \
  's/^   WHERE r\.period_name IS NOT NULL$/   WHERE true/; s/^    JOIN chosen c ON c\.d = r\.d AND c\.period_name = r\.period_name AND c\.timetable_id = r\.timetable_id$/    JOIN chosen c ON c.d = r.d AND c.period_name IS NOT DISTINCT FROM r.period_name AND c.timetable_id = r.timetable_id/' \
  'T1 leaves out off-days, approved college leaves and nameless periods (not pending leaves); an ended, switched-off timetable still counts, its replacement does not count twice'
mutate "T47 first mark: written once, never moved" \
  's/^      ON CONFLICT \(timetable_id, attendance_date, period_name, ordinal\) DO NOTHING;$/      ON CONFLICT (timetable_id, attendance_date, period_name, ordinal) DO UPDATE SET marker_profile_id = EXCLUDED.marker_profile_id, first_marked_at = EXCLUDED.first_marked_at;/' \
  'clearing and re-marking, re-keying, removing and re-marking, or deleting and re-inserting the row never move the first marker or time'
mutate "T48 first mark: the server key names nobody" \
  "s/^    v_marker := CASE WHEN auth\.role\(\) IS NOT DISTINCT FROM 'service_role' THEN NULL ELSE auth\.uid\(\) END;$/    v_marker := auth.uid();/" \
  "a write with the server key is recorded with no marker and the server's own time (never counts)"
mutate "T48b first mark: the server's time, not the browser's" \
  "s/^      SELECT NEW\.timetable_id, NEW\.attendance_date, v_name, g, NEW\.institution_id, v_marker, now\(\)$/      SELECT NEW.timetable_id, NEW.attendance_date, v_name, g, NEW.institution_id, v_marker, '2020-01-01'::timestamptz/" \
  "the first marking is recorded with the signed-in marker and the server's time, not what the browser sent"
mutate "T48c first mark: each period of the same name gets its own record" \
  's/^        FROM generate_series\(1, v_count\) g$/        FROM generate_series(1, 1) g/' \
  "a second period of the same name, first marked later by a colleague, is that colleague's"
mutate "T48d first mark: nobody signed in writes the record" \
  '/^REVOKE ALL ON public\.attendance_first_marks FROM anon, PUBLIC, authenticated, service_role;$/d' \
  'nobody signed in can write, change or delete the record, and each reads only their own'
mutate "T48e T1 reads the n-th record for the n-th period" \
  's/^                        AND fm\.period_name = public\.attendance_first_mark_period_key\(s\.period_name\) AND fm\.ordinal = s\.rn$/                        AND fm.period_name = public.attendance_first_mark_period_key(s.period_name)/' \
  "T1 counts only periods the server stamped as theirs within 24 h of the end and not before the start, each period once: not late, not early, not someone else's, not unstamped, not a second period of the same name"
mutate "T49 one held raise at a time: the ask" \
  's/^              WHERE tp\.staff_id = p_staff_id$/              WHERE false/' \
  'a new raise is refused while the earlier held part is open'
mutate "T50 one held raise at a time: the yes" \
  's/^              WHERE tp\.staff_id = v_r\.staff_id AND tp\.request_id <> p_request_id$/              WHERE false/' \
  'an older ask cannot be approved while the earlier held part is open'
mutate "T51 the start date writes nothing when the pay changed since the yes" \
  's/^                  WHERE p\.request_id = v_r\.id AND p\.base_monthly_gross IS DISTINCT FROM v_cur\.monthly_gross\) THEN$/                  WHERE false) THEN/' \
  'the pay changed since the yes: the start date writes nothing, notes it, and lists it'
mutate "T52 only the Director lapses a held part" \
  '/^CREATE OR REPLACE FUNCTION public\.fn_hr_salary_revision_target_lapse\(/,/^\$function\$;/s/^  IF v_uid IS NULL OR NOT public\.fn_hr_salary_revision_can_approve\(\) THEN$/  IF v_uid IS NULL THEN/' \
  'nobody but the Director lapses a held part'
mutate "T53 a met month after release resets the count" \
  's/^             SET missed_in_row = 0, updated_at = now\(\)$/             SET updated_at = now()/' \
  'a met month after release starts the missed-in-a-row count again (F5: missed, met, missed, missed: still paid)'
mutate "T54 pay guard: only an applied yes stamped under #4190's rules" \
  "s/^            AND r\.status = 'applied' AND r\.decided_under_rules$/            AND true/" \
  "the marker for a yes not stamped under #4190's rules is refused"
mutate "T55 pay guard: never someone on the Director list" \
  's/^            AND NOT public\.hr_salary_revision_is_list_member\(r\.staff_id, r\.subject_profile_id, r\.subject_was_list_member\)$/            AND true/' \
  'the marker never writes the pay of someone on the Director list'
mutate "T56 pay guard: never a record linked to no account" \
  's/^            AND NOT public\.hr_salary_revision_is_unlinked\(r\.staff_id, r\.subject_profile_id\)$/            AND true/' \
  'the marker never writes the pay of a record linked to no account'
mutate "T57 the run skips and lists a record linked to no account" \
  '/^CREATE OR REPLACE FUNCTION public\.hr_salary_revision_targets_run_one\(/,/^\$function\$;/s/^      IF public\.hr_salary_revision_is_unlinked\(v_r\.staff_id, v_r\.subject_profile_id\) THEN$/      IF false THEN/' \
  'the monthly run skips a record linked to no account and lists it'
mutate "T58 the run never touches a paid list member's pay, and lists it" \
  "s/^      IF v_p\.state IN \('released', 'paused'\)$/      IF false/" \
  'someone put on the Director list after the held part was paid: skipped and listed, pay untouched'
mutate "T59 the run skips a raise not yet written" \
  "s/^      IF v_r\.status IS DISTINCT FROM 'applied' THEN$/      IF false THEN/" \
  'the monthly run skips a raise not yet written (F10, its start date wrote nothing)'
mutate "T60 several roles with targets: listed, not measured" \
  "s/v_state := 'held_listed'; v_reason := 'several_target_roles:' \|\| array_to_string\(v_match, ','\);/v_state := 'waiting'; v_role := v_match[1];/" \
  'two roles with targets: listed for the Director, not measured'
mutate "T61 never one's own month decision (list member, not the Director)" \
  '/^CREATE OR REPLACE FUNCTION public\.fn_hr_salary_revision_target_decide\(/,/^\$function\$;/s/^  PERFORM public\.hr_salary_revision_assert_may_decide\(v_r\.staff_id, v_r\.subject_profile_id, v_r\.subject_was_list_member\);$/  NULL;/' \
  'a Director-list member who is not the Director cannot decide a month of their own raise'
mutate "T62 never one's own lapse (list member, not the Director)" \
  '/^CREATE OR REPLACE FUNCTION public\.fn_hr_salary_revision_target_lapse\(/,/^\$function\$;/s/^  PERFORM public\.hr_salary_revision_assert_may_decide\(v_r\.staff_id, v_r\.subject_profile_id, v_r\.subject_was_list_member\);$/  NULL;/' \
  'a Director-list member who is not the Director cannot lapse their own held part'
mutate "T63 a lapse needs a held part to lapse" \
  "s/^  IF NOT FOUND OR v_p\.state NOT IN \('awaiting_measurement', 'waiting', 'released', 'paused', 'back_to_director', 'held_listed'\) THEN$/  IF NOT FOUND THEN/" \
  'a lapse is refused for a raise with no held part to lapse'
mutate "T64 a missed start lapses the held part" \
  "s/^           SET state = 'lapsed', state_reason = 'start_missed', updated_at = now\(\)$/           SET updated_at = now()/" \
  'a request that leaves approved unwritten lapses its held part, and it is listed'
mutate "T65 a leaver before the start date lapses the held part" \
  "s/^           SET state = 'lapsed', state_reason = 'left_before_start', updated_at = now\(\)$/           SET updated_at = now()/" \
  'someone who leaves before the start date: the raise is cancelled and its held part lapses, listed'
mutate "T66 T1: never before the session began" \
  "s/^             AND \(k\.marked_at AT TIME ZONE 'Asia\/Kolkata'\) >= k\.d \+ COALESCE\(k\.start_time, time '00:00'\)\)::int AS num$/             )::int AS num/" \
  "T1 counts only periods the server stamped as theirs within 24 h of the end and not before the start, each period once: not late, not early, not someone else's, not unstamped, not a second period of the same name"
mutate "T67 one held raise at a time counts parked parts (the ask)" \
  "s/^                AND tp\.state IN \('awaiting_measurement', 'waiting', 'released', 'paused', 'held_listed', 'back_to_director'\)\) THEN$/                AND tp.state IN ('awaiting_measurement', 'waiting', 'released', 'paused')) THEN/" \
  "a new raise is refused while an earlier held part is parked (the principal's own)"
mutate "T68 one held raise at a time counts parked parts (the yes)" \
  "/^CREATE OR REPLACE FUNCTION public\.hr_salary_revision_approve_one\(/,/^\\\$function\\\$;/s/^                AND tp\.state IN \('awaiting_measurement', 'waiting', 'released', 'paused', 'held_listed', 'back_to_director'\)\) THEN$/                AND tp.state IN ('awaiting_measurement', 'waiting', 'released', 'paused')) THEN/" \
  'an older ask cannot be approved while an earlier held part is parked (not teaching)'
mutate "T69 whoever teaches gets the faculty targets" \
  's/^      ELSIF public\.hr_salary_revision_target_teaches\(v_r\.staff_id,$/      ELSIF false AND public.hr_salary_revision_target_teaches(v_r.staff_id,/' \
  "a teacher whose role key is not 'faculty' gets the faculty targets (they teach; their semester ended and was switched off; they marked in it)"
mutate "T70 teaching means a timetable in the 90 days before the yes" \
  's/^       AND t\.start_date <= p_to AND t\.end_date >= p_from$/       AND true/' \
  'someone who does not teach gets no target-based part: parked, no teaching timetable (a timetable made just now and never marked does not count)'
mutate "T71 one person per call: marked as run, the next night starts with whoever was not" \
  's/^  UPDATE public\.hr_salary_revision_target_plans SET last_run_on = p_today, failed_nights = 0$/  UPDATE public.hr_salary_revision_target_plans SET failed_nights = 0/' \
  "a time-out on one person leaves the others' results written, and that person first in line"
mutate "T72 at most the set number of months per call" \
  's/^        EXIT WHEN v_measured >= p_max_months;$/        NULL;/' \
  'one call measures at most the set number of months; the rest wait for the next run'
mutate "T73 a paid held part: only the months the pause rule can use" \
  "s/^      v_from := CASE WHEN v_p\.state IN \('released', 'paused'\)$/      v_from := CASE WHEN false/" \
  'a paid held part is measured only for the months the pause rule can use'
mutate "T74 T5: a direct pulse closed since still counts" \
  's/^          OR \(NOT EXISTS \(SELECT 1 FROM public\.induction_session_poll ip$/          OR (lp.is_open AND NOT EXISTS (SELECT 1 FROM public.induction_session_poll ip/' \
  'T5 is met with a pulse they opened in every course-week (one week only through a poll that reached open, one only through direct pulses closed since)'
mutate "T75 the person never reads the plan table (notes) directly" \
  '/^CREATE POLICY hr_salary_revision_target_plans_select/,/;$/s/can_read\(request_id\)\);$/can_read(request_id) OR staff_id = ANY (public.fn_my_staff_ids()));/' \
  "the person's own view shows numbers, state and dates only: never the lapse note, run notes or the reason"
mutate "T76 teaches but no faculty targets set: nothing target-based" \
  "s/^          v_state := 'held_listed'; v_reason := 'no_targets_for_role';$/          v_state := 'waiting'; v_role := 'faculty';/" \
  'someone who teaches while the setting has no faculty targets gets no target-based part (listed)'
mutate "T77 a timetable runs by its dates, not is_active now (the measurement)" \
  's/^   WHERE COALESCE\(t\.is_template, false\) = false$/   WHERE t.is_active IS TRUE AND COALESCE(t.is_template, false) = false/' \
  'a missed month after release counts one, nothing changes yet (its timetable, switched off after it ended, still counted)'
mutate "T78 a timetable runs by its dates, not is_active now (teaches)" \
  's/^     WHERE COALESCE\(t\.is_template, false\) = false$/     WHERE t.is_active IS TRUE AND COALESCE(t.is_template, false) = false/' \
  "a teacher whose role key is not 'faculty' gets the faculty targets (they teach; their semester ended and was switched off; they marked in it)"
mutate "T79 a replaced timetable counts once" \
  's/^    JOIN chosen c ON c\.d = r\.d AND c\.period_name = r\.period_name AND c\.timetable_id = r\.timetable_id$/    WHERE r.period_name IS NOT NULL/' \
  'T1 leaves out off-days, approved college leaves and nameless periods (not pending leaves); an ended, switched-off timetable still counts, its replacement does not count twice'
mutate "T80 T5: opened in that week (direct pulse)" \
  "s/^              AND date_trunc\('week', \(lp\.issued_at AT TIME ZONE 'Asia\/Kolkata'\)::date\) = date_trunc\('week', lp\.attendance_date\)\)\)$/              AND true))/" \
  'T5 counts only pulses they opened in that week: not a poll drafted and closed, not one the automation opened, not one opened later for a past week'
mutate "T81 T5: opened in that week (poll)" \
  "s/^                     AND date_trunc\('week', \(ip\.issued_at AT TIME ZONE 'Asia\/Kolkata'\)::date\) = date_trunc\('week', lp\.attendance_date\)\)$/                     AND true)/" \
  'T5 counts only pulses they opened in that week: not a poll drafted and closed, not one the automation opened, not one opened later for a past week'
mutate "T82 3 unfinished nights: listed" \
  's/^   WHERE p\.state IN \(.waiting., .released., .paused.\) AND p\.failed_nights >= 3$/   WHERE false/' \
  "the Director's list shows the raise that kept timing out, with the reason"
mutate "T83 3 unfinished nights: last in line" \
  's/^   ORDER BY \(p\.failed_nights >= 3\), p\.last_run_on NULLS FIRST, p\.request_id$/   ORDER BY p.last_run_on NULLS FIRST, p.request_id/' \
  'a raise that did not finish on 3 nights in a row goes last and is listed for the Director'
mutate "T84 a finished run resets the count" \
  's/^  UPDATE public\.hr_salary_revision_target_plans SET last_run_on = p_today, failed_nights = 0$/  UPDATE public.hr_salary_revision_target_plans SET last_run_on = p_today/' \
  'a finished run clears the count of nights that did not finish'
mutate "T85 one attempt per night" \
  "s/^     SET failed_nights = failed_nights \+ CASE WHEN last_attempt_on IS DISTINCT FROM p_today THEN 1 ELSE 0 END,$/     SET failed_nights = failed_nights + 1,/" \
  'a raise that did not finish on 3 nights in a row goes last and is listed for the Director'
mutate "T86 an overlapping second call skips the raise" \
  's/^     AND last_run_on IS DISTINCT FROM p_today$/     AND true/' \
  'a second, overlapping call for a raise already run that day changes nothing'
mutate "T87 the teacher's own approved leave leaves the counts" \
  "s/^                      WHERE la\.employee_id = p_staff_id AND la\.status = 'approved'$/                      WHERE false AND la.employee_id = p_staff_id/" \
  "the teacher's own approved leave days leave the counts (not pending leave)"
mutate "T88 teaches: made before the range, or marked in it" \
  's/^       AND \(t\.created_at < p_from$/       AND (true/' \
  'someone who does not teach gets no target-based part: parked, no teaching timetable (a timetable made just now and never marked does not count)'
mutate "T89 teaches: first marks in the range count" \
  's/^            OR EXISTS \(SELECT 1 FROM public\.attendance_first_marks fm$/            OR false AND EXISTS (SELECT 1 FROM public.attendance_first_marks fm/' \
  "a teacher whose role key is not 'faculty' gets the faculty targets (they teach; their semester ended and was switched off; they marked in it)"
mutate_off "O1 a missing switch counts as OFF" \
  's/^                    LIMIT 1\), false\)$/                    LIMIT 1), true)/' \
  'with the switch row missing, measurement counts as OFF (fail closed)'
mutate_off "O2 a switch row switched off counts as OFF" \
  "s/^                      AND pp\.scope_type = 'global' AND pp\.scope_id IS NULL AND pp\.is_active = true$/                      AND pp.scope_type = 'global' AND pp.scope_id IS NULL/" \
  'a switch row that is itself switched off counts as OFF, even holding true'
mutate_off "O3 OFF at the yes: held, not classified" \
  's/^  ELSIF NOT public\.hr_salary_revision_target_measurement_on\(\) THEN$/  ELSIF false THEN/' \
  'above 5%: the increment is 5% of the pay now, the rest held, waiting for measurement, not classified'
mutate_off "O4 OFF at night: not measured, nothing else" \
  's/^  IF NOT public\.hr_salary_revision_target_measurement_on\(\) THEN$/  IF false THEN/' \
  'measurement OFF: each month is recorded as not measured, and nothing else happens'
mutate_off "O5 switching ON classifies then" \
  "s/^  IF v_p\.state = 'awaiting_measurement' THEN$/  IF false THEN/" \
  'switching ON classifies each waiting held part THEN (a teacher by their timetable now) and starts its window next month'
mutate_off "O6 the window starts when switched ON" \
  "s/^           window_start = \(date_trunc\('month', p_today\) \+ interval '1 month'\)::date,$/           window_start = window_start,/" \
  'switching ON classifies each waiting held part THEN (a teacher by their timetable now) and starts its window next month'
mutate_off "O7 only the Director list switches it" \
  "s/^  c_keys CONSTANT text\[\] := ARRAY\['hr\.salary_revision\.target_rules', 'hr\.salary_revision\.target_measurement_on'\];$/  c_keys CONSTANT text[] := ARRAY['hr.salary_revision.target_rules'];/" \
  'a super admin not on the Director list cannot switch measurement on'
mutate_off "O8 the switch holds only true or false" \
  "s/^  IF NEW\.policy_key = 'hr\.salary_revision\.target_measurement_on' AND jsonb_typeof\(NEW\.value\) IS DISTINCT FROM 'boolean' THEN$/  IF false THEN/" \
  'the switch holds only true or false, and a signed-in Director cannot delete it'
mutate_off "O9 a waiting-for-measurement part blocks a second raise" \
  "s/'awaiting_measurement', 'waiting', 'released', 'paused', 'held_listed', 'back_to_director'/'waiting', 'released', 'paused', 'held_listed', 'back_to_director'/g" \
  'a held part waiting for measurement still blocks a second raise'
mutate_off "O10 the Director's list shows parts waiting for measurement" \
  "s/^   WHERE p\.state IN \('back_to_director', 'held_listed', 'lapsed', 'awaiting_measurement'\)$/   WHERE p.state IN ('back_to_director', 'held_listed', 'lapsed')/" \
  "the Director's list shows each held part waiting for measurement"
mutate_off "O11 switched OFF again: nothing changes a paid part" \
  "s/^     WHERE request_id = p_request_id AND status = 'in_progress';$/     WHERE false;/" \
  'switched OFF again: the month in progress is closed as not measured and the pay is untouched'
# Round 7 (review of round 6).
mutate_off "O12 the record reads students with CASE, not AND" \
  's/^         AND CASE WHEN jsonb_typeof\(e\.value->'"'"'students'"'"'\) = '"'"'array'"'"'$/         AND jsonb_typeof(e.value->'"'"'students'"'"') = '"'"'array'"'"' AND (true/; s/^                  THEN jsonb_array_length\(e\.value->'"'"'students'"'"'\) END > 0$/                  AND jsonb_array_length(e.value->'"'"'students'"'"') > 0)/' \
  'the stamps: each good period once per day'
mutate_off "O13 the record never fails a save" \
  '/^CREATE OR REPLACE FUNCTION public\.fn_record_attendance_first_marks\(\)/,/^\$function\$;/s/^  EXCEPTION WHEN OTHERS THEN$/  EXCEPTION WHEN division_by_zero THEN/' \
  'if the record itself fails, the attendance save still goes ahead'
mutate_off "O14 a long period name is stamped under its key" \
  's/^      SELECT public\.attendance_first_mark_period_key\(btrim\(e\.value->>'"'"'period_name'"'"'\)\), count\(\*\)::int$/      SELECT btrim(e.value->>'"'"'period_name'"'"'), count(*)::int/' \
  'the stamps: each good period once per day, nothing for the odd ones, the long name under its key'
mutate_off "O15 the key cuts a long name" \
  's/^  SELECT CASE WHEN length\(p_name\) >= 200 THEN left\(p_name, 150\) \|\| '"'"' #'"'"' \|\| md5\(p_name\) ELSE p_name END$/  SELECT p_name/' \
  'a long period name keeps its own stamp'
# (No O16: on PG16 the monthly measure's "AND" form did not fail on these
# shapes in this plan; the CASE there is kept as the safe form all the same.)
mutate_off "O17 the plan is never shown to the person, even a self-asker" \
  '/^CREATE POLICY hr_salary_revision_target_plans_select/,/can_read/s/^  USING \(public\.hr_salary_revision_target_can_read\(request_id\)\);$/  USING (EXISTS (SELECT 1 FROM public.hr_salary_revision_requests r WHERE r.id = request_id));/' \
  'a self-asker sees their own request, but not its plan, months or flags'
mutate_off "O18 the flags are never shown to the person, even a self-asker" \
  '/^CREATE POLICY hr_salary_revision_target_flags_select/,/can_read/s/^  USING \(public\.hr_salary_revision_target_can_read\(request_id\)\);$/  USING (EXISTS (SELECT 1 FROM public.hr_salary_revision_requests r WHERE r.id = request_id));/' \
  'a self-asker sees their own request, but not its plan, months or flags'
mutate_off "O19 the person the request is about cannot read it" \
  's/^            AND NOT public\.hr_salary_revision_is_own\(r\.staff_id, r\.subject_profile_id\)$/            AND true/' \
  'a self-asker sees their own request, but not its plan, months or flags'
mutate_off "O20 a server-key change is logged as the server key" \
  "s/^  v_via := CASE WHEN v_role IS NOT DISTINCT FROM 'service_role' THEN 'server_key'$/  v_via := CASE WHEN false THEN 'server_key'/" \
  'every switch change is logged, by the SQL console and the server key too'
mutate_off "O21 a delete is logged" \
  "s/^  WHEN \(OLD\.policy_key IN \('hr\.salary_revision\.target_rules', 'hr\.salary_revision\.target_measurement_on'\)\)$/  WHEN (false)/" \
  'every switch change is logged, by the SQL console and the server key too'
mutate "T49 the list never shows the caller their own raise" \
  's/^   WHERE NOT EXISTS \(SELECT 1 FROM public\.hr_salary_revision_requests rr$/   WHERE true OR NOT EXISTS (SELECT 1 FROM public.hr_salary_revision_requests rr/' \
  "a Director-list member never sees their own raise on the Director's list"
mutate_off "O27 a rename away is logged (the UPDATE trigger hears the old key)" \
  "s/^  WHEN \(NEW\.policy_key IN \('hr\.salary_revision\.target_rules', 'hr\.salary_revision\.target_measurement_on'\) OR OLD\.policy_key IN \('hr\.salary_revision\.target_rules', 'hr\.salary_revision\.target_measurement_on'\)\)$/  WHEN (NEW.policy_key IN ('hr.salary_revision.target_rules', 'hr.salary_revision.target_measurement_on'))/" \
  'renaming the switch away by the server key is logged under its own name'
mutate_off "O28 a rename away is logged under the old key" \
  "s/^               OR \(TG_OP = 'UPDATE' AND NEW\.policy_key NOT IN .*\)$/               OR false/" \
  'renaming the switch away by the server key is logged under its own name'
mutate_off "O29 the marker is read inside the protected block" \
  "s/^  v_marker uuid;$/  v_marker uuid := CASE WHEN auth.role() IS NOT DISTINCT FROM 'service_role' THEN NULL ELSE auth.uid() END;/" \
  'a malformed sign-in claim never fails an attendance save'
mutate_off "O22 held under a rupee is nothing held" \
  's/^  IF v_held > 0 AND v_held < 1 THEN$/  IF false THEN/' \
  'a held part under a rupee (paise in the ask) is paid with the increment'
mutate_off "O23 the base is the pay in force at the yes" \
  's/^  v_base := COALESCE\(v_now_pay, v_r\.current_monthly_gross\);$/  v_base := v_r.current_monthly_gross;/' \
  'the split is on the pay IN FORCE at the yes'
mutate_off "O24 the increment is rounded, not floored" \
  's/^                 THEN LEAST\(round\(v_base/                 THEN LEAST(floor(v_base/' \
  'the increment is rounded to the rupee'
mutate_off "O25 a cut is written whole" \
  's/^                 ELSE v_final - v_base END;$/                 ELSE 0 END;/' \
  'a pay cut has no increment and nothing held'
mutate_off "O26 the message says it is a cut" \
  "s/^      \|\| CASE WHEN v_final < v_base THEN ' This is a pay cut\.' ELSE '' END$/      || ''/" \
  'a pay cut has no increment and nothing held'
echo "== mutation controls: $CAUGHT caught, $MISSED not caught"
