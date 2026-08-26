-- ============================================================================
-- 20260929020000_fn_loops_regress_attendance.sql
-- fn_loops_regress_attendance — the SIXTH scheduled known-delta regress sim,
-- joining scf (20260711064500, the mould), feeder (20260713010053), mess
-- (20260726073305), bug-triage (20260813113000) and induction-session
-- (20260813113100) on the weekly /api/cron/loops-regress run (dispatcher row
-- 'loops-regress', Sundays 07:53 IST — NO schedule change here; the route's
-- LOOP_FNS gains one entry in the same PR).
--
-- What it proves, weekly, against production: the attendance-intervention
-- loop's MEASURE fn — fn_attendance_measure_intervention_effect
-- (20260929010000) — still measures known deltas exactly:
--   Assert A (no-change): baseline P,A,P,A (50.00%) vs after P,A,P,A (50.00%)
--                         ⇒ net_effect must be exactly 0.00
--   Assert B (known +50): the same after-window marks all flipped to Present
--                         (100.00% vs baseline 50.00%) ⇒ exactly 50.00
-- Recipe: fn-internal rolled-back sim (savepoint pattern — the sentinel RAISE
-- at the end un-happens every seed; only the loop_audits verdict row
-- persists, which /admin/loops renders as the chip's "tested" badge).
--
-- Traps this encodes (do not "simplify" them away):
--   * COLLISION-FREE WINDOWS BY CONSTRUCTION — the anchor day is
--     max(student_attendance.attendance_date) + 40, so no real mark can sit
--     inside [anchor−14, anchor+14] and the asserts stay exact even though the
--     borrowed learner is REAL (attendance_intervention_effects.learner_id has
--     a real FK to learners_profiles; unlike scf's FK-free session_feedback,
--     gen_random_uuid() is NOT safe here). The measurer accepts p_today for
--     exactly this reason: anchor+15 makes the future window "elapsed".
--   * p_effect_id scopes the measurer to the SENTINEL row AND skips its
--     enrollment phase — a NULL would sweep real pending rows into the run
--     (harmless under rollback, but the asserts stop being exact) and would
--     couple the sim to learner_risk_notification_log's presence.
--   * student_attendance NOT NULLs (marked_by/institution_id/timetable_id/
--     section_id) are borrowed AS A TUPLE from the newest real attendance row:
--     if the validate_attendance_staff_assignment BEFORE INSERT/UPDATE trigger
--     is live, a combination that recently passed it is the most likely to
--     pass again; a rejection surfaces honestly as sim-error, rolled back.
--   * Seeded docs use the VALIDATED prod shape (session-keyed, students array,
--     student_id key, capitalized 'Present' — 20260716000000), one mark per
--     day, tagged period_slot_id='ZZREGRESS' so the Assert-B flip touches only
--     sentinel rows (and only rows after the anchor).
--   * The measurer creates TEMP tables and DROPs them re-entrantly at start —
--     two sequential calls inside one subtransaction are safe (verified in the
--     fn body, the induction _ise_runs lesson).
--   * The measurer skips non-'pending' rows, so Assert B resets measure_status
--     AND the outcome columns, not just the numbers.
--   * The loop_audits verdict row FKs loop_registry('attendance-intervention')
--     — seeded by 20260929010000, which must apply first (numbering enforces).
--
-- ⛔ NOT APPLIED by merging — prod apply is a separate, Director-gated step.
--    Apply BEFORE the deploy that ships the loops-regress route change — the
--    cron sim-errors if the fn is absent. No BEGIN;/COMMIT; in this file.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_loops_regress_attendance()
RETURNS TABLE(loop_key text, verdict text, no_change_lift numeric, known_delta_lift numeric)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_a         numeric;      -- no-change net_effect (must be 0.00)
  v_b         numeric;      -- +50-delta net_effect  (must be 50.00)
  v_status_a  text;         -- measure_status at A (must be 'measured')
  v_status_b  text;         -- measure_status at B (must be 'measured')
  v_base_a    numeric;      -- baseline_rate at A (must be 50.00)
  v_after_a   numeric;      -- after_rate at A    (must be 50.00)
  v_err       text := NULL; -- non-sentinel failure inside the sim block
  v_verdict   text;
  v_anchor    date;         -- sim day t: max(attendance_date) + 40 (collision-free)
  v_learner   uuid;         -- borrowed REAL learner (FK on the effects row)
  v_marked_by uuid;         -- borrowed tuple from the newest real attendance row
  v_inst      uuid;
  v_tt        uuid;
  v_sec       uuid;
  v_row       uuid;         -- seeded sentinel effects row
  v_n_a       int;          -- measurer's measured count at A (must be >= 1)
  v_n_b       int;          -- measurer's measured count at B (must be >= 1)
BEGIN
  -- ── The sim, inside a subtransaction. The sentinel RAISE at the end rolls
  --    back every seeded row; the captured variables survive. Any OTHER error
  --    also rolls the seeds back and is reported as sim-error.
  BEGIN
    -- Anchor beyond every real mark: nothing real can pollute the windows.
    SELECT max(sa.attendance_date) + 40 INTO v_anchor
    FROM public.student_attendance sa;
    IF v_anchor IS NULL THEN
      RAISE EXCEPTION 'no student_attendance rows to anchor the sim';
    END IF;

    -- Borrow the NOT-NULL tuple from the newest real attendance row — the
    -- combination most likely to satisfy the staff-assignment trigger if live.
    SELECT sa.marked_by, sa.institution_id, sa.timetable_id, sa.section_id
      INTO v_marked_by, v_inst, v_tt, v_sec
    FROM public.student_attendance sa
    ORDER BY sa.attendance_date DESC, sa.created_at DESC, sa.id DESC
    LIMIT 1;

    -- One real learner for the effects-row FK (deterministic pick).
    SELECT lp.id INTO v_learner
    FROM public.learners_profiles lp
    ORDER BY lp.created_at ASC, lp.id ASC
    LIMIT 1;
    IF v_learner IS NULL THEN
      RAISE EXCEPTION 'need a learners_profiles row to act as the sentinel learner';
    END IF;

    -- Seed: the sentinel measurement row (pending; polymorphic source_id needs
    -- no FK, so a random uuid is safe HERE — it is the learner FK that is not).
    INSERT INTO public.attendance_intervention_effects
      (learner_id, institution_id, source, source_id, intervened_on,
       nudge_reason, baseline_days, after_days)
    VALUES
      (v_learner, v_inst, 'staff_intervention', gen_random_uuid(), v_anchor,
       'zzregress', 14, 14)
    RETURNING id INTO v_row;

    -- Seed: 8 one-mark days in the validated prod shape. Baseline
    -- [anchor−14, anchor): P,A,P,A = 50.00%. After (anchor, anchor+14]:
    -- P,A,P,A = 50.00%. Day t itself deliberately carries no mark.
    INSERT INTO public.student_attendance
      (attendance_date, marked_by, institution_id, timetable_id, section_id,
       attendance_data, period_slot_id)
    SELECT d.dt, v_marked_by, v_inst, v_tt, v_sec,
           jsonb_build_object('ZZREGRESS_S1', jsonb_build_object('students',
             jsonb_build_array(jsonb_build_object(
               'student_id', v_learner::text, 'status', d.st)))),
           'ZZREGRESS'
    FROM (VALUES
      (v_anchor - 10, 'Present'), (v_anchor - 8, 'Absent'),
      (v_anchor - 6,  'Present'), (v_anchor - 4, 'Absent'),
      (v_anchor + 1,  'Present'), (v_anchor + 3, 'Absent'),
      (v_anchor + 5,  'Present'), (v_anchor + 7, 'Absent')
    ) AS d(dt, st);

    -- Assert A: 50.00 vs 50.00 ⇒ net_effect exactly 0.00.
    SELECT t.measured INTO v_n_a
    FROM public.fn_attendance_measure_intervention_effect(14, 14, 4, v_anchor + 15, v_row) t;
    SELECT e.net_effect, e.measure_status, e.baseline_rate, e.after_rate
      INTO v_a, v_status_a, v_base_a, v_after_a
    FROM public.attendance_intervention_effects e
    WHERE e.id = v_row;

    -- Reset between deltas: the measurer only sweeps 'pending' rows.
    UPDATE public.attendance_intervention_effects
       SET measure_status = 'pending',
           baseline_marks = NULL, baseline_present = NULL, baseline_rate = NULL,
           after_marks = NULL, after_present = NULL, after_rate = NULL,
           net_effect = NULL, measured_at = NULL, model = NULL
     WHERE id = v_row;

    -- Known +50 delta: flip the sentinel AFTER-window marks to Present
    -- (100.00 vs baseline 50.00 ⇒ exactly 50.00). Sentinel-scoped by the
    -- period_slot_id tag AND the after-window date guard.
    UPDATE public.student_attendance
       SET attendance_data = jsonb_build_object('ZZREGRESS_S1',
             jsonb_build_object('students',
               jsonb_build_array(jsonb_build_object(
                 'student_id', v_learner::text, 'status', 'Present'))))
     WHERE period_slot_id = 'ZZREGRESS'
       AND attendance_date > v_anchor;

    SELECT t.measured INTO v_n_b
    FROM public.fn_attendance_measure_intervention_effect(14, 14, 4, v_anchor + 15, v_row) t;
    SELECT e.net_effect, e.measure_status INTO v_b, v_status_b
    FROM public.attendance_intervention_effects e
    WHERE e.id = v_row;

    -- Roll the seeds back. Everything above un-happens; captures survive.
    RAISE EXCEPTION 'LOOPS_REGRESS_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'LOOPS_REGRESS_ROLLBACK' THEN
      v_err := SQLERRM;   -- real failure: seeds still rolled back with the block
    END IF;
  END;

  v_verdict := CASE
    WHEN v_err IS NOT NULL THEN 'sim-error: ' || left(v_err, 180)
    WHEN v_a = 0.00 AND v_b = 50.00
         AND v_status_a = 'measured' AND v_status_b = 'measured'
         AND v_base_a = 50.00 AND v_after_a = 50.00
      THEN 'measure-verified'
    ELSE 'sim-failed'
  END;

  -- The only persistent write: the verdict, visible on /admin/loops.
  INSERT INTO public.loop_audits (loop_key, layer, verdict, evidence)
  VALUES ('attendance-intervention', 'sim', v_verdict,
          jsonb_build_object('no_change', v_a, 'known_delta_plus50', v_b,
                             'status_no_change', v_status_a,
                             'status_known_delta', v_status_b,
                             'baseline_rate_a', v_base_a,
                             'after_rate_a', v_after_a,
                             'measured_rows_a', v_n_a, 'measured_rows_b', v_n_b,
                             'runner', 'fn_loops_regress_attendance'));

  RETURN QUERY SELECT 'attendance-intervention'::text, v_verdict, v_a, v_b;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_loops_regress_attendance() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_loops_regress_attendance() TO service_role;

NOTIFY pgrst, 'reload schema';
