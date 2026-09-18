-- ============================================================================
-- 3924-catchup-apply.sql          ROLLS BACK BY DEFAULT. Nothing persists.
--
-- 🛑 NOT RUN by the lane. The desk runs the preview
--    (scripts/rehearsals/3924-catchup-preview.sql), the Director reads the
--    names, and only then, on his word, this file — and only then with the
--    final line changed from ROLLBACK to COMMIT.
--
-- WHAT IT DOES. The ONE-TIME catch-up the Director ruled for on 2026-09-19
-- 04:58: every reserved/admitted learner who already carries a Present mark is
-- moved to `active`, once. Nothing recurring, nothing automatic, nothing in a
-- migration.
--
-- IT GOES THROUGH THE SAME ACTIVATION PATH AS THE TRIGGER.
--   `fn_activate_learner_on_first_present()` RETURNS trigger and reads NEW.*,
--   so it cannot be called for a mark recorded in the past. Repair round 1
--   therefore lifted the promote-and-audit step into
--   `fn_activate_learners_for_first_present(...)` — one body, called by the
--   trigger and by this file. THIS FILE CONTAINS NO STATUS UPDATE OF ITS OWN.
--   That is deliberate: a second hand-rolled UPDATE is how two routes to
--   `active` drift apart, and how an audit row ends up shaped differently
--   depending on which route wrote it.
--
--   So every learner activated here gets exactly the history row the trigger
--   writes: reason_code `first_present_attendance`, the attendance record id,
--   the marker, the from-status, and `fee_thresholds_bypassed: true`. The only
--   difference is `metadata.source`, which reads
--   `first_present_catchup_2026_09_19` instead of the trigger's own name, and
--   `metadata.trigger_op`, which reads `CATCHUP`. That is the field an office
--   user needs to tell "activated by the one-time catch-up" from "activated by
--   a mark taken since", and it costs nothing.
--
-- A FAILURE ON ONE LEARNER DOES NOT ABORT THE REST. Each activation runs in its
-- own exception block and a failure is written to
-- `public.learner_activation_failures`, exactly as the trigger does it, so the
-- run reports rather than half-finishing silently.
--
-- THE SET IS DEFINED ONCE. The `present_marks` / `first_present` /
-- `catchup_set` CTE below is character-for-character identical to the one in
-- the preview file, so the list he approved is the list that runs. If you edit
-- one, edit the other — a `diff` of the two CTEs must come back empty.
--
-- IDEMPOTENT. A learner already `active` fails the allowlist inside the shared
-- function, so the UPDATE matches nothing and no history row is written.
-- Running this twice activates the same people once.
-- ============================================================================

BEGIN;

DO $catchup$
DECLARE
  r          record;
  v_seen     integer := 0;
  v_moved    integer := 0;
  v_failed   integer := 0;
  v_err_state text;
  v_err_msg   text;
