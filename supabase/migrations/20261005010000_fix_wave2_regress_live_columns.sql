-- ============================================================================
-- 20261005010000_fix_wave2_regress_live_columns.sql
-- ----------------------------------------------------------------------------
-- Post-apply repairs for three Wave-2 fns, found by RUNNING the regress sims
-- on production minutes after apply (2026-08-26 ~08:05 IST) — CI parses
-- migrations but never executes them, and plpgsql bodies only fail at runtime:
--   1. fn_loops_regress_attendance: borrowed/seeded a student_attendance
--      column (marked_by) that does not exist on prod.
--   2. fn_loops_measure_ops_cycletime: read resource_approvals.rejected_at,
--      which does not exist; rejection-close now = updated_at at status flip.
--   3. fn_consultants_measure_conversion: RETURNS TABLE consultant_id vs the
--      ON CONFLICT arbiter column — plpgsql ambiguity; fixed with
--      #variable_conflict use_column.
-- Verification bar: all five fn_loops_regress_* return 'measure-verified' when
-- run directly. ACLs restated below per house law (anon,PUBLIC revoked).
-- No BEGIN;/COMMIT; — rollback-rehearsal safe.
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
    -- [fix 2026-08-26] student_attendance has NO marked_by column on prod —
    -- the live sim run proved it (sim-error). Borrow only the real columns.
    SELECT sa.institution_id, sa.timetable_id, sa.section_id
      INTO v_inst, v_tt, v_sec
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
      (attendance_date, institution_id, timetable_id, section_id,
       attendance_data, period_slot_id)
    SELECT d.dt, v_inst, v_tt, v_sec,
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

