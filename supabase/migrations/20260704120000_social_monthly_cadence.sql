-- =====================================================================
-- Department Instagram Monthly Cadence Engine — DB substrate (ships DARK)
-- Date: 2026-07-04
-- Spec: specs/dept-ig-monthly-cadence-2026-07-04.md (Director decisions LOCKED)
-- =====================================================================
-- Binds three EXISTING ingredients into the chair's per-department MONTHLY
-- loop (set objective -> measure reach -> read feedback -> act -> wait one
-- calendar month -> re-measure -> close):
--
--   * REACH    : read ONLY from ig_monthly_audit (the canonical monthly sink
--                written by /api/cron/instagram-monthly-audit). This engine
--                NEVER re-aggregates ig_post_metrics.
--   * FEEDBACK : read ONLY via feedback_events (the buildVoice() read path in
--                app/api/social/loop/route.ts); snapshotted at action time.
--   * OKR      : each dept-month links to a REQUIRED cycle_type='monthly' OKR
--                objective (Director locked "inside the OKR system").
--
-- Ships DARK: social.cadence.enabled defaults false; clock_mode locks to
-- 'calendar_month' for v1. This file is additive + idempotent (safe to
-- re-apply) and mutates NO existing production rows except merging two
-- permission keys into the HOD role (the locked owner decision).
--
-- House rules honoured:
--   * every new SECURITY DEFINER RPC ends: REVOKE anon,PUBLIC; GRANT authenticated.
--   * DEFINER writer RPCs self-gate (is_super_admin/is_admin OR
--     user_has_permission + role_has_institution_access) because DEFINER
--     bypasses RLS. RLS on the ledger mirrors the gate for direct PostgREST.
-- =====================================================================

-- ── 0. Extend OKR cycle grain with 'monthly' (additive enum change) ─────────
--    okr_objectives.cycle_type is ENUM okr_cycle_type (annual|quarterly|
--    semester). ADD VALUE IF NOT EXISTS is idempotent. The new label is never
--    USED as a literal at DDL-execution time in this migration (RPC bodies are
--    stored, parsed lazily at call time), so it is safe under a wrapping txn.
ALTER TYPE public.okr_cycle_type ADD VALUE IF NOT EXISTS 'monthly';

-- ── 1. Ledger table: social_monthly_cadence ────────────────────────────────
--    One row per (account_id, cadence_month). Reach/feedback columns are
--    SNAPSHOTS written from the canonical readers, never independent aggregates.
CREATE TABLE IF NOT EXISTS public.social_monthly_cadence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.ig_accounts(id) ON DELETE CASCADE,
  department_id UUID NULL REFERENCES public.departments(id) ON DELETE SET NULL,
  cadence_month DATE NOT NULL,                 -- first-of-month; aligns ig_monthly_audit.audit_month
  objective TEXT NOT NULL,                      -- the one objective for this dept-month
  baseline_reach BIGINT NULL,                  -- snapshot of ig_monthly_audit.total_reach at open
  baseline_month DATE NULL,
  baseline_metrics_source TEXT NULL,           -- ig_accounts.metrics_source captured at open (verify-not-trust)
  feedback_read_summary JSONB NULL,            -- LoopVoice snapshot at action time (feedback_events read)
  action_taken TEXT NULL,                      -- the "take action" leg, human-entered
  remeasure_reach BIGINT NULL,                 -- snapshot of next month's ig_monthly_audit.total_reach
  remeasure_month DATE NULL,
  remeasure_metrics_source TEXT NULL,          -- ig_accounts.metrics_source at re-measure
  reach_delta BIGINT NULL,                     -- remeasure_reach - baseline_reach (NULL when unmeasurable)
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','awaiting_close','closed','unmeasurable')),
  okr_objective_id UUID NOT NULL REFERENCES public.okr_objectives(id) ON DELETE CASCADE,
  learning TEXT NULL,                          -- the one human learning written at close
  created_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT social_monthly_cadence_account_month_uniq UNIQUE (account_id, cadence_month)
);

