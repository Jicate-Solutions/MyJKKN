-- ============================================================================
-- CO/PO Attainment Loop — below-target course alerts to Principals
-- File: 20260710041000_copo_below_target_alerts.sql | Date: 2026-07-10
-- Director decisions 2026-07-10 (verbatim): "Principal only"; "Steady alerts"
--   = a course must be below target 2 weekly runs IN A ROW to enter the list,
--   and leadership is messaged ONLY when the list CHANGES — a course enters
--   or recovers.
--
-- WHY NEW STATE: obe_course_attainment_rollup keeps ONE row per
-- institution × course_code × session, UPSERTED IN PLACE on every weekly run
-- (fn_copo_record_course_attainment sets computed_at=now()) — run history is
-- NOT retained, so "2 consecutive runs" needs its own state table.
--
-- WHAT THIS ADDS
--   1. Config row copo_attainment.alert_consecutive_runs (global, 2) — the
--      "2 weekly runs in a row" number is itself a Director-ratifiable row
--      (config-table pattern).
--   2. copo_below_target_state — one row per institution × course_code:
--      consecutive below-target run count, whether currently in the alert
--      list, entered/recovered timestamps, snapshot of the last-seen rollup.
--      UNIQUE key uses only NOT NULL columns
--      (feedback_nullable_unique_index_upsert_duplicates).
--   3. fn_copo_track_below_target() — ingests current rollups (CONFIDENT
--      institution stamps only: metadata.institution_match IN
--      ('unique_course_match','manual_assignment') — alerting a possibly-wrong
--      Principal is worse than waiting), increments/resets streaks, computes
--      list transitions, returns per-institution changes jsonb for the cron
--      to fan out. IDEMPOTENT WITHIN A RUN: each state row remembers the
--      run key (session_code + rollup computed_at) it last consumed; calling
--      the fn twice in one run does not double-increment.
--
-- SECURITY (CLAUDE.md 2026-06-06 + copo spine 20260709031000 pattern): the fn
-- is SECURITY DEFINER SET search_path=public, REVOKEd from anon,
-- authenticated AND PUBLIC, GRANTed to service_role ONLY (cron-only;
-- GRANT-level gate — no auth.uid() check so Management-API validation works).
-- State-table writes happen only through the DEFINER RPC.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Config row — "Steady alerts" consecutive-runs requirement.
-- ----------------------------------------------------------------------------
INSERT INTO public.platform_policies
  (policy_key, scope_type, value, data_type, classification, publication_state, is_active, description)
VALUES
  ('copo_attainment.alert_consecutive_runs', 'global', '2'::jsonb, 'number', 'major', 'published', true,
   'How many consecutive weekly attainment runs a course must be below target before it ENTERS the Principal alert list. RATIFIED by Director 2026-07-10 ("Steady alerts": below target 2 weekly runs in a row to enter; leadership messaged only when the list changes).')
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. copo_below_target_state — the loop's alert-list memory.
--    UNIQUE (institution_id, course_code): both NOT NULL, no nullable column
--    in the key.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.copo_below_target_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  course_code text NOT NULL,
  course_name text,
  program_code text,

  -- streak + list membership
  consecutive_below_runs integer NOT NULL DEFAULT 0,
  in_alert_list boolean NOT NULL DEFAULT false,
  entered_alert_at timestamptz,
  recovered_at timestamptz,

  -- idempotency: the run identity (session_code@computed_at) last consumed.
  -- The weekly upsert stamps a fresh computed_at, so each run has a new key;
  -- a second fn call in the same run sees an unchanged key and skips.
  last_run_key text NOT NULL,

  -- snapshot of the rollup as last evaluated (for the notification content)
  last_session_code text,
  last_attainment_pct numeric,
  last_attainment_level smallint,
  last_attainment_basis text,
  last_threshold_pct_used numeric,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, course_code)
);

COMMENT ON TABLE public.copo_below_target_state IS
  'CO/PO attainment loop — below-target alert-list state per institution × course (Director 2026-07-10: "Principal only" + "Steady alerts"). A course ENTERS the list after copo_attainment.alert_consecutive_runs consecutive weekly runs below copo_attainment.target_level, RECOVERS when back at/above; Principals are notified only on list CHANGES. Writes only via fn_copo_track_below_target (service_role). Rollup runs are upserted in place, so this table is the only run-over-run memory. Added 2026-07-10.';

CREATE INDEX IF NOT EXISTS idx_cbts_inst_in_list
  ON public.copo_below_target_state (institution_id, in_alert_list);

ALTER TABLE public.copo_below_target_state ENABLE ROW LEVEL SECURITY;