BEGIN
  IF to_regprocedure('public.fn_activate_learners_for_first_present(uuid[],uuid,date,uuid,uuid,uuid,uuid,uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION
      'migration 20260919005000_harden_first_present_activation.sql is not applied here — this file refuses to hand-roll the activation';
  END IF;

  -- ↓↓↓ THE SET. Byte-identical to the CTE in 3924-catchup-preview.sql, which
  --     is why it starts at column 0 inside this block: so a literal diff of
  --     the two comes back empty. Do not re-indent it. ↓↓↓
  FOR r IN
WITH present_marks AS (
  SELECT
    (s.rec ->> 'student_id')::uuid AS learner_id,
    sa.id                          AS student_attendance_id,
    sa.attendance_date             AS attendance_date,
    sa.section_id                  AS section_id,
    sa.timetable_id                AS timetable_id,
    sa.institution_id              AS institution_id,
    sa.marked_by                   AS marked_by,
    sa.created_at                  AS marked_at
  FROM public.student_attendance sa
  CROSS JOIN LATERAL jsonb_each(
         CASE WHEN jsonb_typeof(sa.attendance_data) = 'object'
              THEN sa.attendance_data ELSE '{}'::jsonb END) AS per(period_key, period_val)
  CROSS JOIN LATERAL jsonb_array_elements(
         CASE WHEN jsonb_typeof(per.period_val -> 'students') = 'array'
              THEN per.period_val -> 'students' ELSE '[]'::jsonb END) AS s(rec)
  WHERE lower(COALESCE(s.rec ->> 'status', '')) = 'present'
    AND COALESCE(s.rec ->> 'student_id', '') ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
),
first_present AS (
  SELECT DISTINCT ON (pm.learner_id)
         pm.learner_id, pm.student_attendance_id, pm.attendance_date,
         pm.section_id, pm.timetable_id, pm.institution_id, pm.marked_by, pm.marked_at
  FROM present_marks pm
  ORDER BY pm.learner_id, pm.attendance_date ASC, pm.marked_at ASC, pm.student_attendance_id ASC
),
catchup_set AS (
  SELECT fp.learner_id, fp.student_attendance_id, fp.attendance_date,
         fp.section_id, fp.timetable_id, fp.institution_id, fp.marked_by,
         lp.lifecycle_status::text AS current_status
  FROM first_present fp
  JOIN public.learners_profiles lp ON lp.id = fp.learner_id
  WHERE lp.lifecycle_status::text IN ('reserved', 'admitted')
)
    SELECT * FROM catchup_set ORDER BY learner_id
  LOOP
    v_seen := v_seen + 1;
    BEGIN
      v_moved := v_moved + public.fn_activate_learners_for_first_present(
        ARRAY[r.learner_id],
        r.student_attendance_id,
        r.attendance_date,
        r.section_id,
        r.timetable_id,
        r.institution_id,
        r.marked_by,
        NULL::uuid,                       -- changed_by: an operator session has no auth.uid()
        'CATCHUP',
        'first_present_catchup_2026_09_19');
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      GET STACKED DIAGNOSTICS v_err_state = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
      BEGIN
        INSERT INTO public.learner_activation_failures
          (student_attendance_id, attendance_date, section_id, timetable_id,
           institution_id, trigger_op, learner_ids, marked_by, attempted_by,
           sqlstate, error_message)
        VALUES
          (r.student_attendance_id, r.attendance_date, r.section_id, r.timetable_id,
           r.institution_id, 'CATCHUP', ARRAY[r.learner_id], r.marked_by, NULL,
           v_err_state, COALESCE(v_err_msg, 'unknown error'));
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'catch-up: learner % failed AND the failure could not be recorded: % %',
          r.learner_id, SQLSTATE, SQLERRM;
      END;
      RAISE WARNING 'catch-up: learner % NOT activated (%): %', r.learner_id, v_err_state, v_err_msg;
    END;
  END LOOP;

  RAISE NOTICE
    'one-time first-present catch-up: % learner(s) in the approved set, % activated, % failed (see public.learner_activation_failures)',
    v_seen, v_moved, v_failed;

  -- The count check. Every learner in the set must now be `active`, except the
  -- ones that failed. A mismatch means something moved under the run.
  IF v_moved + v_failed <> v_seen THEN
    RAISE EXCEPTION
      'catch-up count check FAILED: % in set, % activated, % failed — the numbers do not close, nothing is being committed',
      v_seen, v_moved, v_failed;
  END IF;
END
$catchup$;


-- ── The proof the desk reads back before deciding to commit ─────────────────
-- Run inside the same transaction, so it reflects what the block above did.
SELECT
  (SELECT count(*) FROM public.learners_profile_status_history
    WHERE reason_code = 'first_present_attendance'
      AND metadata ->> 'source' = 'first_present_catchup_2026_09_19')  AS history_rows_written,
  (SELECT count(*) FROM public.learners_profiles
    WHERE lifecycle_status::text = 'active')                           AS active_learners_now,
  (SELECT count(*) FROM public.learners_profiles
    WHERE lifecycle_status::text IN ('reserved','admitted'))           AS still_provisional,
  (SELECT count(*) FROM public.learner_activation_failures
    WHERE trigger_op = 'CATCHUP')                                      AS catchup_failures;


-- ════════════════════════════════════════════════════════════════════════════
-- ⬇⬇⬇  THE ONE LINE TO CHANGE.  ROLLBACK = rehearsal. COMMIT = it happens.  ⬇⬇⬇
-- Change to COMMIT; only on the Director's word, after he has read the preview.
ROLLBACK;
-- ════════════════════════════════════════════════════════════════════════════
