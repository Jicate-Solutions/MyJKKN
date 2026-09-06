-- ============================================================================
-- 20260929010000_attendance_intervention_return_edge.sql
-- ----------------------------------------------------------------------------
-- Attendance → intervention RETURN EDGE (Loop Program master spec, Wave 2 row
-- "Attendance → intervention": wire flag → nudge → measure attendance delta vs
-- the learner's OWN baseline).
--
-- WHAT EXISTS ALREADY (survey 2026-08-26 — this file builds NONE of it):
--   · FLAG  — the learner risk engine writes learner_risk_assessments daily
--             (attendance is a weighted factor; 20260525200000).
--   · NUDGE — /api/cron/learner-risk-notifications announces new/escalated/
--             worsening learners to their department head, ledgered one row
--             per (learner, day) in learner_risk_notification_log.
--   · RECORD (human half) — learner_interventions: staff-logged call/meeting/
--             referral rows with intervener_id + risk_score_at_time.
--
-- WHAT WAS MISSING — the return edge: nothing ever measured whether a nudge or
-- an intervention MOVED the learner's attendance. This file adds:
--   1. attendance_intervention_effects — one measurement row per nudge/
--      intervention: the learner's mark-level attendance % in the after-window
--      (t, t+after_days] vs their OWN baseline [t−baseline_days, t);
--      net_effect = after − baseline, percentage points. The Tower/audits read
--      this table (the loop's purpose table, mirroring the house shape of
--      induction_session_effectiveness / scf_ai_suggestions).
--   2. fn_attendance_measure_intervention_effect(...) — SECURITY DEFINER,
--      service-role only. Phase 1 enrolls unseen ledger/intervention rows as
--      pending; phase 2 measures pending rows whose after-window has elapsed.
--      Parses the VALIDATED student_attendance shape
--      {<session>:{students:[{student_id, status:'Present'}]}} (validated
--      against 751,435 prod marks in 20260716000000; the 20260525200000 MV's
--      legacy flat-format guess is deliberately not carried).
--   3. loop_registry seed 'attendance-intervention' — charter LEGS NULL on
--      purpose: MetaLoop drafts charters, humans sign (program rule #2).
--      Plus the measured_outcomes edge to the metaloop.
--   4. Parked dispatcher row 'attendance-intervention-measure'
--      (enabled=false, managed=false — the maxlane dark convention): the
--      lib/ai-routines registry entry is a shared-file follow-up; enabling a
--      managed row before the dispatcher can resolve it would only feed the
--      watchdog daily 'skipped: not in registry' alarms.
--
-- Windowing: day t itself (the nudge/intervention day) is in NEITHER window —
-- attendance on t is ambiguous about whether it preceded the nudge.
--
-- ⛔ NOT APPLIED by merging — prod apply is a separate, Director-gated step.
--    No BEGIN;/COMMIT; in this file, so a BEGIN..ROLLBACK rehearsal stays a
--    rehearsal.
-- ============================================================================

-- ── 1. Purpose table ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.attendance_intervention_effects (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id       uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  institution_id   uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  -- Which wire produced the intervention. source_id is polymorphic (points at
  -- learner_risk_notification_log.id or learner_interventions.id), so it
  -- deliberately carries NO FK; UNIQUE(source, source_id) is the dedupe spine.
  source           text NOT NULL CHECK (source IN ('risk_nudge','staff_intervention')),
  source_id        uuid NOT NULL,
  intervened_on    date NOT NULL,          -- anchor day t (ledger notified_on / intervention created day, UTC date)
  nudge_reason     text,                   -- ledger reason (new|escalated|worsening) or intervention_type
  intervener_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,  -- staff lane only; NULL for automated nudges
  baseline_days    smallint NOT NULL DEFAULT 14 CHECK (baseline_days > 0),
  after_days       smallint NOT NULL DEFAULT 14 CHECK (after_days > 0),
  -- Measurement (written by the measure fn only)
  baseline_marks   integer,
  baseline_present integer,
  baseline_rate    numeric(5,2),
  after_marks      integer,
  after_present    integer,
  after_rate       numeric(5,2),
  net_effect       numeric(6,2),           -- after_rate − baseline_rate, percentage points
  measure_status   text NOT NULL DEFAULT 'pending'
                   CHECK (measure_status IN ('pending','measured','insufficient')),
  measured_at      timestamptz,
  model            text,                   -- runner tag
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_id)
);

COMMENT ON TABLE public.attendance_intervention_effects IS
  'Attendance → intervention loop return edge: one row per risk nudge (learner_risk_notification_log) or staff intervention (learner_interventions), measuring the learner''s mark-level attendance % in (t, t+after_days] against their OWN baseline [t−baseline_days, t). net_effect = after − baseline in percentage points. Written only by fn_attendance_measure_intervention_effect (service role); read by /admin/loops-side audits. Day t is in neither window.';
COMMENT ON COLUMN public.attendance_intervention_effects.source_id IS
  'Polymorphic anchor: learner_risk_notification_log.id (source=risk_nudge) or learner_interventions.id (source=staff_intervention). No FK on purpose; UNIQUE(source, source_id) dedupes enrollment.';
COMMENT ON COLUMN public.attendance_intervention_effects.net_effect IS
  'after_rate − baseline_rate (percentage points), both rounded to 2dp first. NULL until measured; stays NULL on insufficient.';

CREATE INDEX IF NOT EXISTS idx_aie_pending
  ON public.attendance_intervention_effects (intervened_on)
  WHERE measure_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_aie_learner
  ON public.attendance_intervention_effects (learner_id, intervened_on DESC);

DROP TRIGGER IF EXISTS update_attendance_intervention_effects_updated_at
  ON public.attendance_intervention_effects;
CREATE TRIGGER update_attendance_intervention_effects_updated_at
  BEFORE UPDATE ON public.attendance_intervention_effects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS: admin-only reads; ALL writes via the service-role measure fn (no
-- INSERT/UPDATE/DELETE policies). Same posture as the loop_* config tables.
ALTER TABLE public.attendance_intervention_effects ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'attendance_intervention_effects_select_admin') THEN
    CREATE POLICY attendance_intervention_effects_select_admin
      ON public.attendance_intervention_effects
      FOR SELECT TO authenticated
      USING ((SELECT is_super_admin()) OR (SELECT is_admin()));
  END IF;
