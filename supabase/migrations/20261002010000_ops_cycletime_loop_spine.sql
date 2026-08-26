-- =============================================================================
-- 20261002010000_ops_cycletime_loop_spine.sql
-- Ops cycle-time loop family — ONE shared measurement component over THREE
-- operational queues (loop-program master spec 2026-08-13, Wave 2 row
-- "Ops cycle-time family"; Q2 twin rule: shared component, not three copies).
--
-- FILE ONLY / NOT APPLIED — prod apply is Director-gated.
--
-- WHAT THIS IS: the family's measurement leg and nothing else. Three queues —
-- service_requests, hr_attendance_exceptions, resource_approvals — each hold
-- open→resolution work, and none of them has ever had its cycle time measured.
-- This migration adds:
--   1. ops_cycletime_queues        — the queue switchboard (config rows: which
--                                    queues the family measures; is_active gates).
--   2. ops_cycletime_measurements  — the family's memory: one row per
--                                    (queue, window), median + p90 cycle seconds.
--   3. fn_loops_measure_ops_cycletime(queue, window) — the SINGLE measurer.
--                                    Per-queue open/close semantics live as three
--                                    small extraction branches INSIDE this one
--                                    function; the window filter, percentile math
--                                    and upsert exist exactly once. That is the
--                                    twin rule made structural: adding a queue is
--                                    a config row + one extraction branch, never
--                                    a copied service.
--   4. loop_registry seed 'ops-cycletime' — ONE row for the family (the shared
--                                    component is the loop; the queues are its
--                                    surfaces). Charter legs deliberately NULL —
--                                    RECEIPTS RULE (loop-constitution
--                                    20260726012000): a leg is written only when
--                                    it demonstrably runs in prod data. Until
--                                    then the Tower calls this a METER, honestly.
--
-- MEASUREMENT ONLY: no interventions, no notifications, no schedule row. The
-- return edge (nudging slow queues, re-measuring the delta) is a Wave-3
-- follow-up; wiring a dispatcher routine is part of that PR, not this one.
--
-- CONFIG-DRIFT GUARD (the confident-liar class loops-regress exists to catch):
-- the measurer REFUSES a queue_key that has a config row but no extraction
-- branch — a row added to the switchboard without teaching the measurer would
-- otherwise measure an empty set and report it as truth.
--
-- Open/close semantics per queue (assumptions stated, columns verified against
-- jicate/main DDL 2026-08-26 — supabase/setup/01_tables.sql for
-- service_requests + resource_approvals, 20260429000001 for
-- hr_attendance_exceptions):
--   service_requests         open  = COALESCE(submitted_at, created_at), drafts
--                                    excluded (a draft is not queue work).
--                            close = LEAST(fulfilled_at, closed_at) while status
--                                    IN ('fulfilled','closed'). 'rejected' and
--                                    'cancelled' are exits, not resolutions —
--                                    they carry no resolution timestamp and are
--                                    excluded from both cycle time and backlog.
--   hr_attendance_exceptions open  = created_at.
--                            close = resolved_at while resolution_status IN
--                                    ('resolved','ignored') — ignoring IS a
--                                    resolution decision; a reopened row
--                                    (status back to 'open') stops counting.
--   resource_approvals       open  = created_at.
--                            close = LEAST(approved_at, rejected_at) — an
--                                    approval decided either way is resolved;
--                                    escalation does not close. (status is an
--                                    unconstrained VARCHAR here; timestamps are
--                                    the record.)
-- =============================================================================

-- ── 1. Queue switchboard ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ops_cycletime_queues (
  queue_key     text PRIMARY KEY,
  display_name  text NOT NULL,
  source_table  text NOT NULL,
  -- Documentation of the open/close rule this queue's measure branch encodes.
  -- The EXECUTABLE truth is fn_loops_measure_ops_cycletime; these columns exist
  -- so an auditor can diff intent against implementation without reading plpgsql.
  opened_rule   text NOT NULL,
  closed_rule   text NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ops_cycletime_queues IS
  'Ops cycle-time loop family: which operational queues the shared measurer covers. Adding a queue = one row here + one extraction branch in fn_loops_measure_ops_cycletime (the fn refuses a row it has no branch for). Added 2026-08-26 (loop program Wave 2).';

-- ── 2. Measurement memory ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ops_cycletime_measurements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_key       text NOT NULL REFERENCES public.ops_cycletime_queues(queue_key) ON DELETE CASCADE,
  window_start    timestamptz NOT NULL,
  window_end      timestamptz NOT NULL,
  resolved_n      integer NOT NULL,      -- items whose resolution landed inside the window
  open_backlog_n  integer NOT NULL,      -- items opened by window_end and still open at window_end
  median_seconds  numeric,               -- NULL when resolved_n = 0 (never 0-as-fake-number)
  p90_seconds     numeric,               -- NULL when resolved_n = 0
  measured_at     timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ops_ct_meas_window_chk CHECK (window_end > window_start),
  UNIQUE (queue_key, window_start, window_end)
);