CREATE OR REPLACE FUNCTION public.fn_loops_measure_ops_cycletime(
  p_queue_key    text,
  p_window_start timestamptz,
  p_window_end   timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_resolved_n integer;
  v_backlog_n  integer;
  v_median     numeric;
  v_p90        numeric;
BEGIN
  IF p_window_start IS NULL OR p_window_end IS NULL OR p_window_end <= p_window_start THEN
    RAISE EXCEPTION 'fn_loops_measure_ops_cycletime: invalid window start=% end=%',
      p_window_start, p_window_end;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ops_cycletime_queues q
    WHERE q.queue_key = p_queue_key AND q.is_active
  ) THEN
    RAISE EXCEPTION 'fn_loops_measure_ops_cycletime: unknown or inactive queue_key %', p_queue_key;
  END IF;

  -- Config-drift guard: a switchboard row the measurer has no branch for must
  -- REFUSE, not silently measure an empty set (the confident-liar class).
  IF p_queue_key NOT IN ('service_requests', 'hr_attendance_exceptions', 'resource_approvals') THEN
    RAISE EXCEPTION
      'fn_loops_measure_ops_cycletime: queue % has a config row but no extraction branch — add the branch before activating it',
      p_queue_key;
  END IF;

  -- ONE statement: three tiny per-queue extraction branches normalise to
  -- (opened_at, closed_at, open_candidate); the shared scoring + percentile
  -- block below them exists exactly once (the twin rule).
  WITH items AS (
    SELECT
      CASE WHEN sr.status <> 'draft'
           THEN COALESCE(sr.submitted_at, sr.created_at) END          AS opened_at,
      CASE WHEN sr.status IN ('fulfilled', 'closed')
           THEN LEAST(sr.fulfilled_at, sr.closed_at) END              AS closed_at,
      (sr.status NOT IN ('draft', 'rejected', 'cancelled'))           AS open_candidate
    FROM public.service_requests sr
    WHERE p_queue_key = 'service_requests'

    UNION ALL

    SELECT
      hae.created_at,
      CASE WHEN hae.resolution_status IN ('resolved', 'ignored')
           THEN hae.resolved_at END,
      (hae.resolution_status = 'open')
    FROM public.hr_attendance_exceptions hae
    WHERE p_queue_key = 'hr_attendance_exceptions'

    UNION ALL

    SELECT
      ra.created_at,
      -- [fix 2026-08-26] resource_approvals has no rejected_at on prod (live
      -- sim run proved it): a rejection's close instant is the status flip,
      -- best-available signal = updated_at when status='rejected'.
      LEAST(ra.approved_at, CASE WHEN ra.status = 'rejected' THEN ra.updated_at END),
      (ra.approved_at IS NULL AND ra.status IS DISTINCT FROM 'rejected')
    FROM public.resource_approvals ra
    WHERE p_queue_key = 'resource_approvals'
  ),
  scored AS (
    SELECT
      extract(epoch FROM (i.closed_at - i.opened_at))::numeric AS cycle_seconds,
      (i.opened_at IS NOT NULL AND i.closed_at IS NOT NULL
        AND i.closed_at >= i.opened_at            -- negative cycles are data noise, never measured
        AND i.closed_at >= p_window_start
        AND i.closed_at <  p_window_end)          AS resolved_in_window,
      (i.open_candidate
        AND i.opened_at IS NOT NULL
        AND i.opened_at <= p_window_end
        AND (i.closed_at IS NULL OR i.closed_at > p_window_end)) AS open_at_window_end
    FROM items i
  )
  SELECT
    COALESCE(count(*) FILTER (WHERE s.resolved_in_window), 0)::integer,
    COALESCE(count(*) FILTER (WHERE s.open_at_window_end), 0)::integer,
    round((percentile_cont(0.5) WITHIN GROUP (ORDER BY s.cycle_seconds)
             FILTER (WHERE s.resolved_in_window))::numeric, 2),
    round((percentile_cont(0.9) WITHIN GROUP (ORDER BY s.cycle_seconds)
             FILTER (WHERE s.resolved_in_window))::numeric, 2)
  INTO v_resolved_n, v_backlog_n, v_median, v_p90
  FROM scored s;

  INSERT INTO public.ops_cycletime_measurements
    (queue_key, window_start, window_end, resolved_n, open_backlog_n,
     median_seconds, p90_seconds, measured_at)
  VALUES
    (p_queue_key, p_window_start, p_window_end, v_resolved_n, v_backlog_n,
     v_median, v_p90, now())
  ON CONFLICT (queue_key, window_start, window_end) DO UPDATE SET
    resolved_n     = EXCLUDED.resolved_n,
    open_backlog_n = EXCLUDED.open_backlog_n,
    median_seconds = EXCLUDED.median_seconds,
    p90_seconds    = EXCLUDED.p90_seconds,
    measured_at    = now(),
    updated_at     = now();

  RETURN jsonb_build_object(
    'success',        true,
    'queue_key',      p_queue_key,
    'window_start',   p_window_start,
    'window_end',     p_window_end,
    'resolved_n',     v_resolved_n,
    'open_backlog_n', v_backlog_n,
    'median_seconds', v_median,
    'p90_seconds',    v_p90
  );
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_loops_measure_ops_cycletime(text, timestamptz, timestamptz)
  FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_loops_measure_ops_cycletime(text, timestamptz, timestamptz)
  TO service_role;