END $$;

-- Supabase default-grants ALL on new tables to anon + authenticated; say what
-- we mean: SELECT only, and only for authenticated (RLS still gates to admin).
REVOKE ALL ON public.attendance_intervention_effects FROM anon, authenticated, PUBLIC;
GRANT  SELECT ON public.attendance_intervention_effects TO authenticated;

-- ── 2. The measure fn (enroll + measure) ─────────────────────────────────────
-- p_today / p_effect_id exist for the known-delta regress sim
-- (fn_loops_regress_attendance, 20260929020000): p_effect_id scopes the sweep
-- to one row and SKIPS enrollment (so the sim never depends on the risk
-- ledger's presence and never sweeps real pending rows into its asserts);
-- p_today lets the sim anchor windows beyond max(attendance_date), where no
-- real mark can pollute an exact assert.

CREATE OR REPLACE FUNCTION public.fn_attendance_measure_intervention_effect(
  p_baseline_days integer DEFAULT 14,
  p_after_days    integer DEFAULT 14,
  p_min_marks     integer DEFAULT 4,
  p_today         date    DEFAULT current_date,
  p_effect_id     uuid    DEFAULT NULL
)
RETURNS TABLE(enrolled integer, measured integer, insufficient integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_enrolled     int := 0;
  v_measured     int := 0;
  v_insufficient int := 0;
  v_n            int;
BEGIN
  IF p_baseline_days < 1 OR p_after_days < 1 OR p_min_marks < 1 THEN
    RAISE EXCEPTION 'window/threshold parameters must be positive';
  END IF;

  -- Re-entrant within one transaction (the regress sim calls this twice in a
  -- subtransaction): ON COMMIT DROP alone drops at COMMIT, not at fn exit.
  DROP TABLE IF EXISTS _aie_pending, _aie_marks, _aie_agg;

  -- ── Phase 1: enroll unseen interventions/nudges as pending rows ────────────
  IF p_effect_id IS NULL THEN
    -- Staff-logged interventions (who = intervener_id, which = intervention_type).
    INSERT INTO public.attendance_intervention_effects
      (learner_id, institution_id, source, source_id, intervened_on,
       nudge_reason, intervener_id, baseline_days, after_days)
    SELECT li.learner_id, li.institution_id, 'staff_intervention', li.id,
           li.created_at::date, li.intervention_type, li.intervener_id,
           p_baseline_days, p_after_days
    FROM public.learner_interventions li
    WHERE li.created_at::date >= p_today - 120   -- bound the first-run backfill
    ON CONFLICT (source, source_id) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_enrolled := v_enrolled + v_n;

    -- Automated risk nudges (which = reason; the notification itself is the
    -- "who told whom" record via notification_id/recipient_count on the
    -- ledger). The ledger's migration is Director-gated and may not be applied
    -- yet — its absence must not break the staff lane.
    BEGIN
      INSERT INTO public.attendance_intervention_effects
        (learner_id, institution_id, source, source_id, intervened_on,
         nudge_reason, baseline_days, after_days)
      SELECT l.learner_id, l.institution_id, 'risk_nudge', l.id,
             l.notified_on, l.reason, p_baseline_days, p_after_days
      FROM public.learner_risk_notification_log l
      WHERE l.notified_on >= p_today - 120
        -- The ledger's own migration is not in this repo, so its constraints
        -- cannot be assumed: skip rows this table's NOT NULLs/FKs would reject.
        AND l.institution_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.learners_profiles lp WHERE lp.id = l.learner_id)
      ON CONFLICT (source, source_id) DO NOTHING;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_enrolled := v_enrolled + v_n;
    EXCEPTION WHEN undefined_table THEN
      NULL;  -- ledger not applied yet: staff_intervention lane still runs
    END;
  END IF;

  -- ── Phase 2: measure pending rows whose after-window has fully elapsed ─────
  CREATE TEMP TABLE _aie_pending ON COMMIT DROP AS
  SELECT e.id, e.learner_id, e.intervened_on, e.baseline_days, e.after_days
  FROM public.attendance_intervention_effects e
  WHERE e.measure_status = 'pending'
    AND (p_effect_id IS NULL OR e.id = p_effect_id)
    AND e.intervened_on + e.after_days <= p_today
  ORDER BY e.intervened_on ASC, e.id ASC
  LIMIT 500;   -- bounded batch; the daily sweep drains any backlog

  -- ONE parse over the union window for all pending learners (set-based on
  -- purpose — the per-row LATERAL-parse shape is the proven N+1 timeout class).
  -- Shape: {<session>:{students:[{student_id, status:'Present'}]}} — the
  -- 751,435-mark-validated parse of fn_college_day_attendance_rate.
  CREATE TEMP TABLE _aie_marks ON COMMIT DROP AS
  SELECT lower(elem->>'student_id')::uuid AS learner_id,
         sa.attendance_date,
         (lower(elem->>'status') = 'present') AS is_present
  FROM public.student_attendance sa
  CROSS JOIN LATERAL jsonb_each(sa.attendance_data) AS sess(skey, sval)
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(sess.sval->'students') = 'array'
         THEN sess.sval->'students' ELSE '[]'::jsonb END
  ) AS elem
  WHERE sa.attendance_date >= (SELECT min(p.intervened_on - p.baseline_days) FROM _aie_pending p)
    AND sa.attendance_date <= (SELECT max(p.intervened_on + p.after_days)    FROM _aie_pending p)
    AND lower(elem->>'student_id') ~ '^[0-9a-f-]{36}$'
    AND lower(elem->>'student_id') IN (SELECT p.learner_id::text FROM _aie_pending p);

  CREATE TEMP TABLE _aie_agg ON COMMIT DROP AS
  SELECT p.id,
         count(*) FILTER (WHERE m.attendance_date >= p.intervened_on - p.baseline_days
                            AND m.attendance_date <  p.intervened_on)                    AS b_total,
         count(*) FILTER (WHERE m.is_present
                            AND m.attendance_date >= p.intervened_on - p.baseline_days
                            AND m.attendance_date <  p.intervened_on)                    AS b_present,
         count(*) FILTER (WHERE m.attendance_date >  p.intervened_on
                            AND m.attendance_date <= p.intervened_on + p.after_days)     AS a_total,
         count(*) FILTER (WHERE m.is_present
                            AND m.attendance_date >  p.intervened_on
                            AND m.attendance_date <= p.intervened_on + p.after_days)     AS a_present
  FROM _aie_pending p
  LEFT JOIN _aie_marks m ON m.learner_id = p.learner_id
  GROUP BY p.id, p.intervened_on, p.baseline_days, p.after_days;

  -- Measured: both windows carry enough marks for the rate to mean something.
  UPDATE public.attendance_intervention_effects e
     SET baseline_marks   = a.b_total,
         baseline_present = a.b_present,
         baseline_rate    = round(100.0 * a.b_present / a.b_total, 2),
         after_marks      = a.a_total,
         after_present    = a.a_present,
         after_rate       = round(100.0 * a.a_present / a.a_total, 2),
         net_effect       = round(100.0 * a.a_present / a.a_total, 2)
                          - round(100.0 * a.b_present / a.b_total, 2),
         measure_status   = 'measured',
         measured_at      = now(),
         model            = 'fn_attendance_measure_intervention_effect'
    FROM _aie_agg a
   WHERE e.id = a.id
     AND a.b_total >= p_min_marks
     AND a.a_total >= p_min_marks;
  GET DIAGNOSTICS v_measured = ROW_COUNT;

  -- Insufficient: too few marks in either window. Counts are still recorded
  -- (the honest evidence of WHY), rates only where computable, net stays NULL.
  UPDATE public.attendance_intervention_effects e
     SET baseline_marks   = a.b_total,
         baseline_present = a.b_present,
         baseline_rate    = CASE WHEN a.b_total > 0
                                 THEN round(100.0 * a.b_present / a.b_total, 2) END,
         after_marks      = a.a_total,
         after_present    = a.a_present,
         after_rate       = CASE WHEN a.a_total > 0
                                 THEN round(100.0 * a.a_present / a.a_total, 2) END,
         net_effect       = NULL,
         measure_status   = 'insufficient',
         measured_at      = now(),
         model            = 'fn_attendance_measure_intervention_effect'
    FROM _aie_agg a
   WHERE e.id = a.id
     AND (a.b_total < p_min_marks OR a.a_total < p_min_marks);
  GET DIAGNOSTICS v_insufficient = ROW_COUNT;

  DROP TABLE IF EXISTS _aie_pending, _aie_marks, _aie_agg;

  RETURN QUERY SELECT v_enrolled, v_measured, v_insufficient;
