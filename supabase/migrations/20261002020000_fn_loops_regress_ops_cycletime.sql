-- =============================================================================
-- 20261002020000_fn_loops_regress_ops_cycletime.sql
-- fn_loops_regress_ops_cycletime — the SIXTH scheduled known-delta regress sim,
-- joining fn_loops_regress_scf (20260711064500, the mould), feeder
-- (20260713010053), mess (20260726073305), bug-triage (20260813113000) and
-- induction-session (20260813113100) on the weekly /api/cron/loops-regress run
-- (dispatcher row 'loops-regress', Sundays 07:53 IST — seeded by the mould
-- migration; NO schedule change here).
--
-- FILE ONLY / NOT APPLIED — prod apply is Director-gated. ⚠️ Apply this AND
-- 20261002010000 via Mgmt API BEFORE the deploy that ships the LOOP_FNS route
-- change — the cron sim-errors (honestly, with a red Tower badge and a
-- super-admin notification) if the fn is absent.
--
-- What it proves, weekly, against production: the family's MEASURE fn —
-- fn_loops_measure_ops_cycletime (20261002010000), the shared open→resolution
-- cycle-time measurer over three operational queues — still measures known
-- deltas exactly, through the loop's REAL measurement fn, never a
-- re-implementation.
--   Assert A (no-change): a far-past sentinel window (Jan 1997 — the HR module
--                         shipped 2026, no real row can carry 1997 timestamps)
--                         with ZERO seeded rows ⇒ resolved_n exactly 0 and
--                         median_seconds NULL (an empty cohort must report "no
--                         number", never a fabricated 0).
--   Assert B (known Δ):   exactly 3 sentinel hr_attendance_exceptions resolved
--                         inside that window with cycle times 1h / 2h / 10h ⇒
--                         resolved_n exactly 3, median exactly 7200.00 and p90
--                         exactly 30240.00 (percentile_cont over
--                         [3600, 7200, 36000]: 7200 + 0.8 × (36000 − 7200)).
--   Assert C (dispatch):  the other two queue branches (service_requests,
--                         resource_approvals) measure the same sentinel window
--                         to resolved_n exactly 0 — every extraction branch
--                         executes, none errors.
--   Assert D (closed vocabulary): an unknown queue_key must RAISE — the
--                         config-drift guard stays armed.
--
-- Traps this encodes (columns verified read-only against jicate/main DDL
-- 2026-08-26; do not "simplify" them away):
--   * hr_attendance_exceptions is the seeded queue because every FK on it
--     (employee_id, hr_organization_id, institution_id, resolved_by) is
--     NULLABLE — the sim borrows nothing real. exception_date is NOT NULL;
--     exception_type carries a real vocabulary value ('single_punch_day') in
--     case production has since added a CHECK; sentinel identity lives in
--     raw_payload, never in a column a report might read.
--   * created_at has DEFAULT now() but accepts an explicit value — the seeds
--     write 1997 timestamps directly; no trigger on this table rewrites them.
--   * The measurer requires an ACTIVE ops_cycletime_queues config row — those
--     rows come from 20261002010000 (already applied by then), NOT from this
--     sim, so no config seeding happens here.
--   * The measurer UPSERTS ops_cycletime_measurements rows for the sentinel
--     window (A's row is overwritten by B's re-measure via ON CONFLICT); both
--     live inside the subtransaction and are erased by the sentinel RAISE —
--     the only persistent write is the loop_audits verdict row.
--   * The measurer is SECURITY DEFINER with no auth/permission gate (body
--     verified) — no impersonation GUC is needed, unlike the feeder regress.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_loops_regress_ops_cycletime()
RETURNS TABLE(loop_key text, verdict text, no_change_lift numeric, known_delta_lift numeric)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_ws        timestamptz := '1997-01-06 00:00:00+00';  -- sentinel window (Mon→Mon)
  v_we        timestamptz := '1997-01-13 00:00:00+00';
  v_a_n       numeric;        -- no-change resolved_n        (must be 0)
  v_a_median  jsonb;          -- no-change median_seconds    (must be JSON null)
  v_b_n       numeric;        -- known-delta resolved_n      (must be 3)
  v_b_median  numeric;        -- known-delta median_seconds  (must be 7200.00)
  v_b_p90     numeric;        -- known-delta p90_seconds     (must be 30240.00)
  v_sr_n      numeric;        -- service_requests branch, sentinel window (must be 0)
  v_ra_n      numeric;        -- resource_approvals branch, sentinel window (must be 0)
  v_vocab_ok  boolean := false;  -- unknown queue_key raised as required
  v_err       text := NULL;   -- non-sentinel failure inside the sim block
  v_verdict   text;
  v_res       jsonb;          -- measurer return payload
BEGIN
  -- ── The sim, inside a subtransaction. The sentinel RAISE at the end rolls
  --    back every seeded row AND the measurer's sentinel-window upserts; the
  --    captured variables survive. Any OTHER error also rolls the seeds back
  --    and is reported as sim-error.
  BEGIN
    -- Assert A: empty far-past window ⇒ 0 resolved, NULL median.
    v_res := public.fn_loops_measure_ops_cycletime('hr_attendance_exceptions', v_ws, v_we);
    IF NOT COALESCE((v_res ->> 'success')::boolean, false) THEN
      RAISE EXCEPTION 'measure (no-change) returned success=false: %', v_res::text;
    END IF;
    v_a_n      := (v_res ->> 'resolved_n')::numeric;
    v_a_median := v_res -> 'median_seconds';   -- kept as jsonb to assert real NULL

    -- Assert C: the other two extraction branches run clean on the same
    -- sentinel window and find nothing (no real 1997 data can exist).
    v_res  := public.fn_loops_measure_ops_cycletime('service_requests', v_ws, v_we);
    v_sr_n := (v_res ->> 'resolved_n')::numeric;
    v_res  := public.fn_loops_measure_ops_cycletime('resource_approvals', v_ws, v_we);
    v_ra_n := (v_res ->> 'resolved_n')::numeric;

    -- Assert D: the config-drift guard must refuse an unknown queue_key.
    BEGIN
      v_res := public.fn_loops_measure_ops_cycletime('zzregress_unknown_queue', v_ws, v_we);
      v_vocab_ok := false;   -- reaching here means the guard is disarmed
    EXCEPTION WHEN OTHERS THEN
      v_vocab_ok := true;
    END;

    -- Known +3 delta: three sentinel exceptions resolved inside the window
    -- with cycle times exactly 1h, 2h and 10h. All FKs left NULL on purpose —
    -- nothing real is borrowed. Sentinel identity lives in raw_payload.
    INSERT INTO public.hr_attendance_exceptions
      (exception_date, exception_type, raw_payload, resolution_status,
       created_at, resolved_at)
    VALUES
      ('1997-01-07', 'single_punch_day',
       '{"zzregress": true, "runner": "fn_loops_regress_ops_cycletime"}'::jsonb,
       'resolved', '1997-01-07 00:00:00+00', '1997-01-07 01:00:00+00'),
      ('1997-01-07', 'single_punch_day',
       '{"zzregress": true, "runner": "fn_loops_regress_ops_cycletime"}'::jsonb,
       'resolved', '1997-01-07 00:00:00+00', '1997-01-07 02:00:00+00'),
      ('1997-01-07', 'single_punch_day',
       '{"zzregress": true, "runner": "fn_loops_regress_ops_cycletime"}'::jsonb,
       'resolved', '1997-01-07 00:00:00+00', '1997-01-07 10:00:00+00');

    -- Assert B: re-measure the same window through the same fn (the upsert
    -- overwrites A's sentinel-window row — no reset needed between deltas).
    v_res := public.fn_loops_measure_ops_cycletime('hr_attendance_exceptions', v_ws, v_we);
    IF NOT COALESCE((v_res ->> 'success')::boolean, false) THEN
      RAISE EXCEPTION 'measure (known-delta) returned success=false: %', v_res::text;
    END IF;
    v_b_n      := (v_res ->> 'resolved_n')::numeric;
    v_b_median := (v_res ->> 'median_seconds')::numeric;
    v_b_p90    := (v_res ->> 'p90_seconds')::numeric;

    -- Roll the seeds back. Everything above un-happens; captures survive.
    RAISE EXCEPTION 'LOOPS_REGRESS_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'LOOPS_REGRESS_ROLLBACK' THEN
      v_err := SQLERRM;   -- real failure: seeds still rolled back with the block
    END IF;
  END;

  v_verdict := CASE
    WHEN v_err IS NOT NULL THEN 'sim-error: ' || left(v_err, 180)
    WHEN v_a_n = 0 AND v_a_median = 'null'::jsonb
         AND v_sr_n = 0 AND v_ra_n = 0 AND v_vocab_ok
         AND v_b_n = 3 AND v_b_median = 7200.00 AND v_b_p90 = 30240.00
      THEN 'measure-verified'
    ELSE 'sim-failed'
  END;

  -- The only persistent write: the verdict, visible on /admin/loops.
  INSERT INTO public.loop_audits (loop_key, layer, verdict, evidence)
  VALUES ('ops-cycletime', 'sim', v_verdict,
          jsonb_build_object(
            'no_change_resolved_n',   v_a_n,
            'no_change_median',       v_a_median,
            'known_delta_resolved_n', v_b_n,
            'known_delta_median',     v_b_median,
            'known_delta_p90',        v_b_p90,
            'dispatch_sr_n',          v_sr_n,
            'dispatch_ra_n',          v_ra_n,
            'vocabulary_closed',      v_vocab_ok,
            'runner', 'fn_loops_regress_ops_cycletime'));

  RETURN QUERY SELECT 'ops-cycletime'::text, v_verdict, v_a_n, v_b_median;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_loops_regress_ops_cycletime() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_loops_regress_ops_cycletime() TO service_role;

NOTIFY pgrst, 'reload schema';
