-- =============================================================================
-- 20261001020000_fn_loops_regress_workpulse.sql
-- fn_loops_regress_workpulse — the SIXTH scheduled known-delta regress sim,
-- joining fn_loops_regress_scf (20260711064500, the mould), _feeder, _mess,
-- _bug_triage and _induction on the weekly /api/cron/loops-regress run
-- (dispatcher row 'loops-regress', Sundays 07:53 IST — seeded by the mould
-- migration; NO schedule change here).
--
-- NOT APPLIED AT PR TIME — prod apply is Director-gated (FILE ONLY).
-- Requires 20261001010000 (the measurer + the 'work-pulse' loop_registry row:
-- loop_audits.loop_key FKs loop_registry).
--
-- What it proves, weekly, against production data: the work-pulse loop's
-- MEASURE fn — fn_work_signal_suggestion_measure_deltas, which records next
-- week's od_* signals minus the suggestion week's snapshot for ADOPTED
-- suggestions (human_verdict tried_helped / tried_no_change) — still measures
-- known deltas exactly, and still refuses to measure what was not adopted.
--   Assert A (no-change):  sentinel suggestion whose snapshot equals the
--                          subject's live signals (all zeros) ⇒ every delta
--                          key must be exactly 0
--   Assert B (known delta): sentinel snapshot {od_pending:5, od_oldest_days:9,
--                          od_decided_30d:2} against the same all-zero live
--                          signals ⇒ deltas must be exactly -5 / -9 / -2
--   Assert C (scope):      a 'not_tried' sentinel row must stay UNMEASURED
--                          (outcome_measured_at IS NULL) — adoption scoping
--                          is part of the contract, not an accident
--
-- Traps this encodes (do not "simplify" them away):
--   * Determinism: the measurer re-reads LIVE leave_onduty_approvals signals,
--     so the sentinel subject is chosen as the oldest profiles row with ZERO
--     approver rows — its live od_* signals are exactly 0/0/0 by
--     construction, making both deltas fully known. Deterministic pick by
--     (created_at, id), never a superlative that can re-aim.
--   * work_signal_suggestions has UNIQUE (subject_profile_id, week_start) —
--     the three sentinel rows use far-past week_starts (2001-01-01/-08/-15,
--     no real row can predate the table) so no real week can collide.
--   * The measurer is called SCOPED to the sentinel subject
--     (p_subject_profile_id) with p_min_age_days=0 — real unmeasured rows are
--     untouched even transiently, and far-past sentinel weeks pass any age
--     gate.
--   * All seeded rows live inside the subtransaction and are rolled back by
--     the sentinel RAISE; the captured deltas survive. The only persistent
--     write is the loop_audits verdict row, visible on /admin/loops.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_loops_regress_workpulse()
RETURNS TABLE(loop_key text, verdict text, no_change_lift numeric, known_delta_lift numeric)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_subject   uuid;           -- borrowed REAL profile with zero approver rows
  v_a_id      uuid;           -- sentinel row A (no-change)
  v_b_id      uuid;           -- sentinel row B (known delta)
  v_c_id      uuid;           -- sentinel row C (not_tried scope control)
  v_a_pend    numeric; v_a_old numeric; v_a_dec numeric;
  v_b_pend    numeric; v_b_old numeric; v_b_dec numeric;
  v_c_stamped boolean;        -- row C measured? must stay false
  v_err       text := NULL;   -- non-sentinel failure inside the sim block
  v_verdict   text;