CREATE INDEX IF NOT EXISTS idx_social_monthly_cadence_account
  ON public.social_monthly_cadence (account_id, cadence_month DESC);
CREATE INDEX IF NOT EXISTS idx_social_monthly_cadence_institution
  ON public.social_monthly_cadence (institution_id);
CREATE INDEX IF NOT EXISTS idx_social_monthly_cadence_department
  ON public.social_monthly_cadence (department_id) WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_social_monthly_cadence_open
  ON public.social_monthly_cadence (status) WHERE status IN ('open','awaiting_close');
CREATE INDEX IF NOT EXISTS idx_social_monthly_cadence_okr
  ON public.social_monthly_cadence (okr_objective_id);

COMMENT ON TABLE public.social_monthly_cadence IS
  'Per-department monthly Instagram reach cadence ledger (objective -> baseline -> feedback -> action -> re-measure -> close). Reach snapshots come ONLY from ig_monthly_audit; feedback ONLY from feedback_events. okr_objective_id is REQUIRED (Director-locked OKR integration).';

-- updated_at trigger (helper created by 20260131000000_create_okr_tables).
DROP TRIGGER IF EXISTS trg_social_monthly_cadence_updated_at ON public.social_monthly_cadence;
CREATE TRIGGER trg_social_monthly_cadence_updated_at
  BEFORE UPDATE ON public.social_monthly_cadence
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 2. RLS — canonical dynamic-permission pattern (no hardcoded roles) ──────
ALTER TABLE public.social_monthly_cadence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS social_monthly_cadence_select ON public.social_monthly_cadence;
CREATE POLICY social_monthly_cadence_select ON public.social_monthly_cadence
  FOR SELECT TO authenticated
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('social.departments.view') AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS social_monthly_cadence_insert ON public.social_monthly_cadence;
CREATE POLICY social_monthly_cadence_insert ON public.social_monthly_cadence
  FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('social.departments.manage') AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS social_monthly_cadence_update ON public.social_monthly_cadence;
CREATE POLICY social_monthly_cadence_update ON public.social_monthly_cadence
  FOR UPDATE TO authenticated
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('social.departments.manage') AND role_has_institution_access(institution_id))
  )
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('social.departments.manage') AND role_has_institution_access(institution_id))
  );

-- anon hardening (Supabase default-grants anon ALL on new tables).
REVOKE ALL ON public.social_monthly_cadence FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.social_monthly_cadence TO authenticated;