-- READ: accreditation viewers, institution-scoped (mirrors ocar_select on the
-- rollup table). WRITES: none (RPC-only).
DROP POLICY IF EXISTS "cbts_select" ON public.copo_below_target_state;
CREATE POLICY "cbts_select" ON public.copo_below_target_state
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.view')
      AND role_has_institution_access(institution_id))
);

-- ----------------------------------------------------------------------------
-- 3. fn_copo_track_below_target — streaks, transitions, per-institution
--    changes. Called by /api/cron/copo-attainment after the evidence emit.
--
--    Course universe per call = the CURRENT rollup per institution × course
--    (DISTINCT ON ... ORDER BY computed_at DESC), evaluable
--    (attainment_level NOT NULL) and CONFIDENT (institution_match IN
--    ('unique_course_match','manual_assignment')). Courses absent from the
--    current run (stale computed_at ⇒ unchanged run key) and courses whose
--    stamp turns uncertain are left FROZEN — no increment, no reset, no
--    false recovery.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_copo_track_below_target()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
  v_target smallint;
  v_needed integer;
  r record;
  st public.copo_below_target_state%ROWTYPE;
  v_has_state boolean;
  v_was_in boolean;
  v_now_in boolean;
  v_new_consec integer;
  v_entry jsonb;
  v_changes jsonb := '{}'::jsonb;   -- { institution_id: { entered: [...], recovered: [...] } }
  v_evaluated integer := 0;
  v_incremented integer := 0;
  v_reset integer := 0;
  v_entered integer := 0;
  v_recovered integer := 0;
  v_skipped_same_run integer := 0;