COMMENT ON TABLE public.ops_cycletime_measurements IS
  'Ops cycle-time loop family measurements: one row per (queue, window) — open→resolution cycle time median + p90 in seconds, resolution-cohort semantics (an item belongs to the window its RESOLUTION landed in). Re-measuring the same window upserts. Written only by fn_loops_measure_ops_cycletime. Added 2026-08-26.';

CREATE INDEX IF NOT EXISTS idx_ops_ct_meas_queue_window
  ON public.ops_cycletime_measurements (queue_key, window_start DESC);

-- ── 3. RLS — admin-only reads; writes are service_role/definer-only ──────────
-- Same posture as the loop_registry family (20260710233000): governance
-- surfaces, no institution scope, no INSERT/UPDATE/DELETE policies at all.

ALTER TABLE public.ops_cycletime_queues       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_cycletime_measurements ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname='ops_ct_queues_select_admin') THEN
    CREATE POLICY "ops_ct_queues_select_admin" ON public.ops_cycletime_queues
      FOR SELECT USING ((SELECT is_super_admin()) OR (SELECT is_admin()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname='ops_ct_meas_select_admin') THEN
    CREATE POLICY "ops_ct_meas_select_admin" ON public.ops_cycletime_measurements
      FOR SELECT USING ((SELECT is_super_admin()) OR (SELECT is_admin()));
  END IF;
END $$;

-- Supabase default-grants ALL on new tables to anon + authenticated; say what
-- we mean: SELECT for authenticated (RLS still gates to admins), nothing else.
REVOKE ALL ON public.ops_cycletime_queues, public.ops_cycletime_measurements
  FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.ops_cycletime_queues, public.ops_cycletime_measurements
  TO authenticated;

-- ── 4. The single measurer ───────────────────────────────────────────────────
-- Returns jsonb (same shape family as fn_bug_fix_outcome_record): callers read
-- {success, queue_key, window_start, window_end, resolved_n, open_backlog_n,
--  median_seconds, p90_seconds}. NULL medians stay NULL — a queue that resolved
-- nothing in the window reports "no number", never a fabricated 0.

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
      LEAST(ra.approved_at, ra.rejected_at),
      (ra.approved_at IS NULL AND ra.rejected_at IS NULL)
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

-- Anon-lock (Supabase default-grants anon EXECUTE on every new function).
-- service_role-only on purpose: the callers are the loops service
-- (lib/services/loops/ops-cycle-time.ts, service-role client) and the regress
-- runner (SECURITY DEFINER) — no browser caller exists, so authenticated gets
-- nothing to hold.
REVOKE EXECUTE ON FUNCTION public.fn_loops_measure_ops_cycletime(text, timestamptz, timestamptz)
  FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_loops_measure_ops_cycletime(text, timestamptz, timestamptz)
  TO service_role;

-- ── 5. Seeds ─────────────────────────────────────────────────────────────────
-- Identity-keyed ON CONFLICT DO NOTHING — immune to the mutable-column
-- seed-resurrection class; a Director edit to a row is never overwritten by
-- a replay.

INSERT INTO public.ops_cycletime_queues
  (queue_key, display_name, source_table, opened_rule, closed_rule, is_active) VALUES
  ('service_requests', 'Service requests', 'service_requests',
   'COALESCE(submitted_at, created_at); drafts excluded',
   'LEAST(fulfilled_at, closed_at) while status IN (fulfilled, closed); rejected/cancelled are exits, not resolutions',
   true),
  ('hr_attendance_exceptions', 'HR attendance exceptions', 'hr_attendance_exceptions',
   'created_at',
   'resolved_at while resolution_status IN (resolved, ignored) — ignoring is a resolution decision',
   true),
  ('resource_approvals', 'Resource approvals', 'resource_approvals',
   'created_at',
   'LEAST(approved_at, rejected_at) — decided either way is resolved; escalation does not close',
   true)
ON CONFLICT (queue_key) DO NOTHING;

-- ONE registry row for the family: the shared measurer is the loop, the three
-- queues are its surfaces (contrast 20260816024500's per-child rows, where each
-- of the thirteen was a genuinely different mechanism — here the mechanism is
-- identical and only the extraction config differs, which is the twin rule's
-- whole point). Charter legs stay NULL until each demonstrably runs in prod
-- data (RECEIPTS RULE, 20260726012000); gates all 'off' because nothing about
-- this family is live until this file is applied and a schedule exists — the
-- Tower may call it a meter without apology.
INSERT INTO public.loop_registry
  (loop_key, name, stack_tier, loop_class, domain, description, gates, routine_id, owner_email, is_active)
VALUES
  ('ops-cycletime', 'Ops Cycle-Time Family', 3, 'accountability', 'operations',
   'ONE shared measurer over three operational queues (service_requests, hr_attendance_exceptions, resource_approvals): open→resolution cycle time, median + p90 per window, written to ops_cycletime_measurements. Wave-2 scope is MEASUREMENT ONLY — the return edge (nudging slow queues, re-measuring the delta) is the Wave-3 follow-up.',
   '{"g":"off","a":"off","m":"off","f":"off"}'::jsonb,
   NULL, 'aieee@jkkn.ac.in', true)
ON CONFLICT (loop_key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