-- ── 3. Reader RPC: fn_ig_monthly_reach — shared reach contract ──────────────
--    Thin STABLE reader over ig_monthly_audit so the ledger + UI share one
--    contract. DEFINER (bypasses ig_monthly_audit RLS) -> gates in-body.
CREATE OR REPLACE FUNCTION public.fn_ig_monthly_reach(
  p_account_id UUID,
  p_month DATE
)
RETURNS TABLE (
  audit_month DATE,
  total_reach BIGINT,
  total_impressions BIGINT,
  total_comments INTEGER,
  total_saves INTEGER,
  total_shares INTEGER,
  health_score NUMERIC,
  metrics_source TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_institution_id UUID;
  v_metrics_source TEXT;
BEGIN
  SELECT a.institution_id, a.metrics_source
    INTO v_institution_id, v_metrics_source
  FROM public.ig_accounts a
  WHERE a.id = p_account_id;

  IF v_institution_id IS NULL THEN
    RETURN;  -- unknown account -> zero rows
  END IF;

  IF NOT (
    is_super_admin() OR is_admin()
    OR (user_has_permission('social.departments.view') AND role_has_institution_access(v_institution_id))
  ) THEN
    RAISE EXCEPTION 'permission denied: social.departments.view required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    m.audit_month,
    m.total_reach,
    m.total_impressions,
    m.total_comments,
    m.total_saves,
    m.total_shares,
    m.health_score,
    v_metrics_source
  FROM public.ig_monthly_audit m
  WHERE m.ig_account_id = p_account_id
    AND m.audit_month = date_trunc('month', p_month)::date
  LIMIT 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ig_monthly_reach(UUID, DATE) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ig_monthly_reach(UUID, DATE) TO authenticated;

-- ── 4. Writer RPC: fn_social_cadence_open ───────────────────────────────────
--    Opens a dept-month cadence: snapshots the baseline reach from
--    ig_monthly_audit, creates (or links) the REQUIRED monthly OKR objective,
--    inserts the ledger row. Idempotent per (account, month).
CREATE OR REPLACE FUNCTION public.fn_social_cadence_open(
  p_account_id UUID,
  p_objective TEXT,
  p_cadence_month DATE DEFAULT NULL,
  p_okr_objective_id UUID DEFAULT NULL
)
RETURNS public.social_monthly_cadence
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_institution_id UUID;
  v_department_id UUID;
  v_metrics_source TEXT;
  v_month DATE;
  v_baseline_reach BIGINT;
  v_okr_id UUID;
  v_uid UUID := auth.uid();
  v_existing public.social_monthly_cadence;
  v_row public.social_monthly_cadence;
BEGIN
  IF p_objective IS NULL OR btrim(p_objective) = '' THEN
    RAISE EXCEPTION 'An objective is required to open a cadence' USING ERRCODE = '22023';
  END IF;

  SELECT a.institution_id, a.department_id, a.metrics_source
    INTO v_institution_id, v_department_id, v_metrics_source
  FROM public.ig_accounts a
  WHERE a.id = p_account_id;

  IF v_institution_id IS NULL THEN
    RAISE EXCEPTION 'Instagram account not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    is_super_admin() OR is_admin()
    OR (user_has_permission('social.departments.manage') AND role_has_institution_access(v_institution_id))
  ) THEN
    RAISE EXCEPTION 'permission denied: social.departments.manage required' USING ERRCODE = '42501';
  END IF;

  v_month := date_trunc('month', COALESCE(p_cadence_month, CURRENT_DATE))::date;

  -- Idempotent: return an existing cadence for (account, month) unchanged.
  SELECT * INTO v_existing
  FROM public.social_monthly_cadence
  WHERE account_id = p_account_id AND cadence_month = v_month;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  -- Baseline reach from the canonical monthly audit sink (NEVER re-aggregate).
  SELECT m.total_reach INTO v_baseline_reach
  FROM public.ig_monthly_audit m
  WHERE m.ig_account_id = p_account_id AND m.audit_month = v_month
  LIMIT 1;

  -- REQUIRED OKR link: create a monthly department objective, or use the given one.
  IF p_okr_objective_id IS NULL THEN
    INSERT INTO public.okr_objectives (
      title, description, tier, level, owner_id, institution_id, department_id,
      cycle_type, start_date, end_date, status, created_by
    ) VALUES (
      left('Social reach — ' || btrim(p_objective), 200),
      'Monthly Instagram reach cadence (auto-linked from the Social Loop). Objective: ' || btrim(p_objective),
      'tier_2', 'department', v_uid, v_institution_id, v_department_id,
      'monthly', v_month, (v_month + INTERVAL '1 month' - INTERVAL '1 day')::date,
      'active', v_uid
    )
    RETURNING id INTO v_okr_id;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.okr_objectives WHERE id = p_okr_objective_id) THEN
      RAISE EXCEPTION 'okr_objective_id % not found', p_okr_objective_id USING ERRCODE = 'P0002';
    END IF;
    v_okr_id := p_okr_objective_id;
  END IF;

  INSERT INTO public.social_monthly_cadence (
    institution_id, account_id, department_id, cadence_month, objective,
    baseline_reach, baseline_month, baseline_metrics_source,
    status, okr_objective_id, created_by
  ) VALUES (
    v_institution_id, p_account_id, v_department_id, v_month, btrim(p_objective),
    v_baseline_reach, v_month, v_metrics_source,
    'open', v_okr_id, v_uid
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_social_cadence_open(UUID, TEXT, DATE, UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_social_cadence_open(UUID, TEXT, DATE, UUID) TO authenticated;

-- ── 5. Writer RPC: fn_social_cadence_record_action ──────────────────────────
--    Records the action taken + the feedback (LoopVoice) snapshot at act time.
CREATE OR REPLACE FUNCTION public.fn_social_cadence_record_action(
  p_cadence_id UUID,
  p_action TEXT,
  p_feedback_summary JSONB DEFAULT NULL
)
RETURNS public.social_monthly_cadence
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_institution_id UUID;
  v_status TEXT;
  v_row public.social_monthly_cadence;
BEGIN
  IF p_action IS NULL OR btrim(p_action) = '' THEN
    RAISE EXCEPTION 'An action description is required' USING ERRCODE = '22023';
  END IF;

  SELECT institution_id, status INTO v_institution_id, v_status
  FROM public.social_monthly_cadence WHERE id = p_cadence_id;
  IF v_institution_id IS NULL THEN
    RAISE EXCEPTION 'Cadence cycle not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    is_super_admin() OR is_admin()
    OR (user_has_permission('social.departments.manage') AND role_has_institution_access(v_institution_id))
  ) THEN
    RAISE EXCEPTION 'permission denied: social.departments.manage required' USING ERRCODE = '42501';
  END IF;

  IF v_status NOT IN ('open', 'awaiting_close') THEN
    RAISE EXCEPTION 'Cannot record an action on a % cycle', v_status USING ERRCODE = '22023';
  END IF;

  UPDATE public.social_monthly_cadence
  SET action_taken = btrim(p_action),
      feedback_read_summary = COALESCE(p_feedback_summary, feedback_read_summary),
      updated_at = now()
  WHERE id = p_cadence_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_social_cadence_record_action(UUID, TEXT, JSONB) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_social_cadence_record_action(UUID, TEXT, JSONB) TO authenticated;

-- ── 6. Writer RPC: fn_social_cadence_close ──────────────────────────────────
--    Human close: computes the re-measure (from ig_monthly_audit, or reuses a
--    dispatcher-staged snapshot), applies the metrics_source guard, writes the
--    learning, finalises status, and feeds the linked OKR objective.
CREATE OR REPLACE FUNCTION public.fn_social_cadence_close(
  p_cadence_id UUID,
  p_learning TEXT
)
RETURNS public.social_monthly_cadence
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.social_monthly_cadence;
  v_remeasure_month DATE;
  v_remeasure_reach BIGINT;
  v_current_source TEXT;
  v_delta BIGINT;
  v_final_status TEXT;
  v_win_delta_pct INT;
  v_progress NUMERIC(5,2);
BEGIN
  IF p_learning IS NULL OR btrim(p_learning) = '' THEN
    RAISE EXCEPTION 'A one-line learning is required to close the cycle' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.social_monthly_cadence WHERE id = p_cadence_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cadence cycle not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    is_super_admin() OR is_admin()
    OR (user_has_permission('social.departments.manage') AND role_has_institution_access(v_row.institution_id))
  ) THEN
    RAISE EXCEPTION 'permission denied: social.departments.manage required' USING ERRCODE = '42501';
  END IF;

  IF v_row.status IN ('closed', 'unmeasurable') THEN
    RAISE EXCEPTION 'Cycle already finalised (%)', v_row.status USING ERRCODE = '22023';
  END IF;

  -- Re-measure month = one calendar month after the baseline/cadence month.
  v_remeasure_month := (v_row.cadence_month + INTERVAL '1 month')::date;

  -- Current metrics_source (verify-not-trust: may have reverted graph->business_discovery).
  SELECT a.metrics_source INTO v_current_source
  FROM public.ig_accounts a WHERE a.id = v_row.account_id;

  -- Re-measure reach from the canonical audit sink (reuse a dispatcher-staged value).
  IF v_row.remeasure_reach IS NOT NULL THEN
    v_remeasure_reach := v_row.remeasure_reach;
  ELSE
    SELECT m.total_reach INTO v_remeasure_reach
    FROM public.ig_monthly_audit m
    WHERE m.ig_account_id = v_row.account_id AND m.audit_month = v_remeasure_month
    LIMIT 1;
  END IF;

  -- metrics_source guard -> unmeasurable (never a fabricated "reach collapsed").
  IF v_remeasure_reach IS NULL
     OR (v_row.baseline_metrics_source = 'graph' AND v_current_source = 'business_discovery')
     OR (COALESCE(v_row.baseline_reach, 0) > 0 AND COALESCE(v_remeasure_reach, 0) = 0 AND v_current_source <> 'graph')
  THEN
    v_final_status := 'unmeasurable';
    v_delta := NULL;
  ELSE
    v_final_status := 'closed';
    v_delta := v_remeasure_reach - COALESCE(v_row.baseline_reach, 0);
  END IF;

  UPDATE public.social_monthly_cadence
  SET remeasure_reach = v_remeasure_reach,
      remeasure_month = v_remeasure_month,
      remeasure_metrics_source = v_current_source,
      reach_delta = v_delta,
      learning = btrim(p_learning),
      status = v_final_status,
      updated_at = now()
  WHERE id = p_cadence_id
  RETURNING * INTO v_row;

  -- Feed the linked OKR objective (progress vs the win threshold + complete on a measured close).
  v_win_delta_pct := fn_get_policy_int('social.cadence.win_delta_pct', 10, NULL);
  IF v_final_status = 'closed' AND COALESCE(v_row.baseline_reach, 0) > 0 THEN
    v_progress := LEAST(100, GREATEST(0,
      round((v_delta::numeric / v_row.baseline_reach) / (GREATEST(v_win_delta_pct, 1)::numeric / 100) * 100, 2)));
  ELSIF v_final_status = 'closed' THEN
    v_progress := CASE WHEN COALESCE(v_delta, 0) > 0 THEN 100 ELSE 0 END;
  ELSE
    v_progress := 0;  -- unmeasurable: leave progress at 0, do not fabricate
  END IF;

  UPDATE public.okr_objectives
  SET overall_progress = v_progress,
      status = CASE WHEN v_final_status = 'closed' THEN 'completed'::okr_status ELSE status END,
      updated_at = now()
  WHERE id = v_row.okr_objective_id;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_social_cadence_close(UUID, TEXT) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_social_cadence_close(UUID, TEXT) TO authenticated;

