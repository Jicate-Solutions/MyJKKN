-- ============================================================================
-- Migration: 20271007180207_hr_salary_revision_target_gated_raises
-- The Director's rulings of 7 Oct 2026: a raise is paid in two parts, and the
-- second part waits for targets that MyJKKN itself measures.
-- ============================================================================
-- !!! STACKED ON DRAFT #4190 (20271007150103_hr_salary_revision_no_self_decision),
--   itself on #4140 (20270524090000). Section 0 stops, changing nothing, if
--   #4190's objects are missing or it is not in the migration ledger. The three
--   function bodies re-created here (approve_one, apply_due_on and the pay
--   guard on hr_staff_salaries) are #4190's, with the additions marked
--   "7 Oct 2026" and nothing else changed.
--
-- THE RULINGS (7 Oct 2026)
--   1. A raise splits in two at the Director's yes. The ANNUAL INCREMENT is the
--      configured percent (5) of the monthly pay at the yes, or the whole raise
--      if that is smaller; it is written on the start date exactly as before.
--      The REMAINDER is HELD until targets are met. A pay cut, or a raise no
--      bigger than the increment, has nothing held.
--   2. Targets are fixed per role. Faculty: all five, measured by MyJKKN for
--      that person, per calendar month:
--        T1  at least 85% of their own scheduled periods marked BY THEM within
--            24 h of the period's end (timetable slots with primary_staff_id =
--            them, minus institution off-days and approved college-wide
--            leaves; matched to student_attendance on timetable + date +
--            period NAME, because the period ids no longer match; the marker
--            is marked_by_details.marker_id; an empty marker is not them).
--        T2  every course they are timetabled for has no draft lesson left in
--            curriculum_lesson and at least one published lesson approved by
--            them.
--        T3  at least 60% of the periods they marked, on courses whose lesson
--            spine is approved (T2's courses), linked to a lesson by them
--            (class_session_lesson.linked_by). Not met while T2 is not met.
--        T4  material posted by them (session_resource.posted_by) for at least
--            25% of their scheduled periods (default s).
--        T5  a live class pulse opened by them (scf_live_pulse.created_by) at
--            least once in every week a course of theirs is scheduled. Pulses
--            opened automatically have no created_by and do not count
--            (default t).
--      fn_faculty_metrics is NOT used (it divides by a fixed 22 days).
--   3. Checked MONTHLY. The held part starts on the 1st of the month after the
--      first month with all targets met, within 6 months of his yes. Not met
--      by month 6: back to him with the numbers (listed, not decided).
--   4. After it is paid: below target 3 months in a row and the held part
--      PAUSES (the pay goes back to the pay without it) until a month on
--      target. Nothing is cut beyond that and paid months are never taken back.
--   5. The principal can flag a month with a note. That month goes to the
--      Director with the numbers and counts as neither met nor missed until
--      he decides it.
--   6. All colleges. A principal's own raise gets NO target-based part yet (the
--      remainder stays held and listed). Nor does a role with no targets set in
--      MyJKKN. A Director-list member's held part is NEVER released by itself.
--   7. He approves now with targets attached; the count starts at his yes.
--
-- !!! ROUND 6 (7 Oct 2026): MEASUREMENT IS SWITCHED OFF. A new Director-list-
--   only setting, 'hr.salary_revision.target_measurement_on', seeded false and
--   failing closed to OFF (default ll). While it is OFF every raise is still
--   split at the yes, the increment is written on its start date and the rest
--   is HELD, and nothing else ever happens to the held part: the nightly run
--   only records each month as not measured (no release, pause, resume,
--   expiry, lapse, back-to-Director or classification). The person sees their
--   held amount and "targets being set up"; the Director's list shows each held
--   part as waiting for measurement to be switched on.
--
-- ROUND 7 (7 Oct 2026, review of round 6):
--   1. The first-mark record can never fail an attendance save: any error is a
--      WARNING and the save goes ahead; "students" of any shape is read safely
--      (CASE, not AND), and a period name of 200+ characters is stamped as its
--      first 150 characters plus its md5 (attendance_first_mark_period_key).
--   2. A self-asker (an HOD asking their own raise) no longer reads their own
--      plan, months or flags: the three tables' RLS excludes whoever the
--      request is about (hr_salary_revision_target_can_read). They see their
--      numbers, state and dates only, through fn_hr_salary_revision_my_targets().
--   3. Every change to either setting is logged, including by the server key
--      and the SQL console (hr_salary_revision_target_setting_log).
--   4. A held part under a rupee (paise in the ask) is paid with the increment:
--      nothing is held and nothing blocks a later raise.
--
-- DEFAULTS TAKEN (7 Oct 2026) — overrule here
--   a. A team member sees their own target numbers, read-only, on My Pay
--      Changes (the request page never shows anyone their own raise, #4140).
--   b. A person who leaves, or moves to another college, while the held part
--      is still waiting: it lapses and is listed for the Director.
--   c. Month 1 is the first full calendar month after the month of his yes.
--      The month of the yes itself is partial and is not counted.
--   d. A month with no scheduled periods for the person counts as neither met
--      nor missed: it neither releases, nor adds to the 3-in-a-row, nor breaks
--      a run of missed months.
--   e. No backdating (#4122, 29-30 Sep rulings): a held part, pause or resume
--      starts on the 1st when the monthly run sees the month on the 1st itself
--      (the run is daily, 23:07 India time, after the day's approvals job),
--      else on the next 1st. A month payroll is already working on is skipped,
--      the same rule as the approvals job.
--   f. The increment is rounded to whole rupees.
--   g. A yes given before this file is written as approved (whole figure):
--      only yeses from now on are split.
--   h. Who holds which target set: the person's role keys (profiles.role and
--      user_roles), matched against the setting. Exactly one matching role
--      with targets: that set. None, or more than one: no target-based part,
--      listed. A role named under roles_waiting_for_own_targets (principal)
--      wins over everything else.
--   i. Nobody is sent a new notice when the held part starts, pauses or
--      resumes (the 1 Oct rule: no new notices); My Pay Changes shows it.
--   j. The principal may flag a month until it has been counted (the current
--      month, or a finished month the daily run has not reached yet). After
--      that, the Director decides from the listed numbers.
--   k. The Director decides a flagged month as met or missed, with an
--      optional note, from the request page; his decision is acted on at the
--      next daily run.
--   l. The yes is refused (nothing changes) while the rules setting is
--      missing, switched off or malformed: there is nothing to split by.
--   m. "The ask" in ruling 1 is read as the figure the Director approves: when
--      he approves a different figure, the split is of his figure.
--   n. A flagged month the Director decides later counts when he decides it
--      (in the order decided, not the calendar order), from the next 1st.
--   o. T1's window is 24 h and the run is 23:07 India time on the 1st; a
--      longer window set later would count a month before its last periods'
--      windows close (the run would then need moving).
--   p. ONE held raise at a time (review of 7 Oct, round 2): while a person's
--      held part is waiting, being paid and measured, or paused, a NEW raise
--      for them is refused when asked for (and at the yes) with "Finish or
--      lapse the earlier held raise first." The Director can lapse an earlier
--      held part (fn_hr_salary_revision_target_lapse): it is marked lapsed and
--      listed, and nobody's pay changes. On the start date, if the pay in
--      force is no longer the pay the raise was split from, nothing is
--      written: it is noted and listed (and goes back to him for a fresh yes).
--   q. T1 is measured only from what the SERVER recorded (review round 3): a
--      new append-only table, attendance_first_marks, holds who FIRST marked
--      each period (timetable, day, period name, n-th period of that name)
--      and the server's time, written once by a separately named AFTER
--      trigger on student_attendance (ON CONFLICT DO NOTHING). Clearing and
--      re-marking, re-keying, deleting and re-inserting the day's row, or
--      removing a period and marking it again never rewrite it. The
--      attendance row itself, marked_by_details included, is left exactly as
--      the app writes it. A write by the server key or the console records
--      the stamp with no marker (never counts). No offline or batch path
--      writes attendance (checked: attendance services and API routes).
--      Periods marked before this file get their stamp at their first later
--      write, with that write's time (they can lose, never gain). Existing
--      rows are not rewritten.
--   r. T2: a course counts when they approved at least one published lesson
--      they did not write themselves (an AI draft, or a colleague's), and no
--      draft they created is left on it. There is no assignment column, so
--      other teachers' drafts on a shared course do not count against them.
--   s. T4 is "class material on at least 25% of your periods": material can
--      only be posted once the period's attendance entry exists, so it counts
--      material they posted for their OWN scheduled period by the end of that
--      day, still switched on. (A true before-class path is for the Director.)
--   t. T5 counts only pulses they actually opened, per course per Monday-to-
--      Sunday week that overlaps the month, at least t5_min_pulses_per_week
--      (1) per week. Opened = the class poll they made for the pulse reached
--      open (induction_session_poll.issued_at, set only when a poll opens), or
--      a pulse they opened directly (it has no poll), whether still open or
--      closed since. A placeholder whose poll was drafted and closed does not
--      count.
--   u. T1 matches each timetable slot to one attendance entry: the same
--      period name twice on a day is paired in order; a slot whose period has
--      no name cannot be matched and is left out of the count.
--   v. A record linked to no account (#4190 rule 8), or someone now on the
--      Director list after the held part was paid, is skipped by the monthly
--      run and LISTED for the Director (run note on the list); the pay guard's
--      second marker refuses both. The run never changes the pay of someone on
--      the Director list, not even to pause it.
--   w. Someone who moves college AFTER the held part is paid keeps being
--      measured, on whatever timetable they teach now.
--   y. WHO GETS THE FACULTY TARGETS (review round 4): whoever TEACHES, i.e.
--      had periods as the main teacher (primary_staff_id) on a selected day
--      of an active timetable in the 90 days before the yes, gets the faculty
--      set, whatever their role key is called. Kept before that: a principal
--      role parks it (rule 6), a Director-list member is never auto-released,
--      and a role key named in role_targets is an extra opt-in (one match:
--      that set; more than one: listed). Someone who does not teach gets no
--      target-based part: parked, reason "no teaching timetable", listed.
--      Snapshotted at the yes.
--   z. T1 never counts a first marking made BEFORE the session began (the
--      period's start time that day, India time; midnight when the timetable
--      gives no start time). A row saved ahead for a future day does not count.
--   p2. "One held raise at a time" also counts a PARKED held part (Director
--      list, principal, no targets, not teaching, several roles) and one whose
--      window ran out (back with the Director), while its yes stands; the
--      Director's lapse clears it.
--   aa. Once the held part is paid, only the months the pause rule can still
--      use are measured (the last pause_after_missed_months finished months
--      and the current one); an older month the run missed is closed as not
--      counted, unmeasured. So the nightly work per raise stays bounded.
--   bb. The nightly run is one call per raise (the cron route asks for the
--      raises due, then runs each in its own transaction within a time
--      budget): a time-out or error on one person never undoes the others;
--      whoever was not reached goes first the next night. One call measures
--      at most 12 months and carries the rest to the next run.
--   cc. The person sees their own numbers, state and dates only, through
--      fn_hr_salary_revision_my_targets(); never why it is parked, the
--      Director's lapse note, the run's notes or a principal's flag.
--   dd. Review round 5: a timetable "runs" on the days between its start and
--      end dates (not a template), whatever is_active says NOW (the daily job
--      switches a timetable off the day after it ends, which emptied the last
--      month of a semester and parked teachers between semesters). When two
--      timetables give one person the same period name on the same day (one
--      replaced the other), only one counts: the one marked, else the newer.
--      A wrongly made timetable that was switched off early still counts for
--      its dates (accepted; HR deletes or end-dates a wrong timetable).
--   ee. T5 counts a pulse only if it was opened (its own or its poll's issue
--      time, India time) in the Monday-to-Sunday week of its class: opening
--      pulses later for past weeks does not count.
--   ff. The cron route records one attempt per raise per night before each
--      run, in its own short call; a finished run resets it. A raise that did
--      not finish on 3 nights in a row goes last in the queue and is listed
--      for the Director with the reason.
--   gg. The route starts a raise only while at least 15 s of its 60 s remain
--      (so 45 s of starts at most).
--   hh. A second call for the same raise on the same day is skipped (row lock
--      and the day already run).
--   ii. The teacher's own approved leave days (hr_leave_applications, any
--      length, half days included) are left out of T1, T3 and T4.
--   jj. Substitutions: MyJKKN has no table recording a substitution or
--      arrangement (checked), so periods a colleague covers stay in the main
--      teacher's count (they show as marked by someone else). Noted, not
--      changed.
--   kk. "Teaches" (default y) needs the timetable to have been made before
--      the 90-day range began, or periods in it first marked by them inside
--      it: a timetable made just before the yes cannot make a non-teacher
--      eligible.
--   ll. Measurement OFF until the Director switches it on (see the top).
--   mm. When measurement is switched ON, each held part waiting for it is
--      classified THEN (teaches / principal / role without targets / Director
--      list, with the rules as they are then, snapshotted) and its 6-month
--      window starts on the 1st of the next month. The date of the yes stays
--      on the request. A raise approved while measurement is already ON is
--      classified at the yes, as before.
--
-- MEASUREMENT FOLLOW-UP (the switch stays OFF until these are fixed; review
-- round 5, not changed in this file):
--   1. A replaced timetable can still double-count where names differ.
--   2. Cycle-based, batch-wise and dateless timetables are not read the way
--      the attendance screens read them (they are invisible or misread).
--   3. Department-, semester- and section-scoped holidays are ignored (only
--      college-wide ones are left out).
--   4. "Teaches" leans on the timetable's creation date while the first-mark
--      record starts empty.
--   5. T5's last week of a month is judged before that week ends.
--   6. Leave approved after a month is counted is never taken into account.
--   The fix is to read periods through the app's own schedule resolver.
--
--   x. A request that leaves 'approved' without its pay written (start date
--      missed, then refused or approved afresh; or the person left) lapses its
--      held part and lists it, so it never blocks a later raise.
--   NOTED, not changed (review round 3): a person who becomes a principal
--   while waiting keeps the faculty targets snapshotted at the yes; the right
--   to flag follows the request's college; lapsing a paid held part also stops
--   any later pausing of it; a period shared by two batches credits the
--   teacher of whichever batch was marked first.
--
-- WHAT
--   a. Setting 'hr.salary_revision.target_rules' (global, one JSON object):
--      every number above. hr.allowances_and_increments was checked first: it
--      holds an annual window, approvers and factor names but NO percent, it
--      is per college, and its screen is not limited to the Director list. So
--      a new global key. Reader hr_salary_revision_target_rules() (NULL when
--      missing / off / malformed: fail closed); BEFORE guard (Director list,
--      service_role or the SQL console only; shape checked; a signed-in person
--      may not delete or rename it) and AFTER audit trigger, copied from
--      #4190's guard on the decider row. Seeded once (ON CONFLICT DO NOTHING).
--   b. Three tables keyed by request id, RLS on each, SELECT only, written only
--      by the functions below: hr_salary_revision_target_plans (the split, the
--      snapshot of the role's targets and thresholds, the state),
--      hr_salary_revision_target_months (each month's numbers and result) and
--      hr_salary_revision_target_flags (the principal's flag and the
--      Director's decision; never shown to the person themselves).
--      No new request statuses.
--   c. hr_salary_revision_target_measure(staff, month, targets): pure SQL, one
--      row per target with numerator, denominator and met.
--   d. Re-created from #4190: hr_salary_revision_approve_one (the split and the
--      snapshot), hr_salary_revision_apply_due_on (writes pay + increment) and
--      fn_guard_hr_staff_salaries_no_own_or_list_pay (the apply marker now
--      expects pay + increment; a second marker, below).
--   e. The monthly run: hr_salary_revision_targets_run_on(day) (internal) and
--      fn_hr_salary_revision_targets_run() for the cron route (service_role
--      only). Pay is written through fn_hr_set_staff_salary under the
--      transaction-local marker 'app.hr_salary_revision_target_pay'; the pay
--      guard admits that marker ONLY for that request's person, at exactly
--      the pay in force plus (release, resume) or minus (pause) the held part,
--      on the planned date, for an applied yes stamped under #4190's rules
--      whose state calls for that step. Anything else under the marker is
--      refused, for every caller.
--   f. fn_hr_salary_revision_target_flag (the principal of that college, never
--      on their own raise), fn_hr_salary_revision_target_decide (the Director,
--      #4190's who-may-decide rules) and fn_hr_salary_revision_targets_listed
--      (Director list, read-only).
--   g. Review round 2 (7 Oct): fn_hr_salary_revision_propose re-created from
--      #4190 (one held raise at a time) and fn_hr_salary_revision_target_lapse
--      (default p); table attendance_first_marks + fn_record_attendance_first_marks()
--      + AFTER trigger trg_zz_student_attendance_first_marks on student_attendance
--      (default q).
--
-- Idempotent: CREATE ... IF NOT EXISTS, CREATE OR REPLACE, DROP ... IF EXISTS,
-- guarded seed. No inner BEGIN/COMMIT. Applying it changes nobody's pay.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. #4190 first. Stop here, changing nothing, if it is missing.
-- ----------------------------------------------------------------------------
DO $check$
DECLARE
  v_recorded boolean;
BEGIN
  IF to_regprocedure('public.hr_salary_revision_assert_may_decide(uuid, uuid, boolean)') IS NULL
     OR to_regprocedure('public.hr_salary_revision_is_list_member(uuid, uuid, boolean)') IS NULL
     OR to_regprocedure('public.fn_guard_hr_staff_salaries_no_own_or_list_pay()') IS NULL THEN
    RAISE EXCEPTION 'ABORT: #4190''s functions are missing. Apply 20271007150103_hr_salary_revision_no_self_decision first.';
  END IF;
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations'
                  AND column_name = 'name') THEN
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = $1 OR name LIKE $2)'
        INTO v_recorded USING '20271007150103', '%hr_salary_revision_no_self_decision%';
    ELSE
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = $1)'
        INTO v_recorded USING '20271007150103';
    END IF;
    IF NOT v_recorded THEN
      RAISE EXCEPTION 'ABORT: 20271007150103 (#4190) is not recorded in supabase_migrations.schema_migrations. Apply #4190 through the wave first.';
    END IF;
  END IF;
END
$check$;

-- ----------------------------------------------------------------------------
-- a. The setting: every number in the rulings, in one global row
-- ----------------------------------------------------------------------------
-- Shape check, shared by the guard and the reader. True only for the exact
-- shape: a malformed value is refused when written and read as missing.
CREATE OR REPLACE FUNCTION public.hr_salary_revision_target_rules_ok(p jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_set  jsonb;
  v_key  text;
BEGIN
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p)) <> 5
     OR NOT (p ?& ARRAY['annual_increment_percent', 'window_months', 'pause_after_missed_months',
                        'roles_waiting_for_own_targets', 'role_targets']) THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(p->'annual_increment_percent') <> 'number'
     OR (p->>'annual_increment_percent')::numeric <= 0 OR (p->>'annual_increment_percent')::numeric > 100 THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(p->'window_months') <> 'number' OR (p->>'window_months') !~ '^[0-9]+$'
     OR (p->>'window_months')::int NOT BETWEEN 1 AND 24 THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(p->'pause_after_missed_months') <> 'number' OR (p->>'pause_after_missed_months') !~ '^[0-9]+$'
     OR (p->>'pause_after_missed_months')::int NOT BETWEEN 1 AND 12 THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(p->'roles_waiting_for_own_targets') <> 'array'
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p->'roles_waiting_for_own_targets') e
                 WHERE jsonb_typeof(e) <> 'string' OR btrim(e #>> '{}') = '') THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(p->'role_targets') <> 'object' THEN RETURN false; END IF;
  FOR v_role, v_set IN SELECT key, value FROM jsonb_each(p->'role_targets') LOOP
    IF btrim(v_role) = '' OR jsonb_typeof(v_set) <> 'object'
       OR (SELECT count(*) FROM jsonb_object_keys(v_set)) <> 5
       OR NOT (v_set ?& ARRAY['t1_marked_by_self_min_pct', 't1_mark_within_hours', 't3_linked_min_pct',
                              't4_resource_min_pct', 't5_min_pulses_per_week']) THEN
      RETURN false;
    END IF;
    FOREACH v_key IN ARRAY ARRAY['t1_marked_by_self_min_pct', 't3_linked_min_pct', 't4_resource_min_pct'] LOOP
      IF jsonb_typeof(v_set->v_key) <> 'number'
         OR (v_set->>v_key)::numeric < 0 OR (v_set->>v_key)::numeric > 100 THEN
        RETURN false;
      END IF;
    END LOOP;
    IF jsonb_typeof(v_set->'t1_mark_within_hours') <> 'number' OR (v_set->>'t1_mark_within_hours') !~ '^[0-9]+$'
       OR (v_set->>'t1_mark_within_hours')::int NOT BETWEEN 1 AND 168 THEN
      RETURN false;
    END IF;
    IF jsonb_typeof(v_set->'t5_min_pulses_per_week') <> 'number' OR (v_set->>'t5_min_pulses_per_week') !~ '^[0-9]+$'
       OR (v_set->>'t5_min_pulses_per_week')::int NOT BETWEEN 1 AND 7 THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;  -- a value that cannot even be read is malformed
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_target_rules_ok(jsonb) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_salary_revision_target_rules_ok(jsonb) IS
  'Internal. True only for the exact shape of hr.salary_revision.target_rules. Migration 20271007180207.';

-- The setting as it stands, or NULL when missing, switched off or malformed.
CREATE OR REPLACE FUNCTION public.hr_salary_revision_target_rules()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT pp.value
    FROM public.platform_policies pp
   WHERE pp.policy_key = 'hr.salary_revision.target_rules'
     AND pp.scope_type = 'global' AND pp.scope_id IS NULL
     AND pp.is_active = true
     AND public.hr_salary_revision_target_rules_ok(pp.value)
   LIMIT 1
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_target_rules() FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_salary_revision_target_rules() IS
  'Internal. The value of platform_policies ''hr.salary_revision.target_rules'' (global), or NULL when it is '
  'missing, switched off or malformed: then no raise can be approved (fail closed). Rulings of 7 Oct 2026. '
  'Migration 20271007180207.';

CREATE OR REPLACE FUNCTION public.fn_guard_hr_salary_revision_target_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  -- Round 6: the same guard covers the measurement switch.
  c_keys CONSTANT text[] := ARRAY['hr.salary_revision.target_rules', 'hr.salary_revision.target_measurement_on'];
  v_role text := auth.role();
BEGIN
  IF NOT (   (TG_OP IN ('INSERT', 'UPDATE') AND NEW.policy_key = ANY (c_keys))
          OR (TG_OP IN ('UPDATE', 'DELETE') AND OLD.policy_key = ANY (c_keys))) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- WHO: the Director list (#4121), service_role, or a database session with
  -- no signed-in user (migration, SQL console). The same rule as #4190's guard
  -- on the decider row, without its "only the person named" step.
  IF v_role IS NOT NULL AND v_role IS DISTINCT FROM 'service_role' THEN
    IF v_role IS DISTINCT FROM 'authenticated' OR public.fn_is_the_director() IS NOT TRUE THEN
      RAISE EXCEPTION 'Only the Director can change the raise rules (increment, held part and targets).'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' AND v_role IS NOT NULL AND v_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Switch this setting off instead of deleting it, so the change stays on record.'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.policy_key = ANY (c_keys) AND NEW.policy_key IS DISTINCT FROM OLD.policy_key
     AND v_role IS NOT NULL AND v_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'This setting cannot be renamed. Switch it off instead, so the change stays on record.'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' OR NOT (NEW.policy_key = ANY (c_keys)) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- SHAPE.
  IF NEW.scope_type IS DISTINCT FROM 'global' OR NEW.scope_id IS NOT NULL THEN
    RAISE EXCEPTION 'The raise rules are one setting for the whole group. They cannot be set for one college, role or person.'
      USING ERRCODE = '22023';
  END IF;
  IF NEW.policy_key = 'hr.salary_revision.target_measurement_on' AND jsonb_typeof(NEW.value) IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'hr.salary_revision.target_measurement_on must be true or false.'
      USING ERRCODE = '22023';
  END IF;
  IF NEW.policy_key = 'hr.salary_revision.target_rules' AND NOT public.hr_salary_revision_target_rules_ok(NEW.value) THEN
    RAISE EXCEPTION 'hr.salary_revision.target_rules must hold exactly: annual_increment_percent (above 0, at most 100), window_months (1-24), pause_after_missed_months (1-12), roles_waiting_for_own_targets (a list of role keys) and role_targets (per role key: t1_marked_by_self_min_pct, t1_mark_within_hours, t3_linked_min_pct, t4_resource_min_pct, t5_min_pulses_per_week).'
      USING ERRCODE = '22023';
  END IF;

  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_guard_hr_salary_revision_target_rules() FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.fn_guard_hr_salary_revision_target_rules() IS
  'BEFORE trigger on platform_policies for ''hr.salary_revision.target_rules''. Who: the Director list, '
  'service_role or a direct DB session (42501 otherwise). Shape: one global row of the exact shape (22023). '
  'A signed-in person may not delete or rename it (switch it off: fails closed). Migration 20271007180207.';

DROP TRIGGER IF EXISTS trg_guard_hr_salary_revision_target_rules ON public.platform_policies;
CREATE TRIGGER trg_guard_hr_salary_revision_target_rules
  BEFORE INSERT OR UPDATE OR DELETE ON public.platform_policies
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_hr_salary_revision_target_rules();

-- Round 7: every change to either setting, by anyone, including the server
-- key and the SQL console (hr_policy_audit_log needs a signed-in editor, so it
-- only ever had the signed-in ones). Append-only: written only by the trigger
-- below; the Director list and the server key may read it.
CREATE TABLE IF NOT EXISTS public.hr_salary_revision_target_setting_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_key    text NOT NULL,
  action        text NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  old_value     jsonb,
  new_value     jsonb,
  old_is_active boolean,
  new_is_active boolean,
  changed_by    uuid,
  changed_via   text NOT NULL CHECK (changed_via IN ('signed_in', 'server_key', 'console')),
  changed_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hr_salary_revision_target_setting_log IS
  'Round 7 (7 Oct 2026): every change to hr.salary_revision.target_rules and hr.salary_revision.target_measurement_on, '
  'signed in or not (changed_via: signed_in, server_key, console; changed_by NULL unless signed in). Append-only, '
  'written by the trg_audit_hr_salary_revision_target_rules triggers (insert, update incl. a rename away, delete). '
  'Migration 20271007180207.';

ALTER TABLE public.hr_salary_revision_target_setting_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hr_salary_revision_target_setting_log_select ON public.hr_salary_revision_target_setting_log;
CREATE POLICY hr_salary_revision_target_setting_log_select ON public.hr_salary_revision_target_setting_log
  FOR SELECT TO authenticated
  USING ((SELECT public.fn_is_the_director()) IS TRUE);
DROP POLICY IF EXISTS hr_salary_revision_target_setting_log_service_role ON public.hr_salary_revision_target_setting_log;
CREATE POLICY hr_salary_revision_target_setting_log_service_role ON public.hr_salary_revision_target_setting_log
  FOR SELECT TO service_role USING (true);
REVOKE ALL ON public.hr_salary_revision_target_setting_log FROM anon, PUBLIC, authenticated, service_role;
GRANT SELECT ON public.hr_salary_revision_target_setting_log TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_audit_hr_salary_revision_target_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_role text := auth.role();
  v_via  text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.value IS NOT DISTINCT FROM OLD.value
     AND NEW.is_active IS NOT DISTINCT FROM OLD.is_active
     AND NEW.policy_key IS NOT DISTINCT FROM OLD.policy_key THEN
    RETURN NULL;
  END IF;
  -- Round 7: every change, by anyone (the server key and the SQL console too).
  v_via := CASE WHEN v_role IS NOT DISTINCT FROM 'service_role' THEN 'server_key'
                WHEN v_uid IS NOT NULL THEN 'signed_in'
                ELSE 'console' END;
  INSERT INTO public.hr_salary_revision_target_setting_log
    (policy_key, action, old_value, new_value, old_is_active, new_is_active, changed_by, changed_via)
  VALUES
    (CASE WHEN TG_OP = 'DELETE'
               OR (TG_OP = 'UPDATE' AND NEW.policy_key NOT IN ('hr.salary_revision.target_rules', 'hr.salary_revision.target_measurement_on'))
          THEN OLD.policy_key ELSE NEW.policy_key END, lower(TG_OP),
     CASE WHEN TG_OP <> 'INSERT' THEN OLD.value END, CASE WHEN TG_OP <> 'DELETE' THEN NEW.value END,
     CASE WHEN TG_OP <> 'INSERT' THEN OLD.is_active END, CASE WHEN TG_OP <> 'DELETE' THEN NEW.is_active END,
     CASE WHEN v_via = 'signed_in' THEN v_uid END, v_via);
  -- edited_by is NOT NULL there: only a signed-in change also goes to hr_policy_audit_log.
  IF TG_OP = 'DELETE' OR v_via <> 'signed_in' OR to_regclass('public.hr_policy_audit_log') IS NULL THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.hr_policy_audit_log
    (policy_id, policy_key, scope_type, scope_id, action, old_value, new_value, reason, edited_by)
  VALUES
    (NEW.id, NEW.policy_key, NEW.scope_type, NEW.scope_id, 'publish',
     CASE WHEN TG_OP = 'UPDATE' THEN OLD.value END, NEW.value,
     CASE WHEN NEW.policy_key = 'hr.salary_revision.target_measurement_on'
          THEN 'Switched target measurement ' || CASE WHEN NEW.value = 'true'::jsonb THEN 'ON' ELSE 'OFF' END
          ELSE 'Changed the raise rules (increment, held part and targets)' END
       || CASE WHEN NEW.is_active IS TRUE THEN '.' ELSE ' (switched off: no raise can be approved).' END,
     v_uid);
  RETURN NULL;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_audit_hr_salary_revision_target_rules() FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.fn_audit_hr_salary_revision_target_rules() IS
  'AFTER triggers (insert; update, also when the key is renamed away, round 8; delete) on platform_policies for '
  '''hr.salary_revision.target_rules'' and the measurement switch: every '
  'change (insert, update, delete), by anyone, writes one hr_salary_revision_target_setting_log row (round 7); a '
  'change by a signed-in person also writes one hr_policy_audit_log row. Migration 20271007180207.';

DROP TRIGGER IF EXISTS trg_audit_hr_salary_revision_target_rules ON public.platform_policies;
CREATE TRIGGER trg_audit_hr_salary_revision_target_rules
  AFTER INSERT ON public.platform_policies
  FOR EACH ROW
  WHEN (NEW.policy_key IN ('hr.salary_revision.target_rules', 'hr.salary_revision.target_measurement_on'))
  EXECUTE FUNCTION public.fn_audit_hr_salary_revision_target_rules();

-- Round 8: an UPDATE is logged when either the old or the new key is one of
-- the two settings, so renaming a setting away (it then reads as missing,
-- i.e. OFF) is on record too.
DROP TRIGGER IF EXISTS trg_audit_hr_salary_revision_target_rules_update ON public.platform_policies;
CREATE TRIGGER trg_audit_hr_salary_revision_target_rules_update
  AFTER UPDATE ON public.platform_policies
  FOR EACH ROW
  WHEN (NEW.policy_key IN ('hr.salary_revision.target_rules', 'hr.salary_revision.target_measurement_on') OR OLD.policy_key IN ('hr.salary_revision.target_rules', 'hr.salary_revision.target_measurement_on'))
  EXECUTE FUNCTION public.fn_audit_hr_salary_revision_target_rules();

DROP TRIGGER IF EXISTS trg_audit_hr_salary_revision_target_rules_delete ON public.platform_policies;
CREATE TRIGGER trg_audit_hr_salary_revision_target_rules_delete
  AFTER DELETE ON public.platform_policies
  FOR EACH ROW
  WHEN (OLD.policy_key IN ('hr.salary_revision.target_rules', 'hr.salary_revision.target_measurement_on'))
  EXECUTE FUNCTION public.fn_audit_hr_salary_revision_target_rules();

-- Seed: the rulings' numbers. An existing row (edited by the Director) is left alone.
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active)
VALUES
  ('hr.salary_revision.target_rules', 'global', NULL,
   '{
      "annual_increment_percent": 5,
      "window_months": 6,
      "pause_after_missed_months": 3,
      "roles_waiting_for_own_targets": ["principal"],
      "role_targets": {
        "faculty": {
          "t1_marked_by_self_min_pct": 85,
          "t1_mark_within_hours": 24,
          "t3_linked_min_pct": 60,
          "t4_resource_min_pct": 25,
          "t5_min_pulses_per_week": 1
        }
      }
    }'::jsonb,
   'The Director''s raise rules (7 Oct 2026). At his yes a raise splits: the annual increment '
   '(annual_increment_percent of the pay then, or the whole raise if smaller) starts on the start date; the rest '
   'is held until a month with every target of the person''s role met, within window_months; after it is paid, '
   'pause_after_missed_months missed months in a row pause it until a month on target. Roles under '
   'roles_waiting_for_own_targets, and roles with no role_targets, get no target-based part (held, listed). '
   'Only the Director list can change it; each raise keeps the copy it was approved under.',
   'object', true, true)
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO NOTHING;

-- Round 6 (default ll): the measurement switch, seeded OFF. Same guard.
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active)
VALUES
  ('hr.salary_revision.target_measurement_on', 'global', NULL, 'false'::jsonb,
   'Whether MyJKKN measures the raise targets each month (7 Oct 2026). OFF: every raise is still split at the '
   'Director''s yes and the increment is paid on its start date; the held part stays held and nothing about it '
   'changes (no release, pause, resume or expiry). Switching it ON starts each held part''s window then. Only the '
   'Director list can change it; a missing or malformed row counts as OFF.',
   'boolean', true, true)
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO NOTHING;

-- ON only when the row exists, is switched on and holds true (fail closed to OFF).
CREATE OR REPLACE FUNCTION public.hr_salary_revision_target_measurement_on()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT pp.value = 'true'::jsonb
                     FROM public.platform_policies pp
                    WHERE pp.policy_key = 'hr.salary_revision.target_measurement_on'
                      AND pp.scope_type = 'global' AND pp.scope_id IS NULL AND pp.is_active = true
                    LIMIT 1), false)
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_target_measurement_on() FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_salary_revision_target_measurement_on() IS
  'Internal (default ll). True only when hr.salary_revision.target_measurement_on is present, switched on and '
  'true; anything else is OFF. Migration 20271007180207.';

-- ----------------------------------------------------------------------------
-- b. The three tables
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_salary_revision_target_plans (
  request_id             uuid PRIMARY KEY REFERENCES public.hr_salary_revision_requests(id) ON DELETE CASCADE,
  staff_id               uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  institution_id         uuid NOT NULL,
  base_monthly_gross     numeric(12,2) NOT NULL,
  increment_amount       numeric(12,2) NOT NULL,
  held_amount            numeric(12,2) NOT NULL CHECK (held_amount >= 0),
  target_role            text,
  rules                  jsonb NOT NULL,
  window_start           date NOT NULL CHECK (EXTRACT(DAY FROM window_start) = 1),
  window_months          integer NOT NULL CHECK (window_months BETWEEN 1 AND 24),
  state                  text NOT NULL CHECK (state IN ('none', 'awaiting_measurement', 'waiting', 'released', 'paused',
                                                        'back_to_director', 'held_listed', 'lapsed')),
  state_reason           text,
  missed_in_row          integer NOT NULL DEFAULT 0,
  pending_action         text CHECK (pending_action IN ('release', 'pause', 'resume')),
  pending_effective_from date,
  held_paid_from         date,
  paused_from            date,
  run_note               text,
  lapse_note             text,
  last_run_on            date,
  failed_nights          integer NOT NULL DEFAULT 0,
  last_attempt_on        date,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CHECK ((held_amount = 0) = (state = 'none'))
);

COMMENT ON TABLE public.hr_salary_revision_target_plans IS
  'Rulings of 7 Oct 2026: one row per Director''s yes. The increment (paid on the start date) and the held part, '
  'the role''s targets and thresholds as they stood at the yes (rules), and where the held part stands. '
  'Written only by hr_salary_revision_approve_one and the monthly run. Migration 20271007180207.';

CREATE INDEX IF NOT EXISTS hr_salary_revision_target_plans_staff ON public.hr_salary_revision_target_plans (staff_id);
CREATE INDEX IF NOT EXISTS hr_salary_revision_target_plans_open ON public.hr_salary_revision_target_plans (state)
  WHERE state IN ('waiting', 'released', 'paused');

CREATE TABLE IF NOT EXISTS public.hr_salary_revision_target_months (
  request_id            uuid NOT NULL REFERENCES public.hr_salary_revision_target_plans(request_id) ON DELETE CASCADE,
  month                 date NOT NULL CHECK (EXTRACT(DAY FROM month) = 1),
  status                text NOT NULL CHECK (status IN ('in_progress', 'met', 'missed', 'not_counted',
                                                         'flagged', 'decided_met', 'decided_missed', 'not_measured')),
  results               jsonb NOT NULL DEFAULT '[]'::jsonb,
  measured_at           timestamptz,
  acted                 boolean NOT NULL DEFAULT false,
  action                text CHECK (action IN ('released', 'paused', 'resumed', 'none')),
  action_effective_from date,
  PRIMARY KEY (request_id, month)
);

COMMENT ON TABLE public.hr_salary_revision_target_months IS
  'Rulings of 7 Oct 2026: one row per counted month of a held raise: each target''s numerator, denominator and '
  'met (results), the month''s result, and what the monthly run did about it. Migration 20271007180207.';

CREATE TABLE IF NOT EXISTS public.hr_salary_revision_target_flags (
  request_id     uuid NOT NULL,
  month          date NOT NULL,
  flagged_by     uuid NOT NULL,
  flagged_at     timestamptz NOT NULL DEFAULT now(),
  note           text NOT NULL CHECK (length(btrim(note)) > 0),
  decided_by     uuid,
  decided_at     timestamptz,
  counts_as_met  boolean,
  decision_note  text,
  PRIMARY KEY (request_id, month),
  FOREIGN KEY (request_id, month) REFERENCES public.hr_salary_revision_target_months(request_id, month) ON DELETE CASCADE
);

COMMENT ON TABLE public.hr_salary_revision_target_flags IS
  'Ruling 5 of 7 Oct 2026: a principal''s flag on a month (with a note) and the Director''s decision on it. '
  'Never shown to the person whose raise it is. Migration 20271007180207.';

ALTER TABLE public.hr_salary_revision_target_plans  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_salary_revision_target_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_salary_revision_target_flags  ENABLE ROW LEVEL SECURITY;

-- Round 7: may the signed-in caller read this held part's plan and flags?
-- Whoever may see the request (the request's own rule, can_see), except the
-- person it is about (#4190's identity rule). can_see admits the asker, so a
-- self-asker (an HOD asking their own raise) was let in; not any more.
CREATE OR REPLACE FUNCTION public.hr_salary_revision_target_can_read(p_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT public.fn_hr_salary_revision_can_see(r.staff_id, r.institution_id, r.department_id, r.asked_by)
            AND NOT public.hr_salary_revision_is_own(r.staff_id, r.subject_profile_id)
       FROM public.hr_salary_revision_requests r WHERE r.id = p_request_id), false)
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_target_can_read(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.hr_salary_revision_target_can_read(uuid) TO authenticated;

COMMENT ON FUNCTION public.hr_salary_revision_target_can_read(uuid) IS
  'Round 7. True when the signed-in caller may see the request (fn_hr_salary_revision_can_see) and it is not about '
  'them (hr_salary_revision_is_own). The RLS of the plan and flag tables. Migration 20271007180207.';

-- Whoever may see the request (its own RLS decides), except the person whose
-- raise it is, even when they asked for it themselves (round 7). The person
-- reads their own numbers, state and dates through
-- fn_hr_salary_revision_my_targets() (default cc), never the notes.
DROP POLICY IF EXISTS hr_salary_revision_target_plans_select ON public.hr_salary_revision_target_plans;
CREATE POLICY hr_salary_revision_target_plans_select ON public.hr_salary_revision_target_plans
  FOR SELECT TO authenticated
  USING (public.hr_salary_revision_target_can_read(request_id));

DROP POLICY IF EXISTS hr_salary_revision_target_months_select ON public.hr_salary_revision_target_months;
CREATE POLICY hr_salary_revision_target_months_select ON public.hr_salary_revision_target_months
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.hr_salary_revision_target_plans p WHERE p.request_id = hr_salary_revision_target_months.request_id));

-- The flag's note and the decision: whoever may see the request, except the
-- person whose raise it is, even a self-asker (round 7).
DROP POLICY IF EXISTS hr_salary_revision_target_flags_select ON public.hr_salary_revision_target_flags;
CREATE POLICY hr_salary_revision_target_flags_select ON public.hr_salary_revision_target_flags
  FOR SELECT TO authenticated
  USING (public.hr_salary_revision_target_can_read(request_id));

DROP POLICY IF EXISTS hr_salary_revision_target_plans_service_role ON public.hr_salary_revision_target_plans;
CREATE POLICY hr_salary_revision_target_plans_service_role ON public.hr_salary_revision_target_plans
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS hr_salary_revision_target_months_service_role ON public.hr_salary_revision_target_months;
CREATE POLICY hr_salary_revision_target_months_service_role ON public.hr_salary_revision_target_months
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS hr_salary_revision_target_flags_service_role ON public.hr_salary_revision_target_flags;
CREATE POLICY hr_salary_revision_target_flags_service_role ON public.hr_salary_revision_target_flags
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.hr_salary_revision_target_plans, public.hr_salary_revision_target_months,
              public.hr_salary_revision_target_flags FROM anon, PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.hr_salary_revision_target_plans, public.hr_salary_revision_target_months,
              public.hr_salary_revision_target_flags FROM authenticated;
GRANT SELECT ON public.hr_salary_revision_target_plans, public.hr_salary_revision_target_months,
                public.hr_salary_revision_target_flags TO authenticated;
GRANT ALL ON public.hr_salary_revision_target_plans, public.hr_salary_revision_target_months,
             public.hr_salary_revision_target_flags TO service_role;

-- ----------------------------------------------------------------------------
-- c0. Who first marked a period, and when, as the SERVER saw it (default q)
-- ----------------------------------------------------------------------------
-- The browser writes marked_by_details, and a row can be cleared, re-keyed,
-- deleted and re-inserted, or a period removed and marked again. None of that
-- may move who first marked a period or when. So the first marking goes into
-- an append-only table, never into the attendance row: one stamp per
-- (timetable, day, period name, n-th period of that name), written once
-- (INSERT ... ON CONFLICT DO NOTHING) and never updated or deleted by anyone
-- signed in. When a write leaves m marked periods of one name on a day,
-- stamps 1..m that do not exist yet are written; existing ones stay. The
-- attendance row itself (marked_by_details included) is left exactly as the
-- app wrote it. A write by the server key, or the SQL console, stamps with no
-- marker (never counts). Periods marked before this file have no stamp until
-- their first later write, which stamps them with that write's time.
CREATE TABLE IF NOT EXISTS public.attendance_first_marks (
  timetable_id      uuid NOT NULL,
  attendance_date   date NOT NULL,
  period_name       text NOT NULL,
  ordinal           integer NOT NULL CHECK (ordinal >= 1),
  institution_id    uuid,
  marker_profile_id uuid,
  first_marked_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (timetable_id, attendance_date, period_name, ordinal)
);

COMMENT ON TABLE public.attendance_first_marks IS
  'Default q of 7 Oct 2026 (raise target T1): the server''s record of who FIRST marked each period (timetable, '
  'day, period name, n-th of that name) and when. Append-only: written once by trg_zz_student_attendance_first_marks, '
  'never updated or deleted by anyone signed in. marker_profile_id NULL = written by the server key or console '
  '(never counts). Migration 20271007180207.';

ALTER TABLE public.attendance_first_marks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS attendance_first_marks_select_own ON public.attendance_first_marks;
CREATE POLICY attendance_first_marks_select_own ON public.attendance_first_marks
  FOR SELECT TO authenticated
  USING (marker_profile_id = auth.uid());
DROP POLICY IF EXISTS attendance_first_marks_service_role ON public.attendance_first_marks;
CREATE POLICY attendance_first_marks_service_role ON public.attendance_first_marks
  FOR SELECT TO service_role USING (true);
REVOKE ALL ON public.attendance_first_marks FROM anon, PUBLIC, authenticated, service_role;
GRANT SELECT ON public.attendance_first_marks TO authenticated, service_role;

-- Round 7: the name a period is stamped under. An absurdly long name (200
-- characters or more) is cut to 150 and given its md5, so the key stays far
-- below the index's size limit and still tells two long names apart.
CREATE OR REPLACE FUNCTION public.attendance_first_mark_period_key(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN length(p_name) >= 200 THEN left(p_name, 150) || ' #' || md5(p_name) ELSE p_name END
$function$;

REVOKE EXECUTE ON FUNCTION public.attendance_first_mark_period_key(text) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.attendance_first_mark_period_key(text) IS
  'Internal (round 7). The period name as stamped in attendance_first_marks: unchanged under 200 characters, '
  'otherwise its first 150 characters plus its md5. Migration 20271007180207.';

CREATE OR REPLACE FUNCTION public.fn_record_attendance_first_marks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  -- A signed-in person (not the server key) is the marker; anyone else: nobody.
  v_marker uuid;
  v_name   text;
  v_count  integer;
BEGIN
  -- Round 7: this record must NEVER fail an attendance save. Any error here is
  -- a warning, and the save goes ahead without the stamp.
  BEGIN
    -- Round 8: read inside the protected block, so a malformed claim cannot fail the save.
    v_marker := CASE WHEN auth.role() IS NOT DISTINCT FROM 'service_role' THEN NULL ELSE auth.uid() END;
    IF jsonb_typeof(NEW.attendance_data) IS DISTINCT FROM 'object' THEN
      RETURN NULL;
    END IF;
    -- CASE, not AND: Postgres may run jsonb_array_length before the type test.
    FOR v_name, v_count IN
      SELECT public.attendance_first_mark_period_key(btrim(e.value->>'period_name')), count(*)::int
        FROM jsonb_each(NEW.attendance_data) e
       WHERE jsonb_typeof(e.value) = 'object'
         AND NULLIF(btrim(e.value->>'period_name'), '') IS NOT NULL
         AND CASE WHEN jsonb_typeof(e.value->'students') = 'array'
                  THEN jsonb_array_length(e.value->'students') END > 0
       GROUP BY 1
    LOOP
      INSERT INTO public.attendance_first_marks
        (timetable_id, attendance_date, period_name, ordinal, institution_id, marker_profile_id, first_marked_at)
      SELECT NEW.timetable_id, NEW.attendance_date, v_name, g, NEW.institution_id, v_marker, now()
        FROM generate_series(1, v_count) g
      ON CONFLICT (timetable_id, attendance_date, period_name, ordinal) DO NOTHING;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'attendance_first_marks: not recorded for timetable % on %: %',
      NEW.timetable_id, NEW.attendance_date, SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_record_attendance_first_marks() FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.fn_record_attendance_first_marks() IS
  'AFTER INSERT/UPDATE trigger on student_attendance (default q, 7 Oct 2026): records each period''s FIRST '
  'marking in attendance_first_marks (ON CONFLICT DO NOTHING). Never changes the attendance row and never fails '
  'the save (an error is a WARNING; round 7). Migration 20271007180207.';

DROP TRIGGER IF EXISTS trg_zz_student_attendance_first_marks ON public.student_attendance;
CREATE TRIGGER trg_zz_student_attendance_first_marks
  AFTER INSERT OR UPDATE OF attendance_data ON public.student_attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_record_attendance_first_marks();

-- ----------------------------------------------------------------------------
-- c. Measuring one person's month (pure SQL)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_salary_revision_target_measure(p_staff_id uuid, p_month date, p_targets jsonb)
RETURNS TABLE(target text, numerator integer, denominator integer, met boolean)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
WITH
me AS (
  SELECT s.id, s.profile_id::text AS who FROM public.staff s WHERE s.id = p_staff_id
),
days AS (
  SELECT g::date AS d
    FROM generate_series(date_trunc('month', p_month)::date,
                         (date_trunc('month', p_month) + interval '1 month' - interval '1 day')::date,
                         interval '1 day') g
),
-- T1's denominator: their timetable slots on every working day of the month.
-- A slot whose period has no name cannot be matched to attendance and is left
-- out (default u); two slots with the same name on one day are numbered.
raw_slots AS (
  SELECT t.id AS timetable_id, dd.d, slot.key AS slot_id, lower(slot.value->>'course_id') AS course_id,
         NULLIF(btrim(pe.period_name), '') AS period_name, pe.start_time, pe.end_time
    FROM public.timetables t
    JOIN days dd ON dd.d BETWEEN t.start_date AND t.end_date
                AND t.selected_days ? upper(btrim(to_char(dd.d, 'DAY')))
    CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(t.timetable_data -> upper(btrim(to_char(dd.d, 'DAY')))) = 'object'
                                       THEN t.timetable_data -> upper(btrim(to_char(dd.d, 'DAY')))
                                       ELSE '{}'::jsonb END) slot
    LEFT JOIN LATERAL (
      SELECT x->>'period_name' AS period_name, NULLIF(x->>'start_time', '')::time AS start_time,
             NULLIF(x->>'end_time', '')::time AS end_time
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(t.periods) = 'array' THEN t.periods ELSE '[]'::jsonb END) x
       WHERE x->>'id' = slot.key
       LIMIT 1) pe ON true
   -- Default dd: a timetable runs on the days between its start and end
   -- dates (not a template), whatever is_active says NOW: the daily job
   -- switches a timetable off the day after it ends.
   WHERE COALESCE(t.is_template, false) = false
     AND jsonb_typeof(slot.value) = 'object'
     AND lower(slot.value->>'primary_staff_id') = p_staff_id::text
     -- Default ii: the teacher's own approved leave days are not counted against them.
     AND NOT EXISTS (SELECT 1 FROM public.hr_leave_applications la
                      WHERE la.employee_id = p_staff_id AND la.status = 'approved'
                        AND dd.d BETWEEN la.start_date AND la.end_date)
     AND NULLIF(slot.value->>'course_id', '') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.institution_off_days o
                      WHERE o.institution_id = t.institution_id AND o.off_date = dd.d)
     AND NOT EXISTS (SELECT 1 FROM public.institution_leaves l
                      WHERE l.institution_id = t.institution_id AND l.status = 'approved'
                        AND COALESCE(l.scope_level, 'institution') = 'institution'
                        AND dd.d BETWEEN l.start_date AND l.end_date)
),
-- Default dd: when two timetables give the same person the same period name
-- on the same day (one replaced the other), only one counts: the one whose
-- period was marked, else the newer.
chosen AS (
  SELECT DISTINCT ON (r.d, r.period_name) r.d, r.period_name, r.timetable_id
    FROM raw_slots r
    JOIN public.timetables t ON t.id = r.timetable_id
   WHERE r.period_name IS NOT NULL
   ORDER BY r.d, r.period_name,
            EXISTS (SELECT 1 FROM public.attendance_first_marks fm
                     WHERE fm.timetable_id = r.timetable_id AND fm.attendance_date = r.d
                       AND fm.period_name = public.attendance_first_mark_period_key(r.period_name)) DESC,
            t.created_at DESC NULLS LAST, t.id DESC
),
slots AS (
  SELECT r.*, row_number() OVER (PARTITION BY r.timetable_id, r.d, r.period_name ORDER BY r.end_time NULLS LAST, r.slot_id) AS rn
    FROM raw_slots r
    JOIN chosen c ON c.d = r.d AND c.period_name = r.period_name AND c.timetable_id = r.timetable_id
),
-- The attendance entries of those timetables and days, with learners in them
-- (for the period's key, which links lessons and material).
entries AS (
  SELECT sa.timetable_id, sa.attendance_date AS d, e.key AS entry_id, btrim(e.value->>'period_name') AS period_name
    FROM public.student_attendance sa
    CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(sa.attendance_data) = 'object'
                                       THEN sa.attendance_data ELSE '{}'::jsonb END) e
   WHERE (sa.timetable_id, sa.attendance_date) IN (SELECT timetable_id, d FROM slots)
     AND jsonb_typeof(e.value) = 'object'
     AND CASE WHEN jsonb_typeof(e.value->'students') = 'array' THEN jsonb_array_length(e.value->'students') END > 0
),
numbered AS (
  SELECT x.*, row_number() OVER (PARTITION BY x.timetable_id, x.d, x.period_name ORDER BY x.entry_id) AS rn
    FROM entries x
),
-- Each slot matched to at most one entry and one first-mark stamp: same
-- timetable, day, period name and number. Who first marked it and when come
-- ONLY from attendance_first_marks (the server's record, default q).
marks AS (
  SELECT s.*, n.entry_id, fm.marker_profile_id::text AS marker_id, fm.first_marked_at AS marked_at
    FROM slots s
    LEFT JOIN numbered n ON n.timetable_id = s.timetable_id AND n.d = s.d
                        AND n.period_name = s.period_name AND n.rn = s.rn
    LEFT JOIN public.attendance_first_marks fm ON fm.timetable_id = s.timetable_id AND fm.attendance_date = s.d
                        AND fm.period_name = public.attendance_first_mark_period_key(s.period_name) AND fm.ordinal = s.rn
),
mine AS (
  SELECT k.* FROM marks k, me WHERE me.who IS NOT NULL AND k.marker_id = me.who AND k.marked_at IS NOT NULL
),
t1 AS (
  SELECT (SELECT count(*) FROM slots)::int AS den,
         (SELECT count(*) FROM mine k
           WHERE (k.marked_at AT TIME ZONE 'Asia/Kolkata')
                 <= k.d + COALESCE(k.end_time, time '23:59:59')
                    + make_interval(hours => (p_targets->>'t1_mark_within_hours')::int)
             -- default z: never before the session began (a row saved ahead for a future day)
             AND (k.marked_at AT TIME ZONE 'Asia/Kolkata') >= k.d + COALESCE(k.start_time, time '00:00'))::int AS num
),
courses AS (SELECT DISTINCT course_id FROM slots),
-- T2 (default r): a course counts when they approved at least one published
-- lesson they did not write themselves (an AI draft, or a colleague's), and
-- no draft THEY created is left on it. Other teachers' drafts on a shared
-- course do not count against them (there is no assignment column).
spine_ok AS (
  SELECT c.course_id FROM courses c, me
   WHERE me.who IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.curriculum_lesson l
                      WHERE l.course_id::text = c.course_id AND l.status = 'draft'
                        AND l.created_by::text = me.who)
     AND EXISTS (SELECT 1 FROM public.curriculum_lesson l
                  WHERE l.course_id::text = c.course_id AND l.status = 'published' AND l.approved_by::text = me.who
                    AND (l.source <> 'faculty' OR l.created_by::text IS DISTINCT FROM me.who))
),
t2 AS (
  SELECT (SELECT count(*) FROM courses)::int AS den, (SELECT count(*) FROM spine_ok)::int AS num
),
t3 AS (
  SELECT count(*)::int AS den,
         (count(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM public.class_session_lesson c, me
             WHERE c.timetable_id = k.timetable_id AND c.attendance_date = k.d
               AND c.period_id = k.entry_id AND c.linked_by::text = me.who)))::int AS num
    FROM mine k
   WHERE k.course_id IN (SELECT course_id FROM spine_ok)
),
-- T4 (default s): their OWN scheduled periods with class material they posted
-- for that period by the end of that day, still switched on.
t4 AS (
  SELECT count(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM public.session_resource r, me
             WHERE me.who IS NOT NULL AND r.posted_by::text = me.who
               AND r.is_active
               AND r.timetable_id = k.timetable_id AND r.attendance_date = k.d AND r.period_id = k.entry_id
               AND r.posted_at < ((k.d + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')))::int AS num
    FROM marks k
),
-- T5 (default t): every (course, Monday-to-Sunday week) they teach in the
-- month needs the set number of pulses they actually OPENED: the class poll
-- they made for it reached open (induction_session_poll.issued_at is set only
-- when a poll opens), or a pulse they opened directly (fn_scf_open_pulse
-- inserts it already open and never gives it a poll), open now or closed
-- since. A placeholder always gets its poll in the same call; one whose poll
-- was drafted and closed never reached open and does not count.
weeks AS (
  SELECT DISTINCT course_id, date_trunc('week', d)::date AS wk FROM slots
),
pulses AS (
  SELECT lower(sa.attendance_data -> lp.period_id ->> 'course_id') AS course_id,
         date_trunc('week', lp.attendance_date)::date AS wk
    FROM public.scf_live_pulse lp
    JOIN me ON me.who IS NOT NULL AND lp.created_by::text = me.who
    JOIN public.student_attendance sa ON sa.timetable_id = lp.timetable_id AND sa.attendance_date = lp.attendance_date
   WHERE date_trunc('week', lp.attendance_date)::date IN (SELECT wk FROM weeks)
     AND jsonb_typeof(sa.attendance_data -> lp.period_id) = 'object'
     -- Default ee: opened IN that week (India time), not back-filled later.
     AND (EXISTS (SELECT 1 FROM public.induction_session_poll ip
                   WHERE ip.context_type = 'class_session' AND ip.context_id = lp.id
                     AND ip.issued_at IS NOT NULL AND ip.created_by::text = me.who
                     AND date_trunc('week', (ip.issued_at AT TIME ZONE 'Asia/Kolkata')::date) = date_trunc('week', lp.attendance_date))
          OR (NOT EXISTS (SELECT 1 FROM public.induction_session_poll ip
                           WHERE ip.context_type = 'class_session' AND ip.context_id = lp.id)
              AND date_trunc('week', (lp.issued_at AT TIME ZONE 'Asia/Kolkata')::date) = date_trunc('week', lp.attendance_date)))
),
t5 AS (
  SELECT count(*)::int AS den,
         (count(*) FILTER (WHERE (SELECT count(*) FROM pulses p WHERE p.course_id = w.course_id AND p.wk = w.wk)
                                 >= (p_targets->>'t5_min_pulses_per_week')::int))::int AS num
    FROM weeks w
)
SELECT 't1', t1.num, t1.den,
       t1.den > 0 AND t1.num * 100 >= (p_targets->>'t1_marked_by_self_min_pct')::numeric * t1.den
  FROM t1
UNION ALL
SELECT 't2', t2.num, t2.den, t2.den > 0 AND t2.num = t2.den FROM t2
UNION ALL
SELECT 't3', t3.num, t3.den,
       (SELECT t2.den > 0 AND t2.num = t2.den FROM t2)
       AND t3.den > 0 AND t3.num * 100 >= (p_targets->>'t3_linked_min_pct')::numeric * t3.den
  FROM t3
UNION ALL
SELECT 't4', t4.num, t1.den,
       t1.den > 0 AND t4.num * 100 >= (p_targets->>'t4_resource_min_pct')::numeric * t1.den
  FROM t4, t1
UNION ALL
SELECT 't5', t5.num, t5.den, t5.den > 0 AND t5.num = t5.den FROM t5
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_target_measure(uuid, date, jsonb) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_salary_revision_target_measure(uuid, date, jsonb) IS
  'Internal, pure SQL. One row per faculty target (t1..t5) for one person and one calendar month: numerator, '
  'denominator and met, against the thresholds passed in (the snapshot on the plan). T1 reads only the server''s '
  'stamps on the first marking. A month with no scheduled periods has t1''s denominator 0. Rulings of 7 Oct 2026, '
  'defaults q-u. Migration 20271007180207.';

-- ----------------------------------------------------------------------------
-- d. The split at the yes: the role's targets, snapshotted
-- ----------------------------------------------------------------------------
-- The role keys an account holds: its profile role and every active user_roles role.
CREATE OR REPLACE FUNCTION public.hr_salary_revision_target_role_keys(p_profile_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT k ORDER BY k), ARRAY[]::text[])
    FROM (SELECT p.role AS k FROM public.profiles p WHERE p.id = p_profile_id
          UNION
          SELECT cr.role_key FROM public.user_roles ur
            JOIN public.custom_roles cr ON cr.id = ur.role_id
           WHERE ur.user_id = p_profile_id AND COALESCE(cr.is_active, true)) x
   WHERE k IS NOT NULL AND btrim(k) <> ''
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_target_role_keys(uuid) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_salary_revision_target_role_keys(uuid) IS
  'Internal. The role keys an account holds (profiles.role and its active user_roles). Migration 20271007180207.';

-- Default y: does this person teach? Periods as the main teacher
-- (primary_staff_id) on a selected day of an active, non-template timetable
-- whose dates overlap the range.
CREATE OR REPLACE FUNCTION public.hr_salary_revision_target_teaches(p_staff_id uuid, p_from date, p_to date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.timetables t
      CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(t.timetable_data) = 'object'
                                         THEN t.timetable_data ELSE '{}'::jsonb END) dd
      CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(dd.value) = 'object'
                                         THEN dd.value ELSE '{}'::jsonb END) sl
     -- Default dd: running by its dates, not by is_active now.
     WHERE COALESCE(t.is_template, false) = false
       AND t.start_date <= p_to AND t.end_date >= p_from
       AND t.selected_days ? dd.key
       AND jsonb_typeof(sl.value) = 'object'
       AND lower(sl.value->>'primary_staff_id') = p_staff_id::text
       -- Default kk: made before the range began, or actually marked by them in
       -- it (a timetable made just before the yes cannot make anyone a teacher).
       AND (t.created_at < p_from
            OR EXISTS (SELECT 1 FROM public.attendance_first_marks fm
                         JOIN public.staff s ON s.id = p_staff_id AND s.profile_id = fm.marker_profile_id
                        WHERE fm.timetable_id = t.id AND fm.attendance_date BETWEEN p_from AND p_to)))
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_target_teaches(uuid, date, date) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_salary_revision_target_teaches(uuid, date, date) IS
  'Internal (defaults y, dd, kk, 7 Oct 2026). True when the person is the main teacher (primary_staff_id) of a slot '
  'on a selected day of a non-template timetable whose dates overlap the range, made before the range began or '
  'first-marked by them in it. Migration 20271007180207.';

-- Who the held part is measured as (defaults y, ll): a Director-list member,
-- a principal, one role with targets, several, a teacher, or nobody. Run at
-- the yes while measurement is ON, otherwise when it is switched ON.
CREATE OR REPLACE FUNCTION public.hr_salary_revision_target_classify(p_request_id uuid, p_rules jsonb, p_today date)
RETURNS TABLE(state text, role text, reason text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_r       record;
  v_profile uuid;
  v_keys    text[];
  v_wait    text;
  v_match   text[];
  v_role    text;
  v_state   text;
  v_reason  text;
BEGIN
  SELECT * INTO v_r FROM public.hr_salary_revision_requests WHERE id = p_request_id;
  v_profile := COALESCE((SELECT s.profile_id FROM public.staff s WHERE s.id = v_r.staff_id), v_r.subject_profile_id);
  v_keys := public.hr_salary_revision_target_role_keys(v_profile);

  IF false THEN
    NULL;
  -- RULING 6: a Director-list member's held part is never released by itself.
  ELSIF public.hr_salary_revision_is_list_member(v_r.staff_id, v_r.subject_profile_id, v_r.subject_was_list_member) THEN
    v_state := 'held_listed'; v_reason := 'director_list';
  ELSE
    -- RULING 6: the principal's own raise waits for principal targets.
    SELECT min(e) INTO v_wait
      FROM jsonb_array_elements_text(p_rules->'roles_waiting_for_own_targets') e
     WHERE e = ANY (v_keys);
    IF v_wait IS NOT NULL THEN
      v_state := 'held_listed'; v_reason := 'waits_for_own_targets:' || v_wait;
    ELSE
      SELECT array_agg(k ORDER BY k) INTO v_match
        FROM jsonb_object_keys(p_rules->'role_targets') k
       WHERE k = ANY (v_keys);
      IF cardinality(v_match) = 1 THEN
        v_state := 'waiting'; v_role := v_match[1];
      ELSIF v_match IS NOT NULL THEN
        v_state := 'held_listed'; v_reason := 'several_target_roles:' || array_to_string(v_match, ',');
      -- Default y: whoever TEACHES (periods as the main teacher in a
      -- timetable in the 90 days before the day classified) gets the faculty
      -- set, whatever their role key is called.
      ELSIF public.hr_salary_revision_target_teaches(v_r.staff_id,
              p_today - 90, p_today - 1) THEN
        IF p_rules->'role_targets' ? 'faculty' THEN
          v_state := 'waiting'; v_role := 'faculty';
        ELSE
          v_state := 'held_listed'; v_reason := 'no_targets_for_role';
        END IF;
      ELSE
        v_state := 'held_listed'; v_reason := 'no_teaching_timetable';
      END IF;
    END IF;
  END IF;
  RETURN QUERY SELECT v_state, v_role, v_reason;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_target_classify(uuid, jsonb, date) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_salary_revision_target_classify(uuid, jsonb, date) IS
  'Internal (defaults y, ll). Classifies a held part for measurement on a day: Director list, principal, role '
  'targets, several roles, teaches, or none. Migration 20271007180207.';

-- Writes the plan for a fresh yes (called by approve_one only). A fresh yes
-- after a missed start replaces the earlier plan and its months: the count
-- starts again at the new yes.
CREATE OR REPLACE FUNCTION public.hr_salary_revision_target_plan_write(
  p_request_id uuid, p_base numeric, p_increment numeric, p_held numeric, p_rules jsonb)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_r       record;
  v_role    text;
  v_state   text;
  v_reason  text;
BEGIN
  SELECT * INTO v_r FROM public.hr_salary_revision_requests WHERE id = p_request_id;

  IF p_held <= 0 THEN
    v_state := 'none';
  -- Default ll: measurement switched OFF: held, unclassified, until it is switched on.
  ELSIF NOT public.hr_salary_revision_target_measurement_on() THEN
    v_state := 'awaiting_measurement';
  ELSE
    SELECT c.state, c.role, c.reason INTO v_state, v_role, v_reason
      FROM public.hr_salary_revision_target_classify(p_request_id, p_rules, public.hr_salary_revision_ist_today()) c;
  END IF;

  DELETE FROM public.hr_salary_revision_target_months WHERE request_id = p_request_id;

  INSERT INTO public.hr_salary_revision_target_plans
    (request_id, staff_id, institution_id, base_monthly_gross, increment_amount, held_amount,
     target_role, rules, window_start, window_months, state, state_reason)
  VALUES
    (p_request_id, v_r.staff_id, v_r.institution_id, p_base, p_increment, GREATEST(p_held, 0),
     v_role,
     jsonb_build_object(
       'annual_increment_percent', p_rules->'annual_increment_percent',
       'window_months', p_rules->'window_months',
       'pause_after_missed_months', p_rules->'pause_after_missed_months',
       'role', v_role,
       'targets', CASE WHEN v_role IS NULL THEN NULL ELSE p_rules->'role_targets'->v_role END),
     (date_trunc('month', public.hr_salary_revision_ist_today()) + interval '1 month')::date,
     (p_rules->>'window_months')::int, v_state, v_reason)
  ON CONFLICT (request_id) DO UPDATE
     SET staff_id = EXCLUDED.staff_id, institution_id = EXCLUDED.institution_id,
         base_monthly_gross = EXCLUDED.base_monthly_gross, increment_amount = EXCLUDED.increment_amount,
         held_amount = EXCLUDED.held_amount, target_role = EXCLUDED.target_role, rules = EXCLUDED.rules,
         window_start = EXCLUDED.window_start, window_months = EXCLUDED.window_months,
         state = EXCLUDED.state, state_reason = EXCLUDED.state_reason, missed_in_row = 0,
         pending_action = NULL, pending_effective_from = NULL, held_paid_from = NULL, paused_from = NULL,
         run_note = NULL, lapse_note = NULL, last_run_on = NULL, failed_nights = 0, last_attempt_on = NULL,
         updated_at = now();
  RETURN v_state;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_target_plan_write(uuid, numeric, numeric, numeric, jsonb) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_salary_revision_target_plan_write(uuid, numeric, numeric, numeric, jsonb) IS
  'Internal (approve_one only). Writes the plan for a yes: increment, held part, the role''s targets and '
  'thresholds as they stand (snapshot), and the starting state. Rulings of 7 Oct 2026. Migration 20271007180207.';

-- ----------------------------------------------------------------------------
-- e0. The ask: one held raise at a time (default p). #4190's body
--     (20271007150103 section f1) plus the lines marked 7 Oct 2026.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_salary_revision_propose(
  p_staff_id uuid, p_monthly_gross numeric, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_s        record;
  v_current  numeric;
  v_as       text;
  v_cap_tier integer;
  v_sub_tier integer;
  v_route    text;
  v_open     uuid;
  v_id       uuid;
  v_self     boolean;
  v_name     text;
  v_checkers uuid[];
  v_also_hod boolean := false;
  v_band     jsonb;
  v_director uuid;
  v_ident    uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_monthly_gross IS NULL OR p_monthly_gross <= 0 THEN
    RAISE EXCEPTION 'The new monthly pay must be more than zero.' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Write a reason. The Director reads it before he decides.' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(p_reason)) > 2000 THEN
    RAISE EXCEPTION 'The reason is too long (2,000 characters at most).' USING ERRCODE = '22023';
  END IF;

  SELECT s.id, s.profile_id, s.institution_id, s.department_id, s.first_name, s.last_name
    INTO v_s
    FROM public.v_hr_staff s
   WHERE s.id = p_staff_id AND COALESCE(s.is_active, false);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This person is not on the HR list of active team members.' USING ERRCODE = 'P0002';
  END IF;

  -- RULING 1 — who may ask for whom. The broadest lane the caller holds wins.
  IF public.fn_hr_salary_revision_can_approve() THEN
    v_as := 'director'; v_cap_tier := 4;
  ELSIF public.user_has_permission('hr.payroll.salary_revision.ask_anyone') THEN
    v_as := 'hr_head'; v_cap_tier := 3;
  ELSIF public.user_has_permission('hr.payroll.salary_revision.ask_own_college')
        AND v_s.institution_id = ANY (public.fn_my_staff_institution_ids()) THEN
    v_as := 'principal'; v_cap_tier := 2;
  ELSIF public.user_has_permission('hr.payroll.salary_revision.ask_own_department')
        AND v_s.department_id = ANY (public.fn_hr_salary_revision_my_department_ids()) THEN
    v_as := 'hod'; v_cap_tier := 1;
  ELSE
    RAISE EXCEPTION 'You can ask only for people in your own college (principal) or your own department (head of department).'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- RULE 3 (1 Oct 2026): the Director himself's own pay is not asked for here.
  -- Without the setting that names him nobody can tell which person on the
  -- Director list he is, and no such raise could be decided anyway (rule 2
  -- fails closed), so then a raise for anyone on the list is refused.
  -- Who the raise is for: the record's link and the accounts whose sign-in
  -- email it carries (a record linked to a decoy is still theirs).
  v_ident := public.hr_salary_revision_request_identity(p_staff_id, v_s.profile_id);
  -- The Director himself as the setting names him, on the list or not (taking
  -- him off the list does not make his raise askable).
  IF public.hr_salary_revision_configured_decider_id() = ANY (v_ident) THEN
    RAISE EXCEPTION 'The Director''s own pay is decided outside MyJKKN.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_ident && public.hr_salary_revision_director_ids() THEN
    v_director := public.hr_salary_revision_list_member_raise_decider_id();
    IF v_director IS NULL THEN
      RAISE EXCEPTION 'This person is on the Director list, and a raise for someone on the Director list cannot be asked for yet: the setting that names the Director himself (hr.salary_revision.list_member_raise_decider_profile_id) is missing or does not name someone on the Director list.'
        USING ERRCODE = '55000';
    END IF;
  END IF;
  -- A staff record linked to no account, whose email is that of someone on the
  -- Director list, is not asked for until it is linked: until then rule 3 and
  -- the decision rules could not tell whose raise it is.
  IF v_s.profile_id IS NULL
     AND public.hr_salary_revision_email_profile_ids(p_staff_id) && public.hr_salary_revision_director_ids() THEN
    RAISE EXCEPTION 'This team member''s record is not linked to an account, but its email belongs to someone on the Director list. Link the record to that account first.'
      USING ERRCODE = '55000';
  END IF;

  SELECT monthly_gross INTO v_current
    FROM public.hr_staff_salaries
   WHERE staff_id = p_staff_id AND superseded_by IS NULL;
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'This person has no salary recorded yet, so there is nothing to revise. HR records the first salary on Employee Salaries.'
      USING ERRCODE = 'P0002';
  END IF;
  IF p_monthly_gross = v_current THEN
    RAISE EXCEPTION 'That is the same as the pay now.' USING ERRCODE = '22023';
  END IF;

  -- RULING 10. The partial unique index is the real guarantee; this check only
  -- lets the second asker be told WHICH request is waiting.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_staff_id::text || ':salary_revision', 0));
  SELECT id INTO v_open FROM public.hr_salary_revision_requests
   WHERE staff_id = p_staff_id AND status IN ('waiting_principal', 'waiting_director', 'approved');
  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION 'A salary revision for this person is already waiting. You can add a comment to it instead.'
      USING ERRCODE = 'unique_violation', DETAIL = v_open::text;
  END IF;

  -- 7 Oct 2026, default p: one held raise at a time.
  IF EXISTS (SELECT 1 FROM public.hr_salary_revision_target_plans tp
               JOIN public.hr_salary_revision_requests rq ON rq.id = tp.request_id AND rq.status IN ('approved', 'applied')
              WHERE tp.staff_id = p_staff_id
                AND tp.state IN ('awaiting_measurement', 'waiting', 'released', 'paused', 'held_listed', 'back_to_director')) THEN
    RAISE EXCEPTION 'This person has an earlier raise whose held part is still open. Finish or lapse the earlier held raise first.'
      USING ERRCODE = '55000';
  END IF;

  -- RULING 9 — flagged, never refused.
  v_self := p_staff_id = ANY (public.fn_my_staff_ids());
  v_sub_tier := public.hr_salary_revision_user_tier(v_s.profile_id);

  -- RULING 2. An HOD's request goes via the principal — unless it is ABOUT a
  -- principal or someone more senior, who cannot check their own pay.
  -- RULE 4 (1 Oct 2026): nor an HOD asking for THEIR OWN raise, which goes
  -- straight to the Director, the same as a principal's own. A raise for any
  -- other HOD still goes via the principal.
  v_route := CASE WHEN v_as = 'hod' AND NOT COALESCE(v_self, false) AND v_sub_tier < 2 THEN 'via_principal' ELSE 'direct' END;

  -- 30 Sep: a principal who is ALSO the head of this person's department has
  -- nobody to check them; the request goes straight to the Director, marked.
  v_also_hod := v_as = 'principal'
    AND v_s.department_id IS NOT NULL
    AND v_s.department_id = ANY (public.fn_hr_salary_revision_my_department_ids());

  -- 30 Sep: the college's band as it stands now, kept so the Director's screen
  -- can say when it changed since the request (the same row #4119 reads).
  SELECT bp.value INTO v_band
    FROM public.platform_policies bp
   WHERE bp.policy_key = 'hr.pay_scales' AND bp.scope_type = 'institution'
     AND bp.scope_id = v_s.institution_id
   LIMIT 1;

  INSERT INTO public.hr_salary_revision_requests (
    staff_id, subject_profile_id, institution_id, department_id, asked_by, asked_as, route,
    is_self, is_for_senior, asker_is_also_hod, band_snapshot,
    current_monthly_gross, asked_monthly_gross, reason, status, subject_was_list_member)
  VALUES (
    p_staff_id, v_s.profile_id, v_s.institution_id, v_s.department_id, v_uid, v_as, v_route,
    v_self, (NOT v_self) AND v_sub_tier > v_cap_tier, v_also_hod, v_band,
    v_current, p_monthly_gross, btrim(p_reason),
    CASE v_route WHEN 'via_principal' THEN 'waiting_principal' ELSE 'waiting_director' END,
    v_ident && public.hr_salary_revision_director_ids())
  RETURNING id INTO v_id;

  IF v_route = 'via_principal' THEN
    v_name := TRIM(BOTH FROM COALESCE(v_s.first_name, '') || ' ' || COALESCE(v_s.last_name, ''));
    SELECT array_agg(DISTINCT st.profile_id) INTO v_checkers
      FROM public.staff st
     WHERE st.institution_id = v_s.institution_id
       AND st.is_active AND st.profile_id IS NOT NULL
       AND st.id <> p_staff_id
       AND public.hr_salary_revision_user_holds(st.profile_id, 'hr.payroll.salary_revision.college_check');
    PERFORM public.hr_salary_revision_notify(
      v_checkers,
      'A salary revision needs your check',
      'A head of department asked for a salary revision for ' || v_name
        || '. Please agree or stop it before it goes to the Director.',
      '/hr/salary-revisions/' || v_id,
      'hr.payroll.salary_revision.check:' || v_id,
      jsonb_build_object('request_id', v_id));
  END IF;

  RETURN v_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_salary_revision_propose(uuid, numeric, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_salary_revision_propose(uuid, numeric, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- e1. The yes: the split. #4190's body (20271007150103 section f2) plus the
--     lines marked 7 Oct 2026.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_salary_revision_approve_one(
  p_request_id uuid, p_final numeric, p_note text)
RETURNS date
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_r       record;
  v_final   numeric;
  v_start   date;
  v_now_pay numeric;
  v_subject uuid;
  v_name    text;
  v_when    text;
  -- 7 Oct 2026: the split.
  v_rules   jsonb;
  v_base    numeric;
  v_inc     numeric;
  v_held    numeric;
BEGIN
  SELECT * INTO v_r FROM public.hr_salary_revision_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such request.' USING ERRCODE = 'P0002';
  END IF;
  IF v_r.status <> 'waiting_director' THEN
    RAISE EXCEPTION 'This request is not waiting for the Director (it is %).', v_r.status
      USING ERRCODE = '55000';
  END IF;
  -- 30 Sep: a person who has left cannot be given a raise.
  IF NOT EXISTS (SELECT 1 FROM public.v_hr_staff s WHERE s.id = v_r.staff_id AND COALESCE(s.is_active, false)) THEN
    RAISE EXCEPTION 'This person is no longer an active team member, so there is no pay to revise.'
      USING ERRCODE = '55000';
  END IF;
  -- 1 Oct 2026: never one's own raise; a Director-list member's only by the
  -- Director himself.
  PERFORM public.hr_salary_revision_assert_may_decide(v_r.staff_id, v_r.subject_profile_id, v_r.subject_was_list_member);
  -- 7 Oct 2026, default p: one held raise at a time (an ask made before it).
  IF EXISTS (SELECT 1 FROM public.hr_salary_revision_target_plans tp
               JOIN public.hr_salary_revision_requests rq ON rq.id = tp.request_id AND rq.status IN ('approved', 'applied')
              WHERE tp.staff_id = v_r.staff_id AND tp.request_id <> p_request_id
                AND tp.state IN ('awaiting_measurement', 'waiting', 'released', 'paused', 'held_listed', 'back_to_director')) THEN
    RAISE EXCEPTION 'This person has an earlier raise whose held part is still open. Finish or lapse the earlier held raise first.'
      USING ERRCODE = '55000';
  END IF;

  v_final := COALESCE(p_final, v_r.asked_monthly_gross);
  IF v_final IS NULL OR v_final <= 0 THEN
    RAISE EXCEPTION 'The new monthly pay must be more than zero.' USING ERRCODE = '22023';
  END IF;

  -- 7 Oct 2026: the split needs the raise rules. Missing, switched off or
  -- malformed: nothing is approved (fail closed).
  v_rules := public.hr_salary_revision_target_rules();
  IF v_rules IS NULL THEN
    RAISE EXCEPTION 'The raise rules setting (hr.salary_revision.target_rules) is missing, switched off or malformed, so no raise can be approved until it is restored.'
      USING ERRCODE = '55000';
  END IF;

  v_start := public.hr_salary_revision_start_date(v_r.staff_id, public.hr_salary_revision_ist_today());

  UPDATE public.hr_salary_revision_requests
     SET status = 'approved', final_monthly_gross = v_final, starts_on = v_start,
         director_decided_by = v_uid, director_decided_at = now(),
         decided_under_rules = true
   WHERE id = p_request_id;

  IF p_note IS NOT NULL AND btrim(p_note) <> '' THEN
    INSERT INTO public.hr_salary_revision_comments (request_id, author_id, body)
    VALUES (p_request_id, COALESCE(v_uid, v_r.asked_by), left(btrim(p_note), 2000));
  END IF;

  SELECT monthly_gross INTO v_now_pay
    FROM public.hr_staff_salaries WHERE staff_id = v_r.staff_id AND superseded_by IS NULL;

  -- 7 Oct 2026, RULING 1: the annual increment is the set percent of the pay
  -- now (whole rupees), or the whole raise if that is smaller; the rest is
  -- held. A pay cut, or no change, has nothing held.
  v_base := COALESCE(v_now_pay, v_r.current_monthly_gross);
  v_inc  := CASE WHEN v_final > v_base
                 THEN LEAST(round(v_base * (v_rules->>'annual_increment_percent')::numeric / 100), v_final - v_base)
                 ELSE v_final - v_base END;
  v_held := v_final - v_base - v_inc;
  -- Round 7: a held part under a rupee (paise in the ask) is not held: it is
  -- paid with the increment, and there is no held part to block a later raise.
  IF v_held > 0 AND v_held < 1 THEN
    v_inc  := v_inc + v_held;
    v_held := 0;
  END IF;
  PERFORM public.hr_salary_revision_target_plan_write(p_request_id, v_base, v_inc, v_held, v_rules);

  -- A fresh yes after a missed start finds the earlier outcome row (request_id
  -- is UNIQUE), so it is overwritten rather than deleted and re-inserted.
  -- 7 Oct 2026: the new pay is what starts on the start date (pay + increment).
  INSERT INTO public.hr_salary_revision_outcomes
    (request_id, staff_id, previous_monthly_gross, new_monthly_gross, starts_on)
  VALUES (p_request_id, v_r.staff_id, v_base, v_base + v_inc, v_start)
  ON CONFLICT (request_id) DO UPDATE
     SET staff_id = EXCLUDED.staff_id,
         previous_monthly_gross = EXCLUDED.previous_monthly_gross,
         new_monthly_gross = EXCLUDED.new_monthly_gross,
         starts_on = EXCLUDED.starts_on;

  SELECT profile_id, TRIM(BOTH FROM COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_subject, v_name
    FROM public.staff WHERE id = v_r.staff_id;
  v_when := to_char(v_start, 'FMDD FMMonth YYYY');

  -- RULING 5: the person is told now, and only now.
  PERFORM public.hr_salary_revision_notify(
    ARRAY[v_subject],
    'Your monthly pay is changing',
    'From ' || v_when || ' your monthly pay will be ' || public.hr_salary_revision_rupees(v_base + v_inc)
      || ' (it is ' || public.hr_salary_revision_rupees(v_base) || ' now).'
      || CASE WHEN v_final < v_base THEN ' This is a pay cut.' ELSE '' END
      || CASE WHEN v_held > 0
              THEN ' Another ' || public.hr_salary_revision_rupees(v_held)
                   || ' a month is held back for now; My Pay Changes shows when it can be paid.'
              ELSE '' END,
    '/hr/my-pay-changes',
    'hr.payroll.salary_revision.outcome:' || p_request_id,
    jsonb_build_object('request_id', p_request_id));

  -- RULING 12: the asker sees his figure.
  PERFORM public.hr_salary_revision_notify(
    ARRAY[v_r.asked_by],
    'Salary revision approved',
    'The Director approved the salary revision you asked for ' || v_name || ': '
      || public.hr_salary_revision_rupees(v_final) || ' a month from ' || v_when
      || CASE WHEN v_final <> v_r.asked_monthly_gross
              THEN ' (you asked for ' || public.hr_salary_revision_rupees(v_r.asked_monthly_gross) || ').'
              ELSE '.' END
      || CASE WHEN v_held > 0
              THEN ' ' || public.hr_salary_revision_rupees(v_held) || ' of it is held until the raise rules allow it.'
              ELSE '' END,
    '/hr/salary-revisions/' || p_request_id,
    'hr.payroll.salary_revision.approved:' || p_request_id,
    jsonb_build_object('request_id', p_request_id));

  RETURN v_start;
END;
$function$;

-- ----------------------------------------------------------------------------
-- e2. Writing the pay on its day: pay + increment. #4190's body
--     (20271007150103 section f6) plus the lines marked 7 Oct 2026.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_salary_revision_apply_due_on(p_today date)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_r    record;
  v_cur  record;
  v_new  uuid;
  v_done integer := 0;
  v_name text;
  v_when text;
  -- 7 Oct 2026: the held part, kept back from this write.
  v_held numeric;
BEGIN
  FOR v_r IN
    SELECT * FROM public.hr_salary_revision_requests
     WHERE status = 'approved' AND starts_on <= p_today
     ORDER BY starts_on, id
     FOR UPDATE SKIP LOCKED
  LOOP
    -- 30 Sep: every request on its own. One that cannot be written is noted
    -- and the next one is still tried; nothing rolls the whole run back.
    BEGIN
      -- 1 Oct 2026, RULE 8: linked to no account, then or now: never written,
      -- never changed, listed for the Director, stamped or not.
      IF public.hr_salary_revision_is_unlinked(v_r.staff_id, v_r.subject_profile_id) THEN
        CONTINUE;
      END IF;

      -- 1 Oct 2026, RULE 6: an UNSTAMPED yes (given before those rules) that
      -- breaks rule 1 or 2 is never written and never changed: it stays as it
      -- is and is listed for the Director (fn_hr_salary_revision_held_approvals).
      -- A stamped yes passed the rules when it was given and is always written.
      IF NOT v_r.decided_under_rules
         AND public.hr_salary_revision_decision_breach(v_r.staff_id, v_r.subject_profile_id, v_r.director_decided_by, v_r.subject_was_list_member) IS NOT NULL THEN
        CONTINUE;
      END IF;

      SELECT TRIM(BOTH FROM COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')) INTO v_name
        FROM public.staff s WHERE s.id = v_r.staff_id;
      v_when := to_char(v_r.starts_on, 'FMDD FMMonth YYYY');

      -- 30 Sep: the person left before the start date: cancelled, both told.
      IF NOT EXISTS (SELECT 1 FROM public.v_hr_staff s WHERE s.id = v_r.staff_id AND COALESCE(s.is_active, false)) THEN
        UPDATE public.hr_salary_revision_requests
           SET status = 'cancelled', cancelled_at = now(), apply_note = NULL,
               cancel_note = 'Cancelled: ' || COALESCE(NULLIF(v_name, ''), 'the person')
                             || ' left before the new pay was due to start on ' || v_when || '.'
         WHERE id = v_r.id;
        -- 7 Oct 2026: its held part lapses with it (listed), so it blocks nothing.
        UPDATE public.hr_salary_revision_target_plans
           SET state = 'lapsed', state_reason = 'left_before_start', updated_at = now()
         WHERE request_id = v_r.id AND state <> 'none';
        PERFORM public.hr_salary_revision_notify(
          public.hr_salary_revision_director_ids() || ARRAY[v_r.asked_by],
          'A salary revision was cancelled',
          COALESCE(NULLIF(v_name, ''), 'The person') || ' left before the approved pay change was due to start on '
            || v_when || ', so it was cancelled. Nothing was written.',
          '/hr/salary-revisions/' || v_r.id,
          'hr.payroll.salary_revision.cancelled:' || v_r.id,
          jsonb_build_object('request_id', v_r.id));
        CONTINUE;
      END IF;

      -- 30 Sep: the start date has passed without the pay being written (the
      -- job did not run that day). It is never written late (#4122 refuses a
      -- past start; the missed month is not paid back): back to the Director
      -- for a fresh yes, which sets a fresh start date. Both are told.
      IF v_r.starts_on < p_today THEN
        -- The person was told of a change that is not happening on that date;
        -- the fresh yes tells them again, with the new date, and overwrites
        -- their outcome row (approve_one upserts on request_id).
        UPDATE public.hr_salary_revision_requests
           SET status = 'waiting_director', starts_on = NULL, final_monthly_gross = NULL,
               director_decided_by = NULL, director_decided_at = NULL, decided_under_rules = false,
               apply_note = 'The start date ' || v_when || ' passed without the pay being written, so it needs a fresh yes. '
                            || 'The Director had approved ' || public.hr_salary_revision_rupees(v_r.final_monthly_gross) || '.'
         WHERE id = v_r.id;
        -- 7 Oct 2026: its held part lapses (listed); a fresh yes writes a new one.
        UPDATE public.hr_salary_revision_target_plans
           SET state = 'lapsed', state_reason = 'start_missed', updated_at = now()
         WHERE request_id = v_r.id AND state <> 'none';
        PERFORM public.hr_salary_revision_notify(
          public.hr_salary_revision_director_ids() || ARRAY[v_r.asked_by],
          'A salary revision missed its start date',
          'The pay change for ' || COALESCE(NULLIF(v_name, ''), 'a team member') || ' was due to start on '
            || v_when || ' but was not written that day. It is back with the Director for a fresh yes; '
            || 'it will start on the 1st of the month after that. The missed month is not paid back.',
          '/hr/salary-revisions/' || v_r.id,
          'hr.payroll.salary_revision.missed:' || v_r.id || ':' || v_when,
          jsonb_build_object('request_id', v_r.id));
        CONTINUE;
      END IF;

      SELECT * INTO v_cur FROM public.hr_staff_salaries
       WHERE staff_id = v_r.staff_id AND superseded_by IS NULL;

      IF NOT FOUND THEN
        UPDATE public.hr_salary_revision_requests
           SET apply_note = 'No salary is recorded for this person any more, so the new pay could not be written. HR must record it on Employee Salaries.'
         WHERE id = v_r.id;
        CONTINUE;
      END IF;
      IF v_cur.effective_from > v_r.starts_on THEN
        UPDATE public.hr_salary_revision_requests
           SET apply_note = 'HR recorded a salary starting ' || to_char(v_cur.effective_from, 'FMDD FMMonth YYYY')
                            || ', after this revision''s start. HR must decide which one stands.'
         WHERE id = v_r.id;
        CONTINUE;
      END IF;

      -- 7 Oct 2026, RULING 1: the held part is not written on the start date;
      -- only the increment is. A yes given before 7 Oct has no plan: whole figure.
      v_held := COALESCE((SELECT p.held_amount FROM public.hr_salary_revision_target_plans p
                           WHERE p.request_id = v_r.id), 0);
      -- 7 Oct 2026, default p: the pay changed since the yes (another raise,
      -- an HR edit): nothing is written; noted and listed for the Director.
      IF EXISTS (SELECT 1 FROM public.hr_salary_revision_target_plans p
                  WHERE p.request_id = v_r.id AND p.base_monthly_gross IS DISTINCT FROM v_cur.monthly_gross) THEN
        UPDATE public.hr_salary_revision_requests
           SET apply_note = 'The pay in force (' || public.hr_salary_revision_rupees(v_cur.monthly_gross)
                            || ') is no longer the pay this raise was split from. Nothing was written; the Director must decide it again.'
         WHERE id = v_r.id;
        CONTINUE;
      END IF;

      -- 1 Oct 2026, RULE 7: tells the Employee Salaries trigger which approved
      -- request this write is (this transaction only; undone with it).
      PERFORM set_config('app.hr_salary_revision_apply', v_r.id::text, true);
      v_new := public.fn_hr_set_staff_salary(
        p_staff_id               => v_r.staff_id,
        p_hr_organization_id     => v_cur.hr_organization_id,
        p_monthly_gross          => v_r.final_monthly_gross - v_held,
        p_effective_from         => v_r.starts_on,
        p_salary_structure       => v_cur.salary_structure,
        p_overtime_level         => v_cur.overtime_level,
        p_overtime_amount        => v_cur.overtime_amount,
        p_eligible_for_pf        => v_cur.eligible_for_pf,
        p_exempt_edli            => v_cur.exempt_edli,
        p_eligible_for_insurance => v_cur.eligible_for_insurance,
        p_eligible_for_gratuity  => v_cur.eligible_for_gratuity,
        p_eligible_for_etf       => v_cur.eligible_for_etf,
        p_notes                  => 'Salary revision approved by the Director on '
                                    || to_char((v_r.director_decided_at AT TIME ZONE 'Asia/Kolkata')::date, 'FMDD FMMonth YYYY')
                                    || ' (request ' || v_r.id || ').',
        p_epf_amount             => v_cur.epf_amount,
        p_eligible_for_esi       => v_cur.eligible_for_esi,
        p_esi_amount             => v_cur.esi_amount,
        p_allowance_amount       => v_cur.allowance_amount,
        p_allowance_label        => v_cur.allowance_label);
      PERFORM set_config('app.hr_salary_revision_apply', '', true);

      UPDATE public.hr_salary_revision_requests
         SET status = 'applied', applied_salary_id = v_new, applied_at = now(), apply_note = NULL
       WHERE id = v_r.id;
      v_done := v_done + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Kept on the request, in the words the database gave, and the run goes on.
      UPDATE public.hr_salary_revision_requests
         SET apply_note = 'The new pay could not be written: ' || SQLERRM
       WHERE id = v_r.id;
    END;
  END LOOP;
  RETURN v_done;
END;
$function$;

-- ----------------------------------------------------------------------------
-- e3. RULE 7 of 1 Oct, plus the held part. #4190's body (20271007150103
--     section i) plus the lines marked 7 Oct 2026: the apply marker expects
--     pay + increment, and a second marker for the monthly run.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_guard_hr_staff_salaries_no_own_or_list_pay()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid   uuid := auth.uid();
  v_req   uuid;
  v_staff uuid;
  -- 7 Oct 2026: the monthly run's marker.
  v_plan  uuid;
BEGIN
  -- 7 Oct 2026: the monthly run writing the held part (release, pause, resume).
  -- Checked for EVERY caller, service_role and the SQL console included: under
  -- this marker only the one write the plan calls for passes; anything else is
  -- refused, never waved through.
  v_plan := NULLIF(current_setting('app.hr_salary_revision_target_pay', true), '')::uuid;
  IF v_plan IS NOT NULL THEN
    IF TG_OP <> 'DELETE' AND EXISTS (
         SELECT 1
           FROM public.hr_salary_revision_target_plans p
           JOIN public.hr_salary_revision_requests r ON r.id = p.request_id
          WHERE p.request_id = v_plan
            AND p.staff_id = NEW.staff_id AND r.staff_id = NEW.staff_id
            AND r.status = 'applied' AND r.decided_under_rules
            AND p.held_amount > 0
            AND ((p.pending_action = 'release' AND p.state = 'waiting')
                 OR (p.pending_action = 'pause' AND p.state = 'released')
                 OR (p.pending_action = 'resume' AND p.state = 'paused'))
            -- RULING 6 / default v: never for someone on the Director list, then or now (not even a pause).
            AND NOT public.hr_salary_revision_is_list_member(r.staff_id, r.subject_profile_id, r.subject_was_list_member)
            -- #4190 rule 8: never a record linked to no account.
            AND NOT public.hr_salary_revision_is_unlinked(r.staff_id, r.subject_profile_id)
            AND (CASE WHEN TG_OP = 'INSERT' THEN
                        NEW.effective_from = p.pending_effective_from
                        -- the pay it replaces, plus or minus exactly the held part
                        AND NEW.monthly_gross = (SELECT x.monthly_gross + CASE WHEN p.pending_action = 'pause' THEN -p.held_amount ELSE p.held_amount END
                                                   FROM public.hr_staff_salaries x
                                                  WHERE x.staff_id = NEW.staff_id AND x.superseded_by = NEW.id)
                      ELSE OLD.staff_id = NEW.staff_id
                       AND OLD.superseded_by IS NULL AND NEW.superseded_by IS NOT NULL
                       AND to_jsonb(NEW) - ARRAY['superseded_by', 'updated_at', 'updated_by', 'annual_gross']
                         = to_jsonb(OLD) - ARRAY['superseded_by', 'updated_at', 'updated_by', 'annual_gross'] END)) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'The held part of a raise can be written only by the monthly targets run, for that person, at exactly the pay in force plus or minus the held part.'
      USING ERRCODE = '42501';
  END IF;

  -- Only a signed-in person is checked: service_role and the SQL console pass.
  IF v_uid IS NULL OR auth.role() IS NOT DISTINCT FROM 'service_role' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- Deleting a staff record takes its pay rows with it (ON DELETE CASCADE):
  -- by then the record is gone, and that delete is not a pay change.
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.staff s WHERE s.id = OLD.staff_id) THEN
    RETURN OLD;
  END IF;

  -- The approvals job (apply_due_on) writing a yes that passed the rules,
  -- whoever opened the page that ran it: the new row at the approved figure,
  -- and, on the row it replaces, ONLY what fn_hr_set_staff_salary sets there
  -- (the "replaced by" pointer and its updated_at / updated_by).
  -- 7 Oct 2026: "the approved figure" is the figure less the held part.
  v_req := NULLIF(current_setting('app.hr_salary_revision_apply', true), '')::uuid;
  IF v_req IS NOT NULL AND TG_OP <> 'DELETE' AND EXISTS (
       SELECT 1 FROM public.hr_salary_revision_requests r
        WHERE r.id = v_req
          AND r.status = 'approved'
          AND r.staff_id = NEW.staff_id
          AND (CASE WHEN TG_OP = 'INSERT' THEN NEW.monthly_gross = r.final_monthly_gross
                                                 - COALESCE((SELECT p.held_amount FROM public.hr_salary_revision_target_plans p
                                                              WHERE p.request_id = r.id), 0)
                    ELSE OLD.superseded_by IS NULL AND NEW.superseded_by IS NOT NULL
                     AND to_jsonb(NEW) - ARRAY['superseded_by', 'updated_at', 'updated_by', 'annual_gross']
                       = to_jsonb(OLD) - ARRAY['superseded_by', 'updated_at', 'updated_by', 'annual_gross'] END)
          AND (r.decided_under_rules
               OR public.hr_salary_revision_decision_breach(r.staff_id, r.subject_profile_id, r.director_decided_by, r.subject_was_list_member) IS NULL)) THEN
    RETURN NEW;
  END IF;

  FOR v_staff IN
    SELECT DISTINCT x FROM unnest(CASE TG_OP WHEN 'INSERT' THEN ARRAY[NEW.staff_id]
                                             WHEN 'UPDATE' THEN ARRAY[NEW.staff_id, OLD.staff_id]
                                             ELSE ARRAY[OLD.staff_id] END) AS x
  LOOP
    -- Own: linked to the caller, or carrying the caller's sign-in email
    -- (hr_salary_revision_request_identity), so unlinking or relinking one's
    -- own record does not make it editable.
    IF public.hr_salary_revision_is_own(v_staff, NULL) THEN
      RAISE EXCEPTION 'You cannot change your own pay.'
        USING ERRCODE = '42501';
    END IF;
    -- On the Director list: linked to a list member, or carrying a list
    -- member's sign-in email. A new joiner with no account and nobody's email
    -- stays editable by HR.
    IF public.hr_salary_revision_is_list_member(v_staff, NULL)
       AND v_uid IS DISTINCT FROM public.hr_salary_revision_list_member_raise_decider_id() THEN
      RAISE EXCEPTION 'This is the pay of someone on the Director list. Only the Director himself can change it.'
        USING ERRCODE = '42501';
    END IF;
    -- A record linked to no account: who it is cannot be checked for sure (an
    -- email can be changed), so nobody signed in changes its pay, except the
    -- FIRST pay of a new joiner, whose record has no pay row yet.
    IF NOT EXISTS (SELECT 1 FROM public.staff s WHERE s.id = v_staff AND s.profile_id IS NOT NULL)
       AND NOT (TG_OP = 'INSERT'
                AND NOT EXISTS (SELECT 1 FROM public.hr_staff_salaries x WHERE x.staff_id = v_staff)) THEN
      RAISE EXCEPTION 'This record is not linked to an account. Link it first, then change the pay. Only a new joiner''s first pay can be set before that.'
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_guard_hr_staff_salaries_no_own_or_list_pay() FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.fn_guard_hr_staff_salaries_no_own_or_list_pay() IS
  'BEFORE INSERT/UPDATE/DELETE trigger on hr_staff_salaries (Director default, 1 Oct 2026). For a signed-in '
  'caller: never their own pay (the same test as hr_salary_revision_is_own, plus the record''s emails matching '
  'the caller''s sign-in email), never the pay of a record linked to no account except a new joiner''s first pay '
  'row, and the pay of someone on the '
  'Director list only by the person named in hr.salary_revision.list_member_raise_decider_profile_id (no row = '
  'no one). service_role and direct DB sessions pass; so does apply_due_on writing a yes that passed the rules '
  '(at the figure less its held part, 7 Oct 2026). Under app.hr_salary_revision_target_pay (the monthly targets '
  'run, 7 Oct 2026) only the one write the plan calls for passes, for every caller. '
  'Migrations 20271007150103, 20271007180207.';

-- The trigger itself is #4190's (trg_hr_staff_salaries_no_own_or_list_pay),
-- unchanged: it calls the function re-created above.

-- ----------------------------------------------------------------------------
-- f. The monthly run
-- ----------------------------------------------------------------------------
-- One pay write for a plan: release or resume (+ held), pause (- held).
CREATE OR REPLACE FUNCTION public.hr_salary_revision_target_pay(p_request_id uuid, p_action text, p_today date)
RETURNS date
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_p   record;
  v_cur record;
  v_eff date;
  v_new numeric;
BEGIN
  IF p_action NOT IN ('release', 'pause', 'resume') THEN
    RAISE EXCEPTION 'Unknown step %.', p_action USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_p FROM public.hr_salary_revision_target_plans WHERE request_id = p_request_id FOR UPDATE;

  -- Default e (7 Oct 2026): never in the past. Run on the 1st: that day;
  -- otherwise the next 1st; a month payroll is already working on is skipped.
  v_eff := public.hr_salary_revision_start_date(v_p.staff_id, p_today - 1);

  SELECT * INTO v_cur FROM public.hr_staff_salaries WHERE staff_id = v_p.staff_id AND superseded_by IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No salary is recorded for this person, so the held part could not be written. HR must record it on Employee Salaries.';
  END IF;
  IF v_cur.effective_from > v_eff THEN
    RAISE EXCEPTION 'HR recorded a salary starting %, after %. HR must decide which one stands.',
      to_char(v_cur.effective_from, 'FMDD FMMonth YYYY'), to_char(v_eff, 'FMDD FMMonth YYYY');
  END IF;
  v_new := v_cur.monthly_gross + CASE WHEN p_action = 'pause' THEN -v_p.held_amount ELSE v_p.held_amount END;
  IF v_new <= 0 THEN
    RAISE EXCEPTION 'Pausing the held part would leave no pay; nothing was written.';
  END IF;

  UPDATE public.hr_salary_revision_target_plans
     SET pending_action = p_action, pending_effective_from = v_eff
   WHERE request_id = p_request_id;

  PERFORM set_config('app.hr_salary_revision_target_pay', p_request_id::text, true);
  PERFORM public.fn_hr_set_staff_salary(
    p_staff_id               => v_p.staff_id,
    p_hr_organization_id     => v_cur.hr_organization_id,
    p_monthly_gross          => v_new,
    p_effective_from         => v_eff,
    p_salary_structure       => v_cur.salary_structure,
    p_overtime_level         => v_cur.overtime_level,
    p_overtime_amount        => v_cur.overtime_amount,
    p_eligible_for_pf        => v_cur.eligible_for_pf,
    p_exempt_edli            => v_cur.exempt_edli,
    p_eligible_for_insurance => v_cur.eligible_for_insurance,
    p_eligible_for_gratuity  => v_cur.eligible_for_gratuity,
    p_eligible_for_etf       => v_cur.eligible_for_etf,
    p_notes                  => CASE p_action
                                  WHEN 'release' THEN 'Held part of a salary revision paid: targets met'
                                  WHEN 'resume'  THEN 'Held part of a salary revision paid again: back on target'
                                  ELSE 'Held part of a salary revision paused: targets missed '
                                       || (v_p.rules->>'pause_after_missed_months') || ' months in a row'
                                END || ' (request ' || p_request_id || ').',
    p_epf_amount             => v_cur.epf_amount,
    p_eligible_for_esi       => v_cur.eligible_for_esi,
    p_esi_amount             => v_cur.esi_amount,
    p_allowance_amount       => v_cur.allowance_amount,
    p_allowance_label        => v_cur.allowance_label);
  PERFORM set_config('app.hr_salary_revision_target_pay', '', true);

  UPDATE public.hr_salary_revision_target_plans
     SET state = CASE WHEN p_action = 'pause' THEN 'paused' ELSE 'released' END,
         held_paid_from = CASE WHEN p_action = 'pause' THEN held_paid_from ELSE v_eff END,
         paused_from = CASE WHEN p_action = 'pause' THEN v_eff ELSE NULL END,
         pending_action = NULL, pending_effective_from = NULL, missed_in_row = 0, updated_at = now()
   WHERE request_id = p_request_id;
  RETURN v_eff;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_target_pay(uuid, text, date) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_salary_revision_target_pay(uuid, text, date) IS
  'Internal (the monthly run only). Writes the pay in force plus (release, resume) or minus (pause) the held part '
  'through fn_hr_set_staff_salary under app.hr_salary_revision_target_pay, never on a past date. Migration 20271007180207.';

-- One person's raise for one day (default bb): measured, counted and acted
-- on in its own call, so the cron route can give every person their own
-- transaction (a time-out on one undoes only that one) and stop when its
-- time budget runs out (the rest are first in line the next night).
CREATE OR REPLACE FUNCTION public.hr_salary_revision_targets_run_one(
  p_request_id uuid, p_today date, p_max_months integer DEFAULT 12)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_p        record;
  v_r        record;
  v_row      record;
  v_cur_m    date := date_trunc('month', p_today)::date;
  v_last     date;
  v_from     date;
  v_m        date;
  v_res      jsonb;
  v_t1_den   integer;
  v_all_met  boolean;
  v_status   text;
  v_action   text;
  v_eff      date;
  v_writes   integer := 0;
  v_flagged  boolean;
  v_measured integer := 0;
  v_rules    jsonb;
  v_state    text;
  v_role     text;
  v_reason   text;
BEGIN
  -- Default hh: a second call for the same raise on the same day (two runs
  -- overlapping) finds it locked or already run, and skips it.
  SELECT * INTO v_p FROM public.hr_salary_revision_target_plans
   WHERE request_id = p_request_id AND state IN ('awaiting_measurement', 'waiting', 'released', 'paused')
     AND last_run_on IS DISTINCT FROM p_today
   FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Default ll: measurement switched OFF. The month is recorded as not
  -- measured and NOTHING else happens: no release, pause, resume, expiry,
  -- lapse, back-to-Director or classification.
  IF NOT public.hr_salary_revision_target_measurement_on() THEN
    -- Any month left "so far" from a time it was ON is closed unmeasured too.
    UPDATE public.hr_salary_revision_target_months
       SET status = 'not_measured', results = '[]'::jsonb, measured_at = now(), acted = true, action = 'none'
     WHERE request_id = p_request_id AND status = 'in_progress';
    INSERT INTO public.hr_salary_revision_target_months (request_id, month, status, results, measured_at, acted, action)
    VALUES (p_request_id, v_cur_m, 'not_measured', '[]'::jsonb, now(), true, 'none')
    ON CONFLICT (request_id, month) DO NOTHING;
    UPDATE public.hr_salary_revision_target_plans SET last_run_on = p_today, failed_nights = 0
     WHERE request_id = p_request_id;
    RETURN 0;
  END IF;

  -- Default ll: measurement just switched ON for a held part waiting for it:
  -- classified now, with the rules as they are now, and its window starts on
  -- the 1st of next month. Measured from the next run on.
  IF v_p.state = 'awaiting_measurement' THEN
    v_rules := public.hr_salary_revision_target_rules();
    IF v_rules IS NULL THEN
      UPDATE public.hr_salary_revision_target_plans
         SET run_note = 'Measurement is on but the raise rules setting is missing or malformed: not classified.',
             last_run_on = p_today, failed_nights = 0, updated_at = now()
       WHERE request_id = p_request_id;
      RETURN 0;
    END IF;
    SELECT c.state, c.role, c.reason INTO v_state, v_role, v_reason
      FROM public.hr_salary_revision_target_classify(p_request_id, v_rules, p_today) c;
    UPDATE public.hr_salary_revision_target_plans
       SET state = v_state, target_role = v_role, state_reason = v_reason,
           rules = rules || jsonb_build_object(
                    'window_months', v_rules->'window_months',
                    'pause_after_missed_months', v_rules->'pause_after_missed_months',
                    'role', v_role,
                    'targets', CASE WHEN v_role IS NULL THEN NULL ELSE v_rules->'role_targets'->v_role END),
           window_start = (date_trunc('month', p_today) + interval '1 month')::date,
           window_months = (v_rules->>'window_months')::int,
           run_note = NULL, last_run_on = p_today, failed_nights = 0, updated_at = now()
     WHERE request_id = p_request_id;
    RETURN 0;
  END IF;
  -- An error on this person is noted and the night goes on.
  BEGIN
    <<one>>
    BEGIN
      SELECT * INTO v_r FROM public.hr_salary_revision_requests WHERE id = v_p.request_id;
      -- Nothing before the increment is written; nothing for a yes since undone.
      IF v_r.status IS DISTINCT FROM 'applied' THEN
        EXIT one;
      END IF;

      -- #4190 rule 8 (default v): linked to no account: skipped and listed.
      IF public.hr_salary_revision_is_unlinked(v_r.staff_id, v_r.subject_profile_id) THEN
        UPDATE public.hr_salary_revision_target_plans
           SET run_note = 'Linked to no account, so nobody can tell whose raise it is: not measured, nothing written. Listed for the Director.',
               updated_at = now()
         WHERE request_id = v_p.request_id;
        EXIT one;
      END IF;
      -- Default v: on the Director list now, after the held part was paid:
      -- the run never changes such pay; listed for the Director.
      IF v_p.state IN ('released', 'paused')
         AND public.hr_salary_revision_is_list_member(v_r.staff_id, v_r.subject_profile_id, v_r.subject_was_list_member) THEN
        UPDATE public.hr_salary_revision_target_plans
           SET run_note = 'Now on the Director list: the monthly run no longer pauses or resumes this held part. Listed for the Director.',
               updated_at = now()
         WHERE request_id = v_p.request_id;
        EXIT one;
      END IF;

      IF v_p.state = 'waiting' THEN
        -- Default b: left, or moved to another college, while waiting: lapses, listed.
        IF NOT EXISTS (SELECT 1 FROM public.v_hr_staff s
                        WHERE s.id = v_p.staff_id AND COALESCE(s.is_active, false)
                          AND s.institution_id = v_p.institution_id) THEN
          UPDATE public.hr_salary_revision_target_plans
             SET state = 'lapsed',
                 state_reason = CASE WHEN EXISTS (SELECT 1 FROM public.v_hr_staff s
                                                   WHERE s.id = v_p.staff_id AND COALESCE(s.is_active, false))
                                     THEN 'moved_college' ELSE 'left' END,
                 run_note = NULL, updated_at = now()
           WHERE request_id = v_p.request_id;
          EXIT one;
        END IF;
        -- RULING 6: someone on the Director list (then or now) is never released by the run.
        IF public.hr_salary_revision_is_list_member(v_r.staff_id, v_r.subject_profile_id, v_r.subject_was_list_member) THEN
          UPDATE public.hr_salary_revision_target_plans
             SET state = 'held_listed', state_reason = 'director_list', run_note = NULL, updated_at = now()
           WHERE request_id = v_p.request_id;
          EXIT one;
        END IF;
      END IF;

      -- RULING 3: while waiting, only the months of the window count.
      v_last := CASE WHEN v_p.state = 'waiting'
                     THEN (v_p.window_start + make_interval(months => v_p.window_months - 1))::date
                     ELSE v_cur_m END;

      -- Default aa: once the held part is paid, only the months the pause
      -- rule can still use are measured (the last pause_after_missed_months
      -- finished months and this one). An older month left "so far" (the run
      -- missed it) is closed as not counted, unmeasured.
      v_from := CASE WHEN v_p.state IN ('released', 'paused')
                     THEN GREATEST(v_p.window_start,
                                   (v_cur_m - make_interval(months => (v_p.rules->>'pause_after_missed_months')::int))::date)
                     ELSE v_p.window_start END;
      UPDATE public.hr_salary_revision_target_months
         SET status = 'not_counted', results = '[]'::jsonb, measured_at = now()
       WHERE request_id = v_p.request_id AND month < v_from AND status = 'in_progress';

      -- Measure every month not yet counted (the current one as "so far"),
      -- at most p_max_months in one call; the rest waits for the next run.
      FOR v_m IN
        SELECT g::date FROM generate_series(v_from, LEAST(v_cur_m, v_last), interval '1 month') g
      LOOP
        SELECT * INTO v_row FROM public.hr_salary_revision_target_months
         WHERE request_id = v_p.request_id AND month = v_m;
        IF FOUND AND v_row.status NOT IN ('in_progress', 'flagged') THEN
          CONTINUE;
        END IF;
        EXIT WHEN v_measured >= p_max_months;
        v_measured := v_measured + 1;
        v_flagged := FOUND AND v_row.status = 'flagged';
        SELECT jsonb_agg(jsonb_build_object('target', m.target, 'numerator', m.numerator,
                                            'denominator', m.denominator, 'met', m.met) ORDER BY m.target),
               max(m.denominator) FILTER (WHERE m.target = 't1'),
               bool_and(m.met)
          INTO v_res, v_t1_den, v_all_met
          FROM public.hr_salary_revision_target_measure(v_p.staff_id, v_m, v_p.rules->'targets') m;
        -- RULING 5: a flagged month stays flagged until the Director decides it.
        v_status := CASE WHEN v_flagged THEN 'flagged'
                         WHEN v_m >= v_cur_m THEN 'in_progress'
                         WHEN COALESCE(v_t1_den, 0) = 0 THEN 'not_counted'  -- default d
                         WHEN v_all_met THEN 'met'
                         ELSE 'missed' END;
        INSERT INTO public.hr_salary_revision_target_months (request_id, month, status, results, measured_at)
        VALUES (v_p.request_id, v_m, v_status, COALESCE(v_res, '[]'::jsonb), now())
        ON CONFLICT (request_id, month) DO UPDATE
           SET status = EXCLUDED.status, results = EXCLUDED.results, measured_at = EXCLUDED.measured_at;
      END LOOP;

      -- Act on each counted month not yet acted on, oldest first.
      FOR v_row IN
        SELECT * FROM public.hr_salary_revision_target_months
         WHERE request_id = v_p.request_id AND NOT acted
           AND status IN ('met', 'missed', 'not_counted', 'decided_met', 'decided_missed')
         ORDER BY month
      LOOP
        SELECT * INTO v_p FROM public.hr_salary_revision_target_plans WHERE request_id = v_row.request_id;
        v_action := 'none'; v_eff := NULL;
        IF v_p.state = 'waiting' AND v_row.status IN ('met', 'decided_met') THEN
          -- RULING 3: the first month with every target met releases the held part.
          v_eff := public.hr_salary_revision_target_pay(v_p.request_id, 'release', p_today);
          v_action := 'released';
        ELSIF v_p.state = 'released' AND v_row.status IN ('missed', 'decided_missed') THEN
          -- RULING 4: the set number of missed months in a row pauses it.
          IF v_p.missed_in_row + 1 >= (v_p.rules->>'pause_after_missed_months')::int THEN
            v_eff := public.hr_salary_revision_target_pay(v_p.request_id, 'pause', p_today);
            v_action := 'paused';
          ELSE
            UPDATE public.hr_salary_revision_target_plans
               SET missed_in_row = missed_in_row + 1, updated_at = now()
             WHERE request_id = v_p.request_id;
          END IF;
        ELSIF v_p.state = 'released' AND v_row.status IN ('met', 'decided_met') THEN
          UPDATE public.hr_salary_revision_target_plans
             SET missed_in_row = 0, updated_at = now()
           WHERE request_id = v_p.request_id;
        ELSIF v_p.state = 'paused' AND v_row.status IN ('met', 'decided_met') THEN
          -- RULING 4: back on target: paid again.
          v_eff := public.hr_salary_revision_target_pay(v_p.request_id, 'resume', p_today);
          v_action := 'resumed';
        END IF;
        IF v_eff IS NOT NULL THEN
          v_writes := v_writes + 1;
        END IF;
        UPDATE public.hr_salary_revision_target_months
           SET acted = true, action = v_action, action_effective_from = v_eff
         WHERE request_id = v_row.request_id AND month = v_row.month;
      END LOOP;

      -- RULING 3: the window is over, every month of it counted and acted on,
      -- and nothing released: back to the Director with the numbers.
      SELECT * INTO v_p FROM public.hr_salary_revision_target_plans WHERE request_id = v_p.request_id;
      IF v_p.state = 'waiting' AND v_cur_m > v_last
         AND (SELECT count(*) FROM public.hr_salary_revision_target_months mo
               WHERE mo.request_id = v_p.request_id AND mo.month <= v_last AND mo.acted) = v_p.window_months THEN
        UPDATE public.hr_salary_revision_target_plans
           SET state = 'back_to_director', state_reason = 'window_over', updated_at = now()
         WHERE request_id = v_p.request_id;
      END IF;

      UPDATE public.hr_salary_revision_target_plans SET run_note = NULL
       WHERE request_id = v_p.request_id AND run_note IS NOT NULL;
    END one;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.hr_salary_revision_target_plans
       SET run_note = 'The monthly targets run could not finish for this raise: ' || SQLERRM, updated_at = now()
     WHERE request_id = p_request_id;
  END;
  UPDATE public.hr_salary_revision_target_plans SET last_run_on = p_today, failed_nights = 0
   WHERE request_id = p_request_id;
  RETURN v_writes;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_targets_run_one(uuid, date, integer) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_salary_revision_targets_run_one(uuid, date, integer) IS
  'Internal. The monthly targets run for ONE raise on one day: measures its months (at most p_max_months per '
  'call; once paid, only the months the pause rule can use), then releases, pauses or resumes the held part, '
  'sends a window that ran out back to the Director, lapses a plan whose person left or moved. Marks the plan as '
  'run that day. Migration 20271007180207.';

-- The raises still to be run on a day, longest-waiting first.
CREATE OR REPLACE FUNCTION public.hr_salary_revision_targets_due(p_today date)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.request_id FROM public.hr_salary_revision_target_plans p
   WHERE p.state IN ('awaiting_measurement', 'waiting', 'released', 'paused')
     AND p.last_run_on IS DISTINCT FROM p_today
   -- Default ff: one that did not finish on 3 nights goes last.
   ORDER BY (p.failed_nights >= 3), p.last_run_on NULLS FIRST, p.request_id
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_targets_due(date) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_salary_revision_targets_due(date) IS
  'Internal. The open held parts not yet run on that day, longest-waiting first. Migration 20271007180207.';

-- Everyone due, in one call (the SQL console and the rehearsal; the cron
-- route runs them one call each).
CREATE OR REPLACE FUNCTION public.hr_salary_revision_targets_run_on(p_today date)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id     uuid;
  v_writes integer := 0;
BEGIN
  FOR v_id IN SELECT * FROM public.hr_salary_revision_targets_due(p_today) LOOP
    v_writes := v_writes + public.hr_salary_revision_targets_run_one(v_id, p_today);
  END LOOP;
  RETURN v_writes;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_targets_run_on(date) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_salary_revision_targets_run_on(date) IS
  'Internal. The monthly targets run for one day: measures each open plan''s months, then releases, pauses or '
  'resumes the held part as the rulings of 7 Oct 2026 say, sends a window that ran out back to the Director and '
  'lapses a plan whose person left or moved college. Returns the number of pay writes. Migration 20271007180207.';

-- The cron route's entry point: service_role (or the SQL console) only.
CREATE OR REPLACE FUNCTION public.fn_hr_salary_revision_targets_run()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- The service role (no user) or a database session with no JWT at all.
  IF auth.uid() IS NOT NULL OR COALESCE(auth.role(), 'service_role') <> 'service_role' THEN
    RAISE EXCEPTION 'Only the scheduled job can run the monthly targets check.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public.hr_salary_revision_targets_run_on(public.hr_salary_revision_ist_today());
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_salary_revision_targets_run() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_hr_salary_revision_targets_run() TO service_role;

COMMENT ON FUNCTION public.fn_hr_salary_revision_targets_run() IS
  'The daily cron (/api/cron/hr-salary-revisions?mode=targets, service role) or the SQL console only; refuses '
  'any signed-in caller (42501). Runs hr_salary_revision_targets_run_on(today in India). Migration 20271007180207.';

-- Default bb: the cron route's two calls. It asks for the raises due today,
-- then runs each in its own call (its own transaction), stopping when its
-- time budget runs out; the rest are first in line the next night.
CREATE OR REPLACE FUNCTION public.fn_hr_salary_revision_targets_due()
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL OR COALESCE(auth.role(), 'service_role') <> 'service_role' THEN
    RAISE EXCEPTION 'Only the scheduled job can run the monthly targets check.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY SELECT * FROM public.hr_salary_revision_targets_due(public.hr_salary_revision_ist_today());
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_salary_revision_targets_due() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_hr_salary_revision_targets_due() TO service_role;

-- Default ff: the cron route records an attempt BEFORE each run, in its own
-- short call, so a run that times out (and is undone) still leaves a trace.
-- One per night; a run that finishes sets it back to 0. After 3 nights in a
-- row without finishing, the raise is listed for the Director.
CREATE OR REPLACE FUNCTION public.hr_salary_revision_targets_attempt(p_request_id uuid, p_today date)
RETURNS integer
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.hr_salary_revision_target_plans
     SET failed_nights = failed_nights + CASE WHEN last_attempt_on IS DISTINCT FROM p_today THEN 1 ELSE 0 END,
         last_attempt_on = p_today
   WHERE request_id = p_request_id AND state IN ('awaiting_measurement', 'waiting', 'released', 'paused')
  RETURNING failed_nights
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_targets_attempt(uuid, date) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_salary_revision_targets_attempt(uuid, date) IS
  'Internal (default ff). Counts one attempt per night on a raise before its run; a finished run resets it. '
  'Migration 20271007180207.';

CREATE OR REPLACE FUNCTION public.fn_hr_salary_revision_targets_attempt(p_request_id uuid)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL OR COALESCE(auth.role(), 'service_role') <> 'service_role' THEN
    RAISE EXCEPTION 'Only the scheduled job can run the monthly targets check.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public.hr_salary_revision_targets_attempt(p_request_id, public.hr_salary_revision_ist_today());
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_salary_revision_targets_attempt(uuid) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_hr_salary_revision_targets_attempt(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_hr_salary_revision_targets_run_one(p_request_id uuid)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL OR COALESCE(auth.role(), 'service_role') <> 'service_role' THEN
    RAISE EXCEPTION 'Only the scheduled job can run the monthly targets check.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public.hr_salary_revision_targets_run_one(p_request_id, public.hr_salary_revision_ist_today());
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_salary_revision_targets_run_one(uuid) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_hr_salary_revision_targets_run_one(uuid) TO service_role;

COMMENT ON FUNCTION public.fn_hr_salary_revision_targets_run_one(uuid) IS
  'The cron route (service role) only: the monthly targets run for one raise, today in India, in its own call. '
  'Pairs with fn_hr_salary_revision_targets_due(). Migration 20271007180207.';

-- ----------------------------------------------------------------------------
-- g. The principal's flag, the Director's decision, the Director's list
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_salary_revision_target_flag(p_request_id uuid, p_month date, p_note text)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid   uuid := auth.uid();
  v_r     record;
  v_p     record;
  v_month date := date_trunc('month', p_month)::date;
  v_row   record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_r FROM public.hr_salary_revision_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such request.' USING ERRCODE = 'P0002';
  END IF;
  -- RULING 5: the principal of that college, never on their own raise.
  IF NOT public.user_has_permission('hr.payroll.salary_revision.college_check')
     OR NOT (v_r.institution_id = ANY (public.fn_my_staff_institution_ids()))
     OR public.hr_salary_revision_is_own(v_r.staff_id, v_r.subject_profile_id) THEN
    RAISE EXCEPTION 'Only the principal of this college can flag a month, and never on their own raise.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_note IS NULL OR btrim(p_note) = '' THEN
    RAISE EXCEPTION 'Write a short note: the Director sees it with the numbers.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_p FROM public.hr_salary_revision_target_plans WHERE request_id = p_request_id;
  IF NOT FOUND OR v_p.state NOT IN ('waiting', 'released', 'paused') THEN
    RAISE EXCEPTION 'This raise has no held part being checked month by month.' USING ERRCODE = '55000';
  END IF;
  IF v_month < v_p.window_start OR v_month > date_trunc('month', public.hr_salary_revision_ist_today())::date
     OR (v_p.state = 'waiting' AND v_month > (v_p.window_start + make_interval(months => v_p.window_months - 1))::date) THEN
    RAISE EXCEPTION 'That month is not one being checked for this raise.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM public.hr_salary_revision_target_months
   WHERE request_id = p_request_id AND month = v_month FOR UPDATE;
  -- Default j: only until the month has been counted.
  IF FOUND AND v_row.status <> 'in_progress' THEN
    RAISE EXCEPTION 'That month has already been %; the Director decides from the listed numbers.',
      CASE WHEN v_row.status = 'flagged' THEN 'flagged' ELSE 'counted' END
      USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.hr_salary_revision_target_months (request_id, month, status)
  VALUES (p_request_id, v_month, 'flagged')
  ON CONFLICT (request_id, month) DO UPDATE SET status = 'flagged';
  INSERT INTO public.hr_salary_revision_target_flags (request_id, month, flagged_by, note)
  VALUES (p_request_id, v_month, v_uid, left(btrim(p_note), 2000));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_salary_revision_target_flag(uuid, date, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_salary_revision_target_flag(uuid, date, text) TO authenticated;

COMMENT ON FUNCTION public.fn_hr_salary_revision_target_flag(uuid, date, text) IS
  'Ruling 5 of 7 Oct 2026: the principal of the request''s college (hr.payroll.salary_revision.college_check, '
  'never on their own raise) flags a month that has not been counted yet, with a note. The month then counts as '
  'neither met nor missed until the Director decides it. Migration 20271007180207.';

CREATE OR REPLACE FUNCTION public.fn_hr_salary_revision_target_decide(
  p_request_id uuid, p_month date, p_counts_as_met boolean, p_note text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid   uuid := auth.uid();
  v_r     record;
  v_row   record;
  v_month date := date_trunc('month', p_month)::date;
BEGIN
  IF v_uid IS NULL OR NOT public.fn_hr_salary_revision_can_approve() THEN
    RAISE EXCEPTION 'Only the Director can decide a flagged month.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_r FROM public.hr_salary_revision_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such request.' USING ERRCODE = 'P0002';
  END IF;
  -- #4190's rules: never on one's own raise; a Director-list member's only by the Director himself.
  PERFORM public.hr_salary_revision_assert_may_decide(v_r.staff_id, v_r.subject_profile_id, v_r.subject_was_list_member);
  IF p_counts_as_met IS NULL THEN
    RAISE EXCEPTION 'Say whether the month counts as met or missed.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM public.hr_salary_revision_target_months
   WHERE request_id = p_request_id AND month = v_month FOR UPDATE;
  IF NOT FOUND OR v_row.status <> 'flagged' THEN
    RAISE EXCEPTION 'That month is not waiting for your decision.' USING ERRCODE = '55000';
  END IF;
  IF v_month >= date_trunc('month', public.hr_salary_revision_ist_today())::date THEN
    RAISE EXCEPTION 'That month is not over yet.' USING ERRCODE = '55000';
  END IF;

  UPDATE public.hr_salary_revision_target_months
     SET status = CASE WHEN p_counts_as_met THEN 'decided_met' ELSE 'decided_missed' END
   WHERE request_id = p_request_id AND month = v_month;
  UPDATE public.hr_salary_revision_target_flags
     SET decided_by = v_uid, decided_at = now(), counts_as_met = p_counts_as_met,
         decision_note = NULLIF(left(btrim(COALESCE(p_note, '')), 2000), '')
   WHERE request_id = p_request_id AND month = v_month;
  RETURN CASE WHEN p_counts_as_met THEN 'decided_met' ELSE 'decided_missed' END;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_salary_revision_target_decide(uuid, date, boolean, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_salary_revision_target_decide(uuid, date, boolean, text) TO authenticated;

COMMENT ON FUNCTION public.fn_hr_salary_revision_target_decide(uuid, date, boolean, text) IS
  'Ruling 5 of 7 Oct 2026: the Director decides a flagged, finished month as met or missed (#4190''s rules on '
  'who may decide apply). The next daily run acts on it. Migration 20271007180207.';

-- Default p: the Director lapses an earlier held part so a new raise can be
-- asked for. Nobody's pay changes (a paid held part stays in the pay).
CREATE OR REPLACE FUNCTION public.fn_hr_salary_revision_target_lapse(p_request_id uuid, p_note text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_r   record;
  v_p   record;
BEGIN
  IF v_uid IS NULL OR NOT public.fn_hr_salary_revision_can_approve() THEN
    RAISE EXCEPTION 'Only the Director can lapse a held part.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_r FROM public.hr_salary_revision_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such request.' USING ERRCODE = 'P0002';
  END IF;
  -- #4190's rules: never on one's own raise; a Director-list member's only by the Director himself.
  PERFORM public.hr_salary_revision_assert_may_decide(v_r.staff_id, v_r.subject_profile_id, v_r.subject_was_list_member);
  IF p_note IS NULL OR btrim(p_note) = '' THEN
    RAISE EXCEPTION 'Write a short note: why the held part lapses.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_p FROM public.hr_salary_revision_target_plans WHERE request_id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_p.state NOT IN ('awaiting_measurement', 'waiting', 'released', 'paused', 'back_to_director', 'held_listed') THEN
    RAISE EXCEPTION 'This raise has no held part to lapse.' USING ERRCODE = '55000';
  END IF;
  UPDATE public.hr_salary_revision_target_plans
     SET state = 'lapsed', state_reason = 'lapsed_by_director', lapse_note = left(btrim(p_note), 2000),
         pending_action = NULL, pending_effective_from = NULL, updated_at = now()
   WHERE request_id = p_request_id;
  RETURN 'lapsed';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_salary_revision_target_lapse(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_salary_revision_target_lapse(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.fn_hr_salary_revision_target_lapse(uuid, text) IS
  'Default p (7 Oct 2026): the Director (Director list, #4190''s who-may-decide rules) lapses a held part with a '
  'note, so a new raise can be asked for. Marked lapsed and listed; nobody''s pay changes. Migration 20271007180207.';

CREATE OR REPLACE FUNCTION public.fn_hr_salary_revision_targets_listed()
RETURNS TABLE(
  request_id uuid, staff_id uuid, person_name text, staff_code text, state text, why text,
  month date, increment_amount numeric, held_amount numeric, results jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.fn_hr_salary_revision_can_approve() THEN
    RAISE EXCEPTION 'Only the Director can see this list.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Round 8: never a row about the caller themselves (a Director-list member
  -- whose own raise is listed would otherwise read the notes on it).
  RETURN QUERY
  SELECT x.* FROM (
  -- Rulings 3 and 6 and default b: held parts waiting on him.
  SELECT p.request_id, p.staff_id,
         TRIM(BOTH FROM COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, ''))::text,
         s.staff_id::text, p.state, COALESCE(p.state_reason, p.state) || COALESCE(': ' || p.lapse_note, ''), NULL::date,
         p.increment_amount, p.held_amount,
         COALESCE((SELECT jsonb_agg(jsonb_build_object('month', mo.month, 'status', mo.status, 'results', mo.results)
                                    ORDER BY mo.month)
                     FROM public.hr_salary_revision_target_months mo WHERE mo.request_id = p.request_id), '[]'::jsonb)
    FROM public.hr_salary_revision_target_plans p
    JOIN public.staff s ON s.id = p.staff_id
   WHERE p.state IN ('back_to_director', 'held_listed', 'lapsed', 'awaiting_measurement')
  UNION ALL
  -- Default v: open held parts the monthly run skipped, with its note.
  SELECT p.request_id, p.staff_id,
         TRIM(BOTH FROM COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, ''))::text,
         s.staff_id::text, p.state, 'run: ' || p.run_note, NULL::date,
         p.increment_amount, p.held_amount, '[]'::jsonb
    FROM public.hr_salary_revision_target_plans p
    JOIN public.staff s ON s.id = p.staff_id
   WHERE p.state IN ('waiting', 'released', 'paused') AND p.run_note IS NOT NULL
  UNION ALL
  -- Default ff: did not finish on 3 nights in a row (timed out).
  SELECT p.request_id, p.staff_id,
         TRIM(BOTH FROM COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, ''))::text,
         s.staff_id::text, p.state,
         'run: The monthly check did not finish on ' || p.failed_nights || ' nights in a row (it timed out); nothing was measured or written.',
         NULL::date, p.increment_amount, p.held_amount, '[]'::jsonb
    FROM public.hr_salary_revision_target_plans p
    JOIN public.staff s ON s.id = p.staff_id
   WHERE p.state IN ('waiting', 'released', 'paused') AND p.failed_nights >= 3
  UNION ALL
  -- Default p: a start date that wrote nothing because the pay changed since the yes.
  SELECT p.request_id, p.staff_id,
         TRIM(BOTH FROM COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, ''))::text,
         s.staff_id::text, r.status, 'start date: ' || r.apply_note, NULL::date,
         p.increment_amount, p.held_amount, '[]'::jsonb
    FROM public.hr_salary_revision_target_plans p
    JOIN public.hr_salary_revision_requests r ON r.id = p.request_id
    JOIN public.staff s ON s.id = p.staff_id
   WHERE r.status = 'approved' AND r.apply_note LIKE 'The pay in force%'
  UNION ALL
  -- Ruling 5: flagged months he has not decided.
  SELECT p.request_id, p.staff_id,
         TRIM(BOTH FROM COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, ''))::text,
         s.staff_id::text, p.state, 'flagged: ' || f.note, mo.month,
         p.increment_amount, p.held_amount, mo.results
    FROM public.hr_salary_revision_target_months mo
    JOIN public.hr_salary_revision_target_flags f ON f.request_id = mo.request_id AND f.month = mo.month
    JOIN public.hr_salary_revision_target_plans p ON p.request_id = mo.request_id
    JOIN public.staff s ON s.id = p.staff_id
   WHERE mo.status = 'flagged'
  ) AS x(request_id, staff_id, person_name, staff_code, state, why, month, increment_amount, held_amount, results)
   WHERE NOT EXISTS (SELECT 1 FROM public.hr_salary_revision_requests rr
                      WHERE rr.id = x.request_id
                        AND public.hr_salary_revision_is_own(rr.staff_id, rr.subject_profile_id))
  ORDER BY 5, 3, 7;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_salary_revision_targets_listed() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_salary_revision_targets_listed() TO authenticated;

COMMENT ON FUNCTION public.fn_hr_salary_revision_targets_listed() IS
  'Rulings of 7 Oct 2026, read-only, Director list only (42501): held parts back with him (window over), held '
  'and listed (Director list, principal, no targets for the role), lapsed (left or moved college), and flagged '
  'months he has not decided, each with the numbers. Migration 20271007180207.';

-- Default cc: the person's own held parts: numbers, state and dates only
-- (never the reason it is parked, the Director's lapse note, the run's notes
-- or a principal's flag).
CREATE OR REPLACE FUNCTION public.fn_hr_salary_revision_my_targets()
RETURNS TABLE(
  request_id uuid, base_monthly_gross numeric, increment_amount numeric, held_amount numeric,
  rules jsonb, window_start date, window_months integer, state text, missed_in_row integer,
  held_paid_from date, paused_from date, months jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- A signed-in person only (not the server key); each gets their own rows.
  IF auth.uid() IS NULL OR auth.role() IS NOT DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT p.request_id, p.base_monthly_gross, p.increment_amount, p.held_amount,
         jsonb_build_object('annual_increment_percent', p.rules->'annual_increment_percent',
                            'window_months', p.rules->'window_months',
                            'pause_after_missed_months', p.rules->'pause_after_missed_months',
                            'role', p.rules->'role', 'targets', p.rules->'targets'),
         p.window_start, p.window_months, p.state, p.missed_in_row, p.held_paid_from, p.paused_from,
         COALESCE((SELECT jsonb_agg(jsonb_build_object('request_id', mo.request_id, 'month', mo.month,
                                                       'status', mo.status, 'results', mo.results, 'acted', mo.acted,
                                                       'action', mo.action, 'action_effective_from', mo.action_effective_from)
                                    ORDER BY mo.month DESC)
                     FROM public.hr_salary_revision_target_months mo WHERE mo.request_id = p.request_id), '[]'::jsonb)
    FROM public.hr_salary_revision_target_plans p
   WHERE p.staff_id = ANY (public.fn_my_staff_ids());
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_salary_revision_my_targets() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_salary_revision_my_targets() TO authenticated;

COMMENT ON FUNCTION public.fn_hr_salary_revision_my_targets() IS
  'Default cc (7 Oct 2026): the signed-in person''s own held parts (from fn_my_staff_ids()): numbers, state and '
  'dates only, never the parked reason, the Director''s lapse note, run notes or flags. Migration 20271007180207.';

-- ----------------------------------------------------------------------------
-- h. Grants, re-stated for every function this file re-creates
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_approve_one(uuid, numeric, text) FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_apply_due_on(date) FROM anon, PUBLIC, authenticated;

-- ----------------------------------------------------------------------------
-- i. Self-check: the re-created bodies must carry the new steps AND #4190's.
-- ----------------------------------------------------------------------------
DO $selfcheck$
DECLARE
  v_one   text := pg_get_functiondef('public.hr_salary_revision_approve_one(uuid, numeric, text)'::regprocedure);
  v_apply text := pg_get_functiondef('public.hr_salary_revision_apply_due_on(date)'::regprocedure);
  v_guard text := pg_get_functiondef('public.fn_guard_hr_staff_salaries_no_own_or_list_pay()'::regprocedure);
  v_ask   text := pg_get_functiondef('public.fn_hr_salary_revision_propose(uuid, numeric, text)'::regprocedure);
BEGIN
  IF position('hr_salary_revision_list_member_raise_decider_id()' IN v_ask) = 0
     OR position('Finish or lapse the earlier held raise first.' IN v_ask) = 0 THEN
    RAISE EXCEPTION 'SELF-CHECK: fn_hr_salary_revision_propose lacks #4190''s check or the one-held-raise rule. The file stops here.';
  END IF;
  IF position('hr_salary_revision_assert_may_decide(v_r.staff_id, v_r.subject_profile_id, v_r.subject_was_list_member)' IN v_one) = 0
     OR position('hr_salary_revision_target_plan_write(' IN v_one) = 0
     OR position('hr_salary_revision_target_rules()' IN v_one) = 0 THEN
    RAISE EXCEPTION 'SELF-CHECK: hr_salary_revision_approve_one lacks #4190''s check or the split. The file stops here.';
  END IF;
  IF position('decided_under_rules' IN v_apply) = 0 OR position('final_monthly_gross - v_held' IN v_apply) = 0 THEN
    RAISE EXCEPTION 'SELF-CHECK: hr_salary_revision_apply_due_on lacks rule 6 or the held part. The file stops here.';
  END IF;
  IF position('app.hr_salary_revision_target_pay' IN v_guard) = 0
     OR position('app.hr_salary_revision_apply' IN v_guard) = 0
     OR position('hr_salary_revision_is_own(v_staff, NULL)' IN v_guard) = 0 THEN
    RAISE EXCEPTION 'SELF-CHECK: the pay guard lacks a marker or #4190''s own-pay rule. The file stops here.';
  END IF;
END
$selfcheck$;

NOTIFY pgrst, 'reload schema';

-- ROLLBACK (down migration): FIRST lapse, or have the Director re-decide, every
-- plan whose request is approved but not yet applied: #4190's apply_due_on
-- writes the WHOLE figure and does not know about a held part. Then re-apply
-- 20271007150103 sections f1, f2, f6 and i, then:
--   DROP TRIGGER IF EXISTS trg_zz_student_attendance_first_marks ON public.student_attendance;
--   DROP FUNCTION IF EXISTS public.fn_record_attendance_first_marks();
--   DROP FUNCTION IF EXISTS public.attendance_first_mark_period_key(text);
--   DROP TABLE IF EXISTS public.attendance_first_marks;
--   DROP FUNCTION IF EXISTS public.fn_hr_salary_revision_target_lapse(uuid, text);
--   DROP FUNCTION IF EXISTS public.fn_hr_salary_revision_targets_listed();
--   DROP FUNCTION IF EXISTS public.fn_hr_salary_revision_target_decide(uuid, date, boolean, text);
--   DROP FUNCTION IF EXISTS public.fn_hr_salary_revision_target_flag(uuid, date, text);
--   DROP FUNCTION IF EXISTS public.fn_hr_salary_revision_targets_run();
--   DROP FUNCTION IF EXISTS public.hr_salary_revision_targets_run_on(date);
--   DROP FUNCTION IF EXISTS public.hr_salary_revision_targets_run_one(uuid, date, integer);
--   DROP FUNCTION IF EXISTS public.hr_salary_revision_targets_due(date);
--   DROP FUNCTION IF EXISTS public.fn_hr_salary_revision_targets_due();
--   DROP FUNCTION IF EXISTS public.fn_hr_salary_revision_targets_run_one(uuid);
--   DROP FUNCTION IF EXISTS public.fn_hr_salary_revision_targets_attempt(uuid);
--   DROP FUNCTION IF EXISTS public.hr_salary_revision_targets_attempt(uuid, date);
--   DROP FUNCTION IF EXISTS public.fn_hr_salary_revision_my_targets();
--   DROP FUNCTION IF EXISTS public.hr_salary_revision_target_pay(uuid, text, date);
--   DROP FUNCTION IF EXISTS public.hr_salary_revision_target_plan_write(uuid, numeric, numeric, numeric, jsonb);
--   DROP FUNCTION IF EXISTS public.hr_salary_revision_target_role_keys(uuid);
--   DROP FUNCTION IF EXISTS public.hr_salary_revision_target_teaches(uuid, date, date);
--   DROP FUNCTION IF EXISTS public.hr_salary_revision_target_classify(uuid, jsonb, date);
--   DROP FUNCTION IF EXISTS public.hr_salary_revision_target_measurement_on();
--   DELETE FROM public.platform_policies WHERE policy_key = 'hr.salary_revision.target_measurement_on';
--   DROP FUNCTION IF EXISTS public.hr_salary_revision_target_measure(uuid, date, jsonb);
--   DROP TABLE IF EXISTS public.hr_salary_revision_target_flags, public.hr_salary_revision_target_months,
--                        public.hr_salary_revision_target_plans;
--   DROP FUNCTION IF EXISTS public.hr_salary_revision_target_can_read(uuid);
--   DROP TRIGGER IF EXISTS trg_audit_hr_salary_revision_target_rules ON public.platform_policies;
--   DROP TRIGGER IF EXISTS trg_audit_hr_salary_revision_target_rules_update ON public.platform_policies;
--   DROP TRIGGER IF EXISTS trg_audit_hr_salary_revision_target_rules_delete ON public.platform_policies;
--   DROP TRIGGER IF EXISTS trg_guard_hr_salary_revision_target_rules ON public.platform_policies;
--   DELETE FROM public.platform_policies WHERE policy_key = 'hr.salary_revision.target_rules';
--   DROP FUNCTION IF EXISTS public.fn_audit_hr_salary_revision_target_rules();
--   DROP TABLE IF EXISTS public.hr_salary_revision_target_setting_log;
--   DROP FUNCTION IF EXISTS public.fn_guard_hr_salary_revision_target_rules();
--   DROP FUNCTION IF EXISTS public.hr_salary_revision_target_rules();
--   DROP FUNCTION IF EXISTS public.hr_salary_revision_target_rules_ok(jsonb);
-- A held part already paid stays in the pay rows; rolling back writes nothing.