BEGIN
  v_enabled := COALESCE((SELECT (value #>> '{}')::boolean
                         FROM public.platform_policies
                         WHERE policy_key = 'copo_attainment.master_enabled'
                           AND scope_type = 'global' AND is_active), false);
  IF NOT v_enabled THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'master_disabled',
                              'entered', 0, 'recovered', 0, 'changes', '{}'::jsonb);
  END IF;

  v_target := COALESCE((SELECT (value #>> '{}')::smallint
                        FROM public.platform_policies
                        WHERE policy_key = 'copo_attainment.target_level'
                          AND scope_type = 'global' AND is_active), 2);
  v_needed := GREATEST(1, COALESCE((SELECT (value #>> '{}')::integer
                        FROM public.platform_policies
                        WHERE policy_key = 'copo_attainment.alert_consecutive_runs'
                          AND scope_type = 'global' AND is_active), 2));

  FOR r IN
    SELECT DISTINCT ON (o.institution_id, o.course_code)
      o.institution_id, o.course_code, o.course_name, o.program_code,
      o.session_code, o.attainment_pct, o.attainment_level, o.attainment_basis,
      o.threshold_pct_used, o.computed_at,
      (o.session_code || '@' ||
       to_char(o.computed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')) AS run_key
    FROM public.obe_course_attainment_rollup o
    WHERE o.attainment_level IS NOT NULL
      AND (o.metadata->>'institution_match') IN ('unique_course_match', 'manual_assignment')
    ORDER BY o.institution_id, o.course_code, o.computed_at DESC
  LOOP
    v_evaluated := v_evaluated + 1;

    SELECT * INTO st
    FROM public.copo_below_target_state s
    WHERE s.institution_id = r.institution_id
      AND s.course_code    = r.course_code
    FOR UPDATE;
    v_has_state := FOUND;

    -- Idempotency within a run: this rollup snapshot was already consumed.
    IF v_has_state AND st.last_run_key = r.run_key THEN
      v_skipped_same_run := v_skipped_same_run + 1;
      CONTINUE;
    END IF;

    IF r.attainment_level < v_target THEN
      -- BELOW target: extend the streak; enter the list at v_needed runs.
      v_new_consec := COALESCE(st.consecutive_below_runs, 0) + 1;
      v_was_in     := COALESCE(st.in_alert_list, false);
      v_now_in     := v_was_in OR (v_new_consec >= v_needed);

      IF v_has_state THEN
        UPDATE public.copo_below_target_state SET
          course_name              = COALESCE(r.course_name, course_name),
          program_code             = COALESCE(r.program_code, program_code),
          consecutive_below_runs   = v_new_consec,
          in_alert_list            = v_now_in,
          entered_alert_at         = CASE WHEN v_now_in AND NOT v_was_in THEN now() ELSE entered_alert_at END,
          recovered_at             = CASE WHEN v_now_in AND NOT v_was_in THEN NULL ELSE recovered_at END,
          last_run_key             = r.run_key,
          last_session_code        = r.session_code,
          last_attainment_pct      = r.attainment_pct,
          last_attainment_level    = r.attainment_level,
          last_attainment_basis    = r.attainment_basis,
          last_threshold_pct_used  = r.threshold_pct_used,
          updated_at               = now()
        WHERE id = st.id;
      ELSE
        INSERT INTO public.copo_below_target_state
          (institution_id, course_code, course_name, program_code,
           consecutive_below_runs, in_alert_list, entered_alert_at,
           last_run_key, last_session_code, last_attainment_pct,
           last_attainment_level, last_attainment_basis, last_threshold_pct_used)
        VALUES
          (r.institution_id, r.course_code, r.course_name, r.program_code,
           v_new_consec, v_now_in, CASE WHEN v_now_in THEN now() END,
           r.run_key, r.session_code, r.attainment_pct,
           r.attainment_level, r.attainment_basis, r.threshold_pct_used);
      END IF;
      v_incremented := v_incremented + 1;

      IF v_now_in AND NOT v_was_in THEN
        v_entered := v_entered + 1;
        v_entry := jsonb_build_object(
          'change', 'entered',
          'course_code', r.course_code,
          'course_name', r.course_name,
          'program_code', r.program_code,
          'session_code', r.session_code,
          'attainment_pct', r.attainment_pct,
          'attainment_level', r.attainment_level,
          'attainment_basis', r.attainment_basis,
          'threshold_pct_used', r.threshold_pct_used,
          'target_level', v_target,
          'consecutive_below_runs', v_new_consec
        );
        IF NOT (v_changes ? r.institution_id::text) THEN
          v_changes := v_changes || jsonb_build_object(r.institution_id::text, '{}'::jsonb);
        END IF;
        v_changes := jsonb_set(
          v_changes,
          ARRAY[r.institution_id::text, 'entered'],
          COALESCE(v_changes #> ARRAY[r.institution_id::text, 'entered'], '[]'::jsonb) || v_entry,
          true
        );
      END IF;

    ELSE
      -- AT/ABOVE target: reset the streak; emit recovery only if it was listed.
      IF v_has_state THEN
        v_was_in := st.in_alert_list;
        UPDATE public.copo_below_target_state SET
          course_name              = COALESCE(r.course_name, course_name),
          program_code             = COALESCE(r.program_code, program_code),
          consecutive_below_runs   = 0,
          in_alert_list            = false,
          recovered_at             = CASE WHEN v_was_in THEN now() ELSE recovered_at END,
          last_run_key             = r.run_key,
          last_session_code        = r.session_code,
          last_attainment_pct      = r.attainment_pct,
          last_attainment_level    = r.attainment_level,
          last_attainment_basis    = r.attainment_basis,
          last_threshold_pct_used  = r.threshold_pct_used,
          updated_at               = now()
        WHERE id = st.id;
        v_reset := v_reset + 1;

        IF v_was_in THEN
          v_recovered := v_recovered + 1;
          v_entry := jsonb_build_object(
            'change', 'recovered',
            'course_code', r.course_code,
            'course_name', r.course_name,
            'program_code', r.program_code,
            'session_code', r.session_code,
            'attainment_pct', r.attainment_pct,
            'attainment_level', r.attainment_level,
            'attainment_basis', r.attainment_basis,
            'threshold_pct_used', r.threshold_pct_used,
            'target_level', v_target
          );
          IF NOT (v_changes ? r.institution_id::text) THEN
            v_changes := v_changes || jsonb_build_object(r.institution_id::text, '{}'::jsonb);
          END IF;
          v_changes := jsonb_set(
            v_changes,
            ARRAY[r.institution_id::text, 'recovered'],
            COALESCE(v_changes #> ARRAY[r.institution_id::text, 'recovered'], '[]'::jsonb) || v_entry,
            true
          );
        END IF;
      END IF;
      -- No state row + at/above target ⇒ nothing to track (keeps the table
      -- to courses that have actually been below target at least once).
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'skipped', false,
    'target_level', v_target,
    'runs_required', v_needed,
    'evaluated', v_evaluated,
    'incremented', v_incremented,
    'reset', v_reset,
    'entered', v_entered,
    'recovered', v_recovered,
    'skipped_same_run', v_skipped_same_run,
    'changes', v_changes
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_copo_track_below_target() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_copo_track_below_target() TO service_role;

COMMENT ON FUNCTION public.fn_copo_track_below_target() IS
  'CO/PO attainment loop — below-target alert-list tracker (Director 2026-07-10: "Principal only" + "Steady alerts"). Ingests the current rollup per institution × course (confident institution stamps only), extends/resets consecutive below-target streaks in copo_below_target_state, and returns per-institution ENTERED (after copo_attainment.alert_consecutive_runs consecutive runs) / RECOVERED changes for the cron to notify Principals. Idempotent within a run via last_run_key (session_code@computed_at). No-ops unless copo_attainment.master_enabled=true. service_role only (cron).';

-- Reload PostgREST's schema cache so the new RPC resolves immediately after a
-- raw Management-API apply (which does NOT auto-reload).
NOTIFY pgrst, 'reload schema';