-- ── 7. Seed social.cadence.* config rows (ships DARK) ───────────────────────
--    is_system=true GLOBAL rows so the super-admin policy editor renders them.
INSERT INTO platform_policies (policy_key, scope_type, scope_id, value, description, data_type, enum_options, is_system) VALUES
('social.cadence.enabled', 'global', NULL, 'false'::jsonb,
  'Master switch for the Department Instagram monthly cadence engine. Ships DARK (false) — flip true only after Director review + jkknpharmacy pilot.',
  'boolean', NULL, true),

('social.cadence.clock_mode', 'global', NULL, '"calendar_month"'::jsonb,
  'Monthly clock for cadence cycles. v1 locks calendar_month (aligned to ig_monthly_audit.audit_month).',
  'enum', '["calendar_month","days_from_objective"]'::jsonb, true),

('social.cadence.period_days', 'global', NULL, '30'::jsonb,
  'Cycle length in days — used ONLY in days_from_objective clock mode (ignored under calendar_month).',
  'number', NULL, true),

('social.cadence.win_delta_pct', 'global', NULL, '10'::jsonb,
  'Minimum month-over-month reach uplift (%) for a cadence cycle to grade as a win.',
  'number', NULL, true)
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

-- ── 8. Owner grant (Director-locked): scope='own' HOD owns its dept cadence ──
--    Merge the two social.departments.* keys into the existing HOD permissions
--    JSONB (never clobber other keys). HOD is already institution_scope='own'
--    (20260506_fix_hod_role_and_user_roles_backfill) — scope is left untouched.
UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object(
      'social.departments.view', true,
      'social.departments.manage', true
    ),
    updated_at = now()
WHERE role_key = 'hod' AND is_active = true;

-- ── 9. Reload PostgREST schema cache so new table/RPCs are visible now. ──────
NOTIFY pgrst, 'reload schema';
