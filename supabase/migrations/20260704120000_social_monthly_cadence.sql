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
--   * PROJECTS : each dept-month links to a REQUIRED real project row
--                (projects.is_okr=true, project_type='okr_objective',
--                owner_staff_id=the dept HOD). OKR was absorbed into the
--                Projects module (locked 2026-05-31): objectives ARE projects,
--                key results ARE project_tasks, RACI lives on
--                project_task_assignees.role. The legacy okr_* objective tables
--                were dropped in prod — nothing here touches them.
--
-- Teeth: on a measured miss the linked project's rag_status is set amber/red so
-- the DORMANT project_at_risk auto-accountability rule (evaluateProjectTriggers)
-- would summon the HOD (owner_staff_id + task Accountable) to explain-or-meet.
-- That rule stays INACTIVE until the Director enables it in /meetings/triggers.
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
  -- ON DELETE RESTRICT (not CASCADE): the cadence ledger is the audit history of
  -- the reach loop; deleting the linked project must NOT silently erase it.
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,  -- the unified OKR objective (projects.is_okr=true)
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
CREATE INDEX IF NOT EXISTS idx_social_monthly_cadence_project
  ON public.social_monthly_cadence (project_id);

COMMENT ON TABLE public.social_monthly_cadence IS
  'Per-department monthly Instagram reach cadence ledger (objective -> baseline -> feedback -> action -> re-measure -> close). Reach snapshots come ONLY from ig_monthly_audit; feedback ONLY from feedback_events. project_id is REQUIRED and points at a real projects row (is_okr=true, project_type=okr_objective, owner=HOD) — the unified OKR objective; its rag_status carries the reach-vs-target teeth for the dormant project_at_risk meeting rule.';

-- Idempotent FK converge: if an earlier apply created this constraint with
-- ON DELETE CASCADE, drop + re-add it as RESTRICT so re-applying this migration
-- fixes the delete rule regardless of prior state (CREATE TABLE IF NOT EXISTS
-- above would otherwise leave a stale CASCADE constraint in place).
ALTER TABLE public.social_monthly_cadence
  DROP CONSTRAINT IF EXISTS social_monthly_cadence_project_id_fkey;
ALTER TABLE public.social_monthly_cadence
  ADD CONSTRAINT social_monthly_cadence_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE RESTRICT;

-- updated_at trigger (helper created by 20260131000000_create_okr_tables).
DROP TRIGGER IF EXISTS trg_social_monthly_cadence_updated_at ON public.social_monthly_cadence;
CREATE TRIGGER trg_social_monthly_cadence_updated_at
  BEFORE UPDATE ON public.social_monthly_cadence
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- project_id is IMMUTABLE post-insert. The UPDATE RLS policy lets a manage user
-- write the row via raw PostgREST; without this guard they could repoint
-- project_id at another project and have close/cron flip THAT project's RAG.
-- The RPC state machine never changes project_id, so this only blocks tampering.
CREATE OR REPLACE FUNCTION public.fn_social_cadence_guard_project_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.project_id IS DISTINCT FROM OLD.project_id THEN
    RAISE EXCEPTION 'social_monthly_cadence.project_id is immutable once set'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_social_monthly_cadence_project_immutable ON public.social_monthly_cadence;
CREATE TRIGGER trg_social_monthly_cadence_project_immutable
  BEFORE UPDATE ON public.social_monthly_cadence
  FOR EACH ROW EXECUTE FUNCTION public.fn_social_cadence_guard_project_id();

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