BEGIN
  -- ── The sim, inside a subtransaction. The sentinel RAISE at the end rolls
  --    back every seeded row; the captured variables survive.
  BEGIN
    -- Deterministic subject: oldest profile with ZERO leave_onduty_approvals
    -- approver rows ⇒ its live od_* signals recompute to exactly 0/0/0.
    SELECT p.id INTO v_subject
    FROM public.profiles p
    WHERE NOT EXISTS (
      SELECT 1 FROM public.leave_onduty_approvals a WHERE a.approver_id = p.id
    )
    ORDER BY p.created_at ASC, p.id ASC
    LIMIT 1;
    IF v_subject IS NULL THEN
      RAISE EXCEPTION 'no profiles row without approver activity available to anchor the sim';
    END IF;

    -- Seed A: snapshot equals live signals (all zeros) ⇒ known NO-change.
    INSERT INTO public.work_signal_suggestions
      (subject_profile_id, subject_email, week_start, suggestion,
       signals_snapshot, human_verdict, human_verdict_at)
    VALUES
      (v_subject, 'zzregress@sim.invalid', DATE '2001-01-01',
       'ZZREGRESS work-pulse regress sim (no-change)',
       jsonb_build_object('od_pending', 0, 'od_oldest_days', 0, 'od_decided_30d', 0),
       'tried_helped', now())
    RETURNING id INTO v_a_id;

    -- Seed B: snapshot {5,9,2} against the same all-zero live signals ⇒
    -- known deltas -5 / -9 / -2.
    INSERT INTO public.work_signal_suggestions
      (subject_profile_id, subject_email, week_start, suggestion,
       signals_snapshot, human_verdict, human_verdict_at)
    VALUES
      (v_subject, 'zzregress@sim.invalid', DATE '2001-01-08',
       'ZZREGRESS work-pulse regress sim (known delta)',
       jsonb_build_object('od_pending', 5, 'od_oldest_days', 9, 'od_decided_30d', 2),
       'tried_no_change', now())
    RETURNING id INTO v_b_id;

    -- Seed C: not_tried ⇒ the measurer must LEAVE it unmeasured.
    INSERT INTO public.work_signal_suggestions
      (subject_profile_id, subject_email, week_start, suggestion,
       signals_snapshot, human_verdict, human_verdict_at)
    VALUES
      (v_subject, 'zzregress@sim.invalid', DATE '2001-01-15',
       'ZZREGRESS work-pulse regress sim (not adopted — must stay unmeasured)',
       jsonb_build_object('od_pending', 5, 'od_oldest_days', 9, 'od_decided_30d', 2),
       'not_tried', now())
    RETURNING id INTO v_c_id;

    -- Run the REAL measurer (never a re-implementation), scoped to the
    -- sentinel subject, age gate 0 (far-past weeks pass regardless).
    PERFORM public.fn_work_signal_suggestion_measure_deltas(0, v_subject);

    -- Capture the recorded deltas (NULLs here fail the verdict downstream).
    SELECT (s.outcome_delta ->> 'od_pending')::numeric,
           (s.outcome_delta ->> 'od_oldest_days')::numeric,
           (s.outcome_delta ->> 'od_decided_30d')::numeric
      INTO v_a_pend, v_a_old, v_a_dec
    FROM public.work_signal_suggestions s WHERE s.id = v_a_id;

    SELECT (s.outcome_delta ->> 'od_pending')::numeric,
           (s.outcome_delta ->> 'od_oldest_days')::numeric,
           (s.outcome_delta ->> 'od_decided_30d')::numeric
      INTO v_b_pend, v_b_old, v_b_dec
    FROM public.work_signal_suggestions s WHERE s.id = v_b_id;

    SELECT (s.outcome_measured_at IS NOT NULL)
      INTO v_c_stamped
    FROM public.work_signal_suggestions s WHERE s.id = v_c_id;

    -- Roll the seeds back. Everything above un-happens; captures survive.
    RAISE EXCEPTION 'LOOPS_REGRESS_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'LOOPS_REGRESS_ROLLBACK' THEN
      v_err := SQLERRM;   -- real failure: seeds still rolled back with the block
    END IF;
  END;

  v_verdict := CASE
    WHEN v_err IS NOT NULL THEN 'sim-error: ' || left(v_err, 180)
    WHEN v_a_pend = 0 AND v_a_old = 0 AND v_a_dec = 0
         AND v_b_pend = -5 AND v_b_old = -9 AND v_b_dec = -2
         AND v_c_stamped = false
      THEN 'measure-verified'
    ELSE 'sim-failed'
  END;

  -- The only persistent write: the verdict, visible on /admin/loops.
  INSERT INTO public.loop_audits (loop_key, layer, verdict, evidence)
  VALUES ('work-pulse', 'sim', v_verdict,
          jsonb_build_object(
            'no_change',  jsonb_build_object('od_pending', v_a_pend, 'od_oldest_days', v_a_old, 'od_decided_30d', v_a_dec),
            'known_delta', jsonb_build_object('od_pending', v_b_pend, 'od_oldest_days', v_b_old, 'od_decided_30d', v_b_dec),
            'not_tried_left_unmeasured', NOT COALESCE(v_c_stamped, true),
            'runner', 'fn_loops_regress_workpulse'));

  RETURN QUERY SELECT 'work-pulse'::text, v_verdict, v_a_pend, v_b_pend;
END;
$function$;

-- Cron-only (the loops-regress runner fires it as service_role). Re-asserting
-- the full lock on this CREATE OR REPLACE: anon + PUBLIC + authenticated.
REVOKE EXECUTE ON FUNCTION public.fn_loops_regress_workpulse() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_loops_regress_workpulse() TO service_role;

NOTIFY pgrst, 'reload schema';