CREATE OR REPLACE FUNCTION public.fn_consultants_measure_conversion(
  p_as_of         date    DEFAULT CURRENT_DATE,
  p_window_days   integer DEFAULT 30,
  p_consultant_id uuid    DEFAULT NULL,
  p_min_n         integer DEFAULT NULL
)
RETURNS TABLE(
  consultant_id            uuid,
  window_start             date,
  window_end               date,
  window_attributions      integer,
  window_conversions       integer,
  window_conversion_rate   numeric,
  baseline_attributions    integer,
  baseline_conversions     integer,
  baseline_conversion_rate numeric,
  conversion_delta         numeric
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
#variable_conflict use_column
-- [fix 2026-08-26] RETURNS TABLE(consultant_id ...) collides with the ON
-- CONFLICT arbiter column under plpgsql variable substitution (live sim run:
-- 'column reference "consultant_id" is ambiguous'). All variable reads in this
-- body are qualified (v_/p_/aliases), so column-preference is safe.
DECLARE
  v_k     integer;
  v_start date;
  v_end   date;
BEGIN
  IF p_window_days IS NULL OR p_window_days < 1 THEN
    RAISE EXCEPTION 'p_window_days must be >= 1';
  END IF;

  v_end   := COALESCE(p_as_of, CURRENT_DATE);   -- exclusive
  v_start := v_end - p_window_days;

  v_k := COALESCE(
    p_min_n,
    (SELECT (pp.value #>> '{}')::int
       FROM public.platform_policies pp
      WHERE pp.policy_key = 'consultants.loop.min_attributions_k'
        AND pp.scope_type = 'global'
        AND pp.is_active
      LIMIT 1),
    5);
  IF v_k < 1 THEN
    RAISE EXCEPTION 'min_attributions_k must be >= 1 (got %)', v_k;
  END IF;

  RETURN QUERY
  WITH per_consultant AS (
    -- One pass over the attribution ledger; window vs baseline split by
    -- created_at against the window boundary. Consultants with no attribution
    -- ever simply produce no row.
    SELECT
      a.consultant_id AS cid,
      count(*) FILTER (WHERE a.created_at >= v_start AND a.created_at < v_end)::int AS w_n,
      count(*) FILTER (WHERE a.created_at >= v_start AND a.created_at < v_end
                         AND a.current_stage IN ('enrolled','confirmed'))::int      AS w_c,
      count(*) FILTER (WHERE a.created_at < v_start)::int                           AS b_n,
      count(*) FILTER (WHERE a.created_at < v_start
                         AND a.current_stage IN ('enrolled','confirmed'))::int      AS b_c
    FROM public.consultant_lead_attributions a
    WHERE (p_consultant_id IS NULL OR a.consultant_id = p_consultant_id)
    GROUP BY a.consultant_id
  ),
  rated AS (
    -- SAME estimator both sides; NULL below the floor (never feed noise).
    SELECT
      pc.cid, pc.w_n, pc.w_c, pc.b_n, pc.b_c,
      CASE WHEN pc.w_n >= v_k
           THEN round((pc.w_c::numeric / pc.w_n) * 100, 2) END AS w_rate,
      CASE WHEN pc.b_n >= v_k
           THEN round((pc.b_c::numeric / pc.b_n) * 100, 2) END AS b_rate
    FROM per_consultant pc
  ),
  upserted AS (
    INSERT INTO public.consultant_conversion_measurements AS m
      (consultant_id, window_start, window_end,
       window_attributions, window_conversions, window_conversion_rate,
       baseline_attributions, baseline_conversions, baseline_conversion_rate,
       conversion_delta, min_attributions_k, measured_at)
    SELECT
      r.cid, v_start, v_end,
      r.w_n, r.w_c, r.w_rate,
      r.b_n, r.b_c, r.b_rate,
      CASE WHEN r.w_rate IS NOT NULL AND r.b_rate IS NOT NULL
           THEN round(r.w_rate - r.b_rate, 2) END,
      v_k, now()
    FROM rated r
    ON CONFLICT (consultant_id, window_start, window_end) DO UPDATE SET
      window_attributions      = EXCLUDED.window_attributions,
      window_conversions       = EXCLUDED.window_conversions,
      window_conversion_rate   = EXCLUDED.window_conversion_rate,
      baseline_attributions    = EXCLUDED.baseline_attributions,
      baseline_conversions     = EXCLUDED.baseline_conversions,
      baseline_conversion_rate = EXCLUDED.baseline_conversion_rate,
      conversion_delta         = EXCLUDED.conversion_delta,
      min_attributions_k       = EXCLUDED.min_attributions_k,
      measured_at              = EXCLUDED.measured_at,
      updated_at               = now()
    RETURNING m.*
  )
  SELECT
    u.consultant_id, u.window_start, u.window_end,
    u.window_attributions, u.window_conversions, u.window_conversion_rate,
    u.baseline_attributions, u.baseline_conversions, u.baseline_conversion_rate,
    u.conversion_delta
  FROM upserted u;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_consultants_measure_conversion(date, integer, uuid, integer) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_consultants_measure_conversion(date, integer, uuid, integer) TO service_role;