-- ── 3b. Ownership helper: fn_social_caller_owns_dept ────────────────────────
--    The Director-locked owner of a department's IG cadence is that dept's HOD
--    (scope='own'). The institution-level permission gate alone lets ANY manage
--    HOD in the tenant act on OTHER departments' accounts — this helper closes
--    that gap. Platform admins bypass; a NULL department (account not
--    dept-scoped) falls back to the institution gate the caller already passed.
--    DEFINER so it can read departments/staff regardless of the caller's own
--    row visibility. Caller "owns" a dept if they head it OR are active staff in it.
CREATE OR REPLACE FUNCTION public.fn_social_caller_owns_dept(p_department_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF is_super_admin() OR is_admin() THEN
    RETURN true;
  END IF;
  IF p_department_id IS NULL THEN
    RETURN true;  -- not department-scoped: institution gate already applied
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.departments d
    WHERE d.id = p_department_id AND d.head_of_department_id = v_uid
  ) OR EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.profile_id = v_uid
      AND s.department_id = p_department_id
      AND s.is_active = true
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_social_caller_owns_dept(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_social_caller_owns_dept(UUID) TO authenticated;

-- ── 4. Writer RPC: fn_social_cadence_open ───────────────────────────────────
--    Opens a dept-month cadence: snapshots the baseline reach from
--    ig_monthly_audit, creates (or links) the REQUIRED unified-OKR objective as
--    a real projects row (is_okr=true, project_type='okr_objective',
--    owner_staff_id=the dept HOD) + a key-result task with the HOD assigned
--    RACI Accountable (so the dormant project_at_risk meeting rule has a
--    subject + owner), then inserts the ledger row. Idempotent per (account, month).
CREATE OR REPLACE FUNCTION public.fn_social_cadence_open(
  p_account_id UUID,
  p_objective TEXT,
  p_cadence_month DATE DEFAULT NULL,
  p_project_id UUID DEFAULT NULL
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
  v_project_id UUID;
  v_task_id UUID;
  v_hod_staff_id UUID;
  v_type_id UUID;
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

  -- DARK self-gate: opening a NEW cycle requires social.cadence.enabled=true.
  -- Enforced HERE (not only in the TS API) so a direct PostgREST/RPC call cannot
  -- bypass the engine master switch. Ships DARK (default false).
  IF NOT COALESCE(fn_get_policy_bool('social.cadence.enabled', false, NULL), false) THEN
    RAISE EXCEPTION 'The monthly cadence engine is disabled (social.cadence.enabled=false)'
      USING ERRCODE = '42501';
  END IF;

  -- Department ownership: a scope='own' manager may only open a cadence for its
  -- OWN department's IG account (admins bypass; a NULL dept falls back to the
  -- institution gate above).
  IF NOT fn_social_caller_owns_dept(v_department_id) THEN
    RAISE EXCEPTION 'permission denied: you can only manage your own department''s Instagram cadence'
      USING ERRCODE = '42501';
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

  -- Resolve the dept HOD -> staff.id. departments.head_of_department_id is a
  -- PROFILE id; staff.profile_id links a profile to its staff row. Best-effort:
  -- when a dept has no HOD (or no active staff for that profile) the objective is
  -- still created with owner_staff_id NULL (no Accountable) so the loop never
  -- blocks — the missing owner just means the dormant rule has no HOD to summon.
  IF v_department_id IS NOT NULL THEN
    SELECT s.id INTO v_hod_staff_id
    FROM public.departments d
    JOIN public.staff s
      ON s.profile_id = d.head_of_department_id AND s.is_active = true
    WHERE d.id = v_department_id
    LIMIT 1;
  END IF;

  -- REQUIRED project link: create the unified-OKR objective as a real projects
  -- row (is_okr=true), or use the given one. OKR was absorbed into Projects
  -- (locked 2026-05-31) — objectives ARE projects, key results ARE tasks.
  IF p_project_id IS NULL THEN
    SELECT id INTO v_type_id FROM public.project_types WHERE key = 'okr_objective' LIMIT 1;

    INSERT INTO public.projects (
      title, description, project_type_id, institution_id, owner_staff_id,
      is_okr, rag_status, start_date, due_date, created_by
    ) VALUES (
      left('IG Cadence ' || to_char(v_month, 'Mon YYYY') || ' — ' || btrim(p_objective), 200),
      'Monthly Instagram reach objective for this department, driven by the Social Loop cadence engine. Reach is re-measured one calendar month on vs the baseline snapshot. Objective: ' || btrim(p_objective),
      v_type_id, v_institution_id, v_hod_staff_id,
      true, 'green', v_month, (v_month + INTERVAL '1 month' - INTERVAL '1 day')::date, v_uid
    )
    RETURNING id INTO v_project_id;

    -- Key result = a project_task; the HOD is its single RACI Accountable so the
    -- auto-accountability engine (task_overdue + project_at_risk) has a subject
    -- and one clear owner (mirrors TaskService.assign's one-Accountable invariant).
    INSERT INTO public.project_tasks (
      project_id, title, description, task_type, status_key, owner_staff_id,
      start_date, due_date, created_by
    ) VALUES (
      v_project_id,
      left('Grow monthly IG reach — ' || btrim(p_objective), 200),
      'Re-measured one calendar month on vs the baseline reach snapshot.',
      'key_result', 'todo', v_hod_staff_id,
      v_month, (v_month + INTERVAL '1 month' - INTERVAL '1 day')::date, v_uid
    )
    RETURNING id INTO v_task_id;

    IF v_hod_staff_id IS NOT NULL THEN
      INSERT INTO public.project_task_assignees (task_id, staff_id, role, assigned_by)
      VALUES (v_task_id, v_hod_staff_id, 'accountable', v_uid);
    END IF;
  ELSE
    -- Tenant guard (HIGH): an externally-supplied project_id must be a REAL OKR
    -- objective in THIS account's institution. Without this a scope='own' HOD
    -- could link ANY project in ANY tenant and have close/cron flip its RAG
    -- (cross-tenant write via this DEFINER function). Reject anything that is not
    -- an is_okr project in v_institution_id.
    IF NOT EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = p_project_id
        AND institution_id = v_institution_id
        AND is_okr = true
    ) THEN
      RAISE EXCEPTION 'project_id % is not an OKR objective in this institution', p_project_id
        USING ERRCODE = '42501';
    END IF;
    v_project_id := p_project_id;
  END IF;

  INSERT INTO public.social_monthly_cadence (
    institution_id, account_id, department_id, cadence_month, objective,
    baseline_reach, baseline_month, baseline_metrics_source,
    status, project_id, created_by
  ) VALUES (
    v_institution_id, p_account_id, v_department_id, v_month, btrim(p_objective),
    v_baseline_reach, v_month, v_metrics_source,
    'open', v_project_id, v_uid
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
  v_department_id UUID;
  v_status TEXT;
  v_row public.social_monthly_cadence;
BEGIN
  IF p_action IS NULL OR btrim(p_action) = '' THEN
    RAISE EXCEPTION 'An action description is required' USING ERRCODE = '22023';
  END IF;

  SELECT institution_id, department_id, status INTO v_institution_id, v_department_id, v_status
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

  -- Department ownership: a scope='own' manager may only act on its OWN dept.
  IF NOT fn_social_caller_owns_dept(v_department_id) THEN
    RAISE EXCEPTION 'permission denied: you can only manage your own department''s Instagram cadence'
      USING ERRCODE = '42501';
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
  v_pct NUMERIC;
  v_new_rag TEXT;
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

  -- Department ownership: a scope='own' manager may only close its OWN dept.
  IF NOT fn_social_caller_owns_dept(v_row.department_id) THEN
    RAISE EXCEPTION 'permission denied: you can only manage your own department''s Instagram cadence'
      USING ERRCODE = '42501';
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

  -- metrics_source guard -> unmeasurable (never a fabricated win OR "reach
  -- collapsed"). graph reach and business_discovery/NULL reach are DIFFERENT
  -- scales: comparing across the graph boundary in EITHER direction fabricates a
  -- delta. So any mismatch in graph-ness between baseline and re-measure is
  -- unmeasurable — this covers both a graph->business_discovery downgrade AND a
  -- business_discovery/NULL->graph upgrade (the latter would otherwise fake a
  -- green win). Plus the collapse guard (a 0 read against a >0 non-graph baseline).
  IF v_remeasure_reach IS NULL
     OR ((COALESCE(v_row.baseline_metrics_source, '') = 'graph') <> (COALESCE(v_current_source, '') = 'graph'))
     OR (COALESCE(v_row.baseline_reach, 0) > 0 AND COALESCE(v_remeasure_reach, 0) = 0 AND v_current_source <> 'graph')
  THEN
    v_final_status := 'unmeasurable';
    v_delta := NULL;
  ELSE
    v_final_status := 'closed';
    v_delta := v_remeasure_reach - COALESCE(v_row.baseline_reach, 0);
  END IF;

  -- TOCTOU guard: re-assert the row is still non-final in the UPDATE predicate
  -- (a concurrent close/dispatcher could have finalised it between the SELECT
  -- above and here). If it moved, 0 rows update -> raise instead of clobbering.
  UPDATE public.social_monthly_cadence
  SET remeasure_reach = v_remeasure_reach,
      remeasure_month = v_remeasure_month,
      remeasure_metrics_source = v_current_source,
      reach_delta = v_delta,
      learning = btrim(p_learning),
      status = v_final_status,
      updated_at = now()
  WHERE id = p_cadence_id
    AND status NOT IN ('closed', 'unmeasurable')
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cycle already finalised' USING ERRCODE = '22023';
  END IF;

  -- Teeth: reflect the measured reach-vs-target into the linked project's
  -- rag_status + percent_complete (the CANONICAL project RAG mechanism that
  -- evaluateProjectTriggers reads: green=0/amber=1/red=2, project_at_risk fires
  -- gte 2 = red). A hard miss goes RED so the DORMANT rule would summon the HOD
  -- to explain-or-meet; a soft miss is AMBER (informational at the default
  -- threshold); a win is GREEN. An 'unmeasurable' cycle NEVER fabricates a miss
  -- — the project RAG is left untouched (verify-not-trust).
  v_win_delta_pct := fn_get_policy_int('social.cadence.win_delta_pct', 10, NULL);
  IF v_final_status = 'closed' THEN
    IF COALESCE(v_row.baseline_reach, 0) > 0 THEN
      v_pct := (v_delta::numeric / v_row.baseline_reach) * 100;
      v_new_rag := CASE
        WHEN v_pct >= GREATEST(v_win_delta_pct, 1) THEN 'green'
        WHEN v_pct > 0 THEN 'amber'
        ELSE 'red'
      END;
      v_progress := LEAST(100, GREATEST(0,
        round(v_pct / (GREATEST(v_win_delta_pct, 1)::numeric) * 100, 2)));
    ELSE
      -- No baseline to compare (0 or NULL): any positive reach is a win; flat is
      -- amber (needs attention) but never red — there was nothing to miss against.
      v_new_rag := CASE WHEN COALESCE(v_delta, 0) > 0 THEN 'green' ELSE 'amber' END;
      v_progress := CASE WHEN COALESCE(v_delta, 0) > 0 THEN 100 ELSE 0 END;
    END IF;

    -- Tenant guard (HIGH): this DEFINER write bypasses projects RLS. NEVER flip
    -- the RAG of a project outside this cadence's institution. Defence-in-depth
    -- even though open validates the link and project_id is immutable.
    IF NOT EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = v_row.project_id AND institution_id = v_row.institution_id
    ) THEN
      RAISE EXCEPTION 'cadence project % is not in institution %', v_row.project_id, v_row.institution_id
        USING ERRCODE = '42501';
    END IF;

    UPDATE public.projects
    SET rag_status = v_new_rag,
        percent_complete = v_progress,
        updated_at = now()
    WHERE id = v_row.project_id
      AND institution_id = v_row.institution_id;
  END IF;

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