END;
$function$;

COMMENT ON FUNCTION public.fn_attendance_measure_intervention_effect(integer, integer, integer, date, uuid) IS
  'Attendance → intervention return edge. Enrolls unseen learner_interventions + learner_risk_notification_log rows into attendance_intervention_effects (120-day lookback, UNIQUE(source,source_id) dedupe), then measures pending rows whose after-window elapsed: mark-level attendance % in (t, t+after_days] vs the learner''s own [t−baseline_days, t). p_today/p_effect_id exist for the weekly known-delta regress sim. Service-role only.';

REVOKE EXECUTE ON FUNCTION public.fn_attendance_measure_intervention_effect(integer, integer, integer, date, uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_attendance_measure_intervention_effect(integer, integer, integer, date, uuid) TO service_role;

-- ── 3. Registry: the loop row (charter legs NULL — MetaLoop drafts, humans
--       sign; this file NEVER writes outcome_metric/counter_metric/
--       intervention/baseline_window/remeasure_window) + the measured_outcomes
--       edge. Gates honest: flag+nudge run today (g,a on); measurement exists
--       only as machinery until this apply + the regress proves it (m off).

-- owner_email added 2026-08-26: the constitution's NOT NULL refuses owner-less
-- births and ON CONFLICT cannot rescue a NOT-NULL violation (proven at apply).
-- Director interim per the standing machine-born-loop ruling of 2026-08-26.
INSERT INTO public.loop_registry
  (loop_key, name, stack_tier, loop_class, domain, description, gates, routine_id, owner_email)
VALUES
  ('attendance-intervention', 'Attendance → Intervention Loop', 3, 'accountability', 'academic',
   'Attendance-weighted risk flags nudge department staff (learner-risk-staff-notifications); staff log interventions; each nudge/intervention''s attendance delta is measured against the learner''s own 14-day baseline in attendance_intervention_effects.',
   '{"g":"on","a":"on","m":"off","f":"off"}'::jsonb,
   'attendance-intervention-measure',
   'director@jkkn.ac.in')
ON CONFLICT (loop_key) DO NOTHING;

INSERT INTO public.loop_edges (from_key, to_key, what_flows, note, is_draft)
SELECT 'attendance-intervention', 'metaloop', 'measured_outcomes',
       'Per-nudge/per-intervention attendance deltas vs the learner''s own baseline (attendance_intervention_effects)',
       false
WHERE EXISTS (SELECT 1 FROM public.loop_registry WHERE loop_key = 'metaloop')
  AND EXISTS (SELECT 1 FROM public.loop_registry WHERE loop_key = 'attendance-intervention')
  AND NOT EXISTS (
    SELECT 1 FROM public.loop_edges
    WHERE from_key = 'attendance-intervention' AND to_key = 'metaloop'
      AND what_flows = 'measured_outcomes'
  );

-- ── 4. Dispatcher scheduling — deliberately NOT seeded here ─────────────────
-- The registry-cron-wiring invariant (build-time test) requires every
-- ai_routine_schedules seed to ship WITH its lib/ai-routines registry entry —
-- and that registry file is a cross-lane collision zone this PR must not
-- touch. The follow-up PR adds BOTH together: the registry entry for
-- 'attendance-intervention-measure' and its schedule seed (daily 10:07 IST,
-- minute_of_day 607). Until then the measure route exists but no clock fires
-- it; manual trigger via CRON_SECRET works for verification.

NOTIFY pgrst, 'reload schema';
