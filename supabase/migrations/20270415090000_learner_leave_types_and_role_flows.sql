-- ============================================================================
-- Learner Leave & On-Duty: one global leave-type list + role-based approval flows
-- ============================================================================
-- WHY (2026-09-28): learners could apply leave/OD in 7 places (academic
-- leave-onduty, campus-living hostel leave, hostel gate pass, service-request
-- gate pass, learners-council OD, parent-portal leave + gate pass) with 5
-- leave-type lists and 4 approval engines. Only leave_onduty_applications ever
-- reached academic attendance, and even that flow was stuck: 144 of 150
-- applications sat `pending` because
--   * flows pinned PEOPLE (approver_ids) — a person leaving stranded the chain;
--   * 71 applications got no approver row at all (no flow resolved);
--   * sponsor approval advanced current_step but never seeded approvers;
--   * approvers updated leave_onduty_applications from the browser, but the
--     only UPDATE policy admits profiles.role in (super_admin, admin,
--     institution_admin) — so an HOD/Principal "approve" was a silent no-op.
--
-- This migration introduces:
--   learner_leave_types       global list; residency (hostel/day_scholar/both)
--                             × category (leave/onduty) + per-type rules
--   learner_leave_flows       one flow per type; institution_id NULL = group
--                             default, non-NULL = that institution's override
--   learner_leave_flow_steps  role (custom_roles) + scope per step
-- and moves every approval state change behind SECURITY DEFINER RPCs that
-- derive the caller from auth.uid():
--   fn_lo_seed_approvals, fn_lo_decide, fn_lo_sponsor_decide,
--   fn_lo_my_approval_queue, fn_lo_save_flow (INVOKER — RLS applies).
--
-- A role step freezes NO person. It freezes the scope anchor (institution /
-- department / hostel block) at submit time; whoever holds the role in that
-- scope when the step is reached can act. The actor is stamped into
-- leave_onduty_approvals.approver_id.
-- ============================================================================

-- ─── Enums ──────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.learner_leave_residency AS ENUM ('hostel', 'day_scholar', 'both');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.learner_leave_step_scope AS ENUM
    ('own_department', 'own_institution', 'all_institutions', 'hostel_block');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── learner_leave_types ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.learner_leave_types (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                      text NOT NULL UNIQUE,
  name                      text NOT NULL,
  description               text,
  color_code                text NOT NULL DEFAULT '#6366f1',
  category                  public.leave_onduty_category NOT NULL,
  residency                 public.learner_leave_residency NOT NULL DEFAULT 'both',
  max_duration_days         integer CHECK (max_duration_days IS NULL OR max_duration_days > 0),
  advance_notice_hours      integer NOT NULL DEFAULT 0 CHECK (advance_notice_hours >= 0),
  requires_attachment       boolean NOT NULL DEFAULT false,
  allow_half_day            boolean NOT NULL DEFAULT true,
  allow_periodwise          boolean NOT NULL DEFAULT true,
  requires_sponsor_approval boolean NOT NULL DEFAULT false,
  sponsor_role_hint         text,
  affects_attendance        boolean NOT NULL DEFAULT true,
  is_active                 boolean NOT NULL DEFAULT true,
  sort_order                integer NOT NULL DEFAULT 0,
  created_by                uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by                uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.learner_leave_types ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_llt_created_by ON public.learner_leave_types(created_by);
CREATE INDEX IF NOT EXISTS idx_llt_updated_by ON public.learner_leave_types(updated_by);
CREATE INDEX IF NOT EXISTS idx_llt_active_cat_res
  ON public.learner_leave_types(category, residency) WHERE is_active;

-- ─── learner_leave_flows ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.learner_leave_flows (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_type_id  uuid NOT NULL REFERENCES public.learner_leave_types(id) ON DELETE CASCADE,
  -- NULL = the group-wide default flow for this type; a value = that
  -- institution's override. Modelled explicitly, never an RLS escape hatch:
  -- these rows are configuration, readable by every authenticated user.
  institution_id uuid REFERENCES public.institutions(id) ON DELETE CASCADE,
  is_active      boolean NOT NULL DEFAULT true,
  created_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learner_leave_flows_type_inst_key
    UNIQUE NULLS NOT DISTINCT (leave_type_id, institution_id)
);
ALTER TABLE public.learner_leave_flows ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_llf_institution ON public.learner_leave_flows(institution_id);
CREATE INDEX IF NOT EXISTS idx_llf_created_by ON public.learner_leave_flows(created_by);

-- ─── learner_leave_flow_steps ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.learner_leave_flow_steps (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id    uuid NOT NULL REFERENCES public.learner_leave_flows(id) ON DELETE CASCADE,
  step_order integer NOT NULL CHECK (step_order > 0),
  role_id    uuid NOT NULL REFERENCES public.custom_roles(id) ON DELETE RESTRICT,
  scope      public.learner_leave_step_scope NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learner_leave_flow_steps_flow_order_key UNIQUE (flow_id, step_order)
);
ALTER TABLE public.learner_leave_flow_steps ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_llfs_role ON public.learner_leave_flow_steps(role_id);

-- ─── updated_at triggers ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_llt_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_llt_updated_at ON public.learner_leave_types;
CREATE TRIGGER trg_llt_updated_at BEFORE UPDATE ON public.learner_leave_types
  FOR EACH ROW EXECUTE FUNCTION public.fn_llt_touch_updated_at();
DROP TRIGGER IF EXISTS trg_llf_updated_at ON public.learner_leave_flows;
CREATE TRIGGER trg_llf_updated_at BEFORE UPDATE ON public.learner_leave_flows
  FOR EACH ROW EXECUTE FUNCTION public.fn_llt_touch_updated_at();

-- ─── RLS: config is readable by all signed-in users, writable by the key ────
DROP POLICY IF EXISTS llt_select ON public.learner_leave_types;
CREATE POLICY llt_select ON public.learner_leave_types FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS llt_insert ON public.learner_leave_types;
CREATE POLICY llt_insert ON public.learner_leave_types FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.user_has_permission('learners.leave_types.manage')));
DROP POLICY IF EXISTS llt_update ON public.learner_leave_types;
CREATE POLICY llt_update ON public.learner_leave_types FOR UPDATE TO authenticated
  USING ((SELECT public.user_has_permission('learners.leave_types.manage')))
  WITH CHECK ((SELECT public.user_has_permission('learners.leave_types.manage')));
DROP POLICY IF EXISTS llt_delete ON public.learner_leave_types;
CREATE POLICY llt_delete ON public.learner_leave_types FOR DELETE TO authenticated
  USING ((SELECT public.user_has_permission('learners.leave_types.manage')));

DROP POLICY IF EXISTS llf_select ON public.learner_leave_flows;
CREATE POLICY llf_select ON public.learner_leave_flows FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS llf_insert ON public.learner_leave_flows;
CREATE POLICY llf_insert ON public.learner_leave_flows FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.user_has_permission('learners.leave_types.manage')));
DROP POLICY IF EXISTS llf_update ON public.learner_leave_flows;
CREATE POLICY llf_update ON public.learner_leave_flows FOR UPDATE TO authenticated
  USING ((SELECT public.user_has_permission('learners.leave_types.manage')))
  WITH CHECK ((SELECT public.user_has_permission('learners.leave_types.manage')));
DROP POLICY IF EXISTS llf_delete ON public.learner_leave_flows;
CREATE POLICY llf_delete ON public.learner_leave_flows FOR DELETE TO authenticated
  USING ((SELECT public.user_has_permission('learners.leave_types.manage')));

DROP POLICY IF EXISTS llfs_select ON public.learner_leave_flow_steps;
CREATE POLICY llfs_select ON public.learner_leave_flow_steps FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS llfs_insert ON public.learner_leave_flow_steps;
CREATE POLICY llfs_insert ON public.learner_leave_flow_steps FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.user_has_permission('learners.leave_types.manage')));
DROP POLICY IF EXISTS llfs_update ON public.learner_leave_flow_steps;
CREATE POLICY llfs_update ON public.learner_leave_flow_steps FOR UPDATE TO authenticated
  USING ((SELECT public.user_has_permission('learners.leave_types.manage')))
  WITH CHECK ((SELECT public.user_has_permission('learners.leave_types.manage')));
DROP POLICY IF EXISTS llfs_delete ON public.learner_leave_flow_steps;
CREATE POLICY llfs_delete ON public.learner_leave_flow_steps FOR DELETE TO authenticated
  USING ((SELECT public.user_has_permission('learners.leave_types.manage')));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.learner_leave_types      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.learner_leave_flows      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.learner_leave_flow_steps TO authenticated;
REVOKE ALL ON public.learner_leave_types, public.learner_leave_flows, public.learner_leave_flow_steps FROM anon;

-- ─── Existing tables: link to the new type + role-step columns ─────────────
ALTER TABLE public.leave_onduty_applications
  ADD COLUMN IF NOT EXISTS leave_type_id uuid REFERENCES public.learner_leave_types(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_loa_app_leave_type ON public.leave_onduty_applications(leave_type_id);

ALTER TABLE public.leave_onduty_approvals
  ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES public.custom_roles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scope public.learner_leave_step_scope,
  ADD COLUMN IF NOT EXISTS scope_institution_id uuid REFERENCES public.institutions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scope_department_id  uuid REFERENCES public.departments(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scope_block_id       uuid REFERENCES public.hostel_blocks(id) ON DELETE SET NULL;
-- A role step has no legacy approver_role (that enum only knows
-- faculty/hod/principal/super_admin); the role lives in role_id.
ALTER TABLE public.leave_onduty_approvals ALTER COLUMN approver_role DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_loapr_role ON public.leave_onduty_approvals(role_id);
CREATE INDEX IF NOT EXISTS idx_loapr_scope_inst ON public.leave_onduty_approvals(scope_institution_id);
CREATE INDEX IF NOT EXISTS idx_loapr_scope_dept ON public.leave_onduty_approvals(scope_department_id);
CREATE INDEX IF NOT EXISTS idx_loapr_scope_block ON public.leave_onduty_approvals(scope_block_id);
CREATE INDEX IF NOT EXISTS idx_loapr_pending_role
  ON public.leave_onduty_approvals(role_id, step_order) WHERE status = 'pending';

-- ─── fn_lo_can_act: may the caller act on this approval row? ───────────────
-- Scope rules for a role step (role_id set):
--   all_institutions : any holder of the role
--   own_institution  : holder whose profiles.institution_id = scope_institution_id
--   own_department   : ... and profiles.department_id = scope_department_id
--   hostel_block     : holder with an unrevoked block grant on scope_block_id
--                      (user_block_access) or an active hostel_wardens row
-- A pinned row (role_id NULL, legacy / forwarded) admits only its approver_id.
CREATE OR REPLACE FUNCTION public.fn_lo_can_act(p_approval_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  r     public.leave_onduty_approvals%ROWTYPE;
  v_inst uuid;
  v_dept uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;

  SELECT * INTO r FROM public.leave_onduty_approvals WHERE id = p_approval_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF r.role_id IS NULL THEN
    RETURN r.approver_id IS NOT DISTINCT FROM v_uid;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_uid AND ur.role_id = r.role_id
  ) THEN
    RETURN false;
  END IF;

  -- The applicant can never approve their own application.
  IF EXISTS (
    SELECT 1 FROM public.leave_onduty_applications a
    JOIN public.profiles p ON p.learner_id = a.learner_id
    WHERE a.id = r.application_id AND p.id = v_uid
  ) THEN
    RETURN false;
  END IF;

  SELECT p.institution_id, p.department_id INTO v_inst, v_dept
  FROM public.profiles p
  WHERE p.id = v_uid AND p.is_active AND NOT coalesce(p.is_login_disabled, false);
  IF NOT FOUND THEN RETURN false; END IF;

  RETURN CASE r.scope
    WHEN 'all_institutions' THEN true
    WHEN 'own_institution'  THEN v_inst IS NOT NULL AND v_inst = r.scope_institution_id
    WHEN 'own_department'   THEN v_inst IS NOT NULL AND v_inst = r.scope_institution_id
                                 AND v_dept IS NOT NULL AND v_dept = r.scope_department_id
    WHEN 'hostel_block'     THEN r.scope_block_id IS NOT NULL AND (
                                   EXISTS (SELECT 1 FROM public.user_block_access uba
                                           WHERE uba.user_id = v_uid
                                             AND uba.block_id = r.scope_block_id
                                             AND uba.revoked_at IS NULL)
                                   OR EXISTS (SELECT 1 FROM public.hostel_wardens hw
                                              WHERE hw.user_id = v_uid
                                                AND hw.block_id = r.scope_block_id
                                                AND hw.is_active
                                                AND hw.relieved_at IS NULL))
    ELSE false
  END;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_lo_can_act(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_lo_can_act(uuid) TO authenticated;

-- ─── _fn_lo_seed_steps: internal, no auth / no validation ──────────────────
-- Freezes one approval row per flow step. Called only from the public RPCs and
-- the backfill migration; never granted to clients.
CREATE OR REPLACE FUNCTION public._fn_lo_seed_steps(p_application_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_app   public.leave_onduty_applications%ROWTYPE;
  v_flow  uuid;
  v_block uuid;
  v_n     integer := 0;
  s       record;
BEGIN
  SELECT * INTO v_app FROM public.leave_onduty_applications WHERE id = p_application_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found' USING ERRCODE = '42704';
  END IF;
  IF v_app.leave_type_id IS NULL THEN
    RAISE EXCEPTION 'Application has no leave type' USING ERRCODE = '22023';
  END IF;

  -- Institution override first, then the group default.
  SELECT f.id INTO v_flow
  FROM public.learner_leave_flows f
  WHERE f.leave_type_id = v_app.leave_type_id
    AND f.is_active
    AND (f.institution_id = v_app.institution_id OR f.institution_id IS NULL)
    AND EXISTS (SELECT 1 FROM public.learner_leave_flow_steps st WHERE st.flow_id = f.id)
  ORDER BY (f.institution_id IS NULL)   -- false (override) sorts first
  LIMIT 1;

  IF v_flow IS NULL THEN
    RAISE EXCEPTION 'No approval flow is configured for this leave type. Please contact the office.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Learner's current hostel block (only needed by hostel_block steps).
  SELECT ha.block_id INTO v_block
  FROM public.hostel_allocations ha
  JOIN public.profiles p ON p.id = ha.learner_id
  WHERE p.learner_id = v_app.learner_id AND ha.status = 'active'
  ORDER BY ha.allocation_date DESC
  LIMIT 1;

  FOR s IN
    SELECT st.role_id, st.scope,
           row_number() OVER (ORDER BY st.step_order)::int AS ord
    FROM public.learner_leave_flow_steps st
    WHERE st.flow_id = v_flow
    ORDER BY st.step_order
  LOOP
    IF s.scope = 'hostel_block' AND v_block IS NULL THEN
      RAISE EXCEPTION 'This leave type needs a hostel warden''s approval, but you have no active hostel allocation.'
        USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.leave_onduty_approvals
      (application_id, step_order, approver_id, approver_role, status,
       role_id, scope, scope_institution_id, scope_department_id, scope_block_id)
    VALUES
      (p_application_id, s.ord, NULL, NULL, 'pending',
       s.role_id, s.scope, v_app.institution_id, v_app.department_id,
       CASE WHEN s.scope = 'hostel_block' THEN v_block END);
    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END $$;

REVOKE EXECUTE ON FUNCTION public._fn_lo_seed_steps(uuid) FROM PUBLIC, anon, authenticated;

-- ─── fn_lo_seed_approvals: learner-callable, validates then seeds ──────────
-- The client inserts the application (learners_insert policy) and then calls
-- this; on error the client deletes its own pending row (existing pattern).
-- Every rule of the leave type is enforced HERE, server-side — the form's
-- checks are UX only.
CREATE OR REPLACE FUNCTION public.fn_lo_seed_approvals(p_application_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid  uuid := (SELECT auth.uid());
  v_app  public.leave_onduty_applications%ROWTYPE;
  v_type public.learner_leave_types%ROWTYPE;
  v_is_hostel boolean;
  v_days integer;
  v_existing integer;
BEGIN
  SELECT * INTO v_app FROM public.leave_onduty_applications WHERE id = p_application_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found' USING ERRCODE = '42704';
  END IF;

  IF NOT (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.learner_id = v_app.learner_id)
    OR (SELECT public.is_super_admin())
  ) THEN
    RAISE EXCEPTION 'Not authorized to submit this application' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_existing FROM public.leave_onduty_approvals WHERE application_id = p_application_id;
  IF v_existing > 0 THEN RETURN v_existing; END IF;

  IF v_app.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Application is not pending' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_type FROM public.learner_leave_types WHERE id = v_app.leave_type_id;
  IF NOT FOUND OR NOT v_type.is_active THEN
    RAISE EXCEPTION 'Please choose an active leave type' USING ERRCODE = '22023';
  END IF;

  IF v_type.category IS DISTINCT FROM v_app.category THEN
    RAISE EXCEPTION 'Leave type "%" is not a % type', v_type.name, v_app.category USING ERRCODE = '22023';
  END IF;

  -- Residency: Hostel accommodation OR an active allocation = hostel;
  -- everyone else (Day Scholar / Paying Guest / not set) = day scholar.
  SELECT (
      EXISTS (SELECT 1 FROM public.learners_profiles lp
              JOIN public.accommodation_types at ON at.id = lp.accommodation_type_id
              WHERE lp.id = v_app.learner_id AND lower(at.name) = 'hostel')
      OR EXISTS (SELECT 1 FROM public.hostel_allocations ha
                 JOIN public.profiles p ON p.id = ha.learner_id
                 WHERE p.learner_id = v_app.learner_id AND ha.status = 'active')
    ) INTO v_is_hostel;

  IF v_type.residency = 'hostel' AND NOT v_is_hostel THEN
    RAISE EXCEPTION '"%" is only for hostel learners', v_type.name USING ERRCODE = '22023';
  ELSIF v_type.residency = 'day_scholar' AND v_is_hostel THEN
    RAISE EXCEPTION '"%" is only for day scholars', v_type.name USING ERRCODE = '22023';
  END IF;

  v_days := (v_app.end_date - v_app.start_date) + 1;
  IF v_type.max_duration_days IS NOT NULL AND v_days > v_type.max_duration_days THEN
    RAISE EXCEPTION '"%" allows at most % day(s); you asked for %', v_type.name, v_type.max_duration_days, v_days
      USING ERRCODE = '22023';
  END IF;

  IF v_type.advance_notice_hours > 0
     AND (v_app.start_date - (v_app.created_at AT TIME ZONE 'Asia/Kolkata')::date)
         < ceil(v_type.advance_notice_hours / 24.0)::int THEN
    RAISE EXCEPTION '"%" must be applied at least % hour(s) in advance', v_type.name, v_type.advance_notice_hours
      USING ERRCODE = '22023';
  END IF;

  IF v_type.requires_attachment AND btrim(coalesce(v_app.attachment_url, '')) = '' THEN
    RAISE EXCEPTION '"%" requires a supporting document', v_type.name USING ERRCODE = '22023';
  END IF;

  IF v_app.period_type IN ('forenoon', 'afternoon') AND NOT v_type.allow_half_day THEN
    RAISE EXCEPTION '"%" does not allow half-day applications', v_type.name USING ERRCODE = '22023';
  END IF;
  IF v_app.period_type = 'periodwise' AND NOT v_type.allow_periodwise THEN
    RAISE EXCEPTION '"%" does not allow period-wise applications', v_type.name USING ERRCODE = '22023';
  END IF;

  -- Sponsor-gated applications wait at step 0; the chain is seeded when the
  -- sponsor approves (fn_lo_sponsor_decide).
  IF v_type.requires_sponsor_approval THEN
    IF v_app.sponsor_id IS NULL THEN
      RAISE EXCEPTION '"%" needs a sponsor — select the person you are working with', v_type.name
        USING ERRCODE = '22023';
    END IF;
    RETURN 0;
  END IF;

  RETURN public._fn_lo_seed_steps(p_application_id);
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_lo_seed_approvals(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_lo_seed_approvals(uuid) TO authenticated;

-- ─── fn_lo_sponsor_decide ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_lo_sponsor_decide(
  p_application_id uuid, p_decision text, p_comments text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_app public.leave_onduty_applications%ROWTYPE;
  v_n   integer := 0;
BEGIN
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid decision' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_app FROM public.leave_onduty_applications
  WHERE id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found' USING ERRCODE = '42704';
  END IF;
  IF v_app.sponsor_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'You are not the assigned sponsor for this application' USING ERRCODE = '42501';
  END IF;
  IF v_app.sponsor_approval_status IS DISTINCT FROM 'pending' OR v_app.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'This application is no longer waiting for your approval' USING ERRCODE = '22023';
  END IF;

  UPDATE public.leave_onduty_applications
     SET sponsor_approval_status = p_decision,
         sponsor_comments = nullif(btrim(coalesce(p_comments, '')), ''),
         sponsor_action_at = now(),
         current_step = CASE WHEN p_decision = 'approved' THEN 1 ELSE current_step END,
         status = CASE WHEN p_decision = 'rejected' THEN 'rejected'::public.application_status ELSE status END,
         updated_at = now()
   WHERE id = p_application_id;

  IF p_decision = 'approved' THEN
    IF v_app.leave_type_id IS NOT NULL THEN
      v_n := public._fn_lo_seed_steps(p_application_id);
    END IF;
  END IF;

  RETURN jsonb_build_object('status', CASE WHEN p_decision = 'rejected' THEN 'rejected' ELSE 'pending' END,
                            'seeded', v_n);
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_lo_sponsor_decide(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_lo_sponsor_decide(uuid, text, text) TO authenticated;

-- ─── fn_lo_decide: approve / reject the current step ───────────────────────
-- Returns {status, finalized, affects_attendance}. The caller runs the
-- attendance stamp when finalized AND affects_attendance.
CREATE OR REPLACE FUNCTION public.fn_lo_decide(
  p_application_id uuid, p_action text, p_comments text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid     uuid := (SELECT auth.uid());
  v_app     public.leave_onduty_applications%ROWTYPE;
  v_row     uuid;
  v_next    integer;
  v_status  text := 'pending';
  v_affects boolean;
  v_super   boolean := (SELECT public.is_super_admin());
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid action' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_app FROM public.leave_onduty_applications
  WHERE id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found' USING ERRCODE = '42704';
  END IF;
  IF v_app.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Application is not pending approval' USING ERRCODE = '22023';
  END IF;
  IF coalesce(v_app.current_step, 0) < 1 THEN
    RAISE EXCEPTION 'Application is still waiting for sponsor approval' USING ERRCODE = '22023';
  END IF;

  -- A pending row at the current step the caller can act on.
  SELECT ap.id INTO v_row
  FROM public.leave_onduty_approvals ap
  WHERE ap.application_id = p_application_id
    AND ap.step_order = v_app.current_step
    AND ap.status = 'pending'
    AND public.fn_lo_can_act(ap.id)
  ORDER BY ap.created_at
  LIMIT 1;

  IF v_row IS NULL AND NOT v_super THEN
    RAISE EXCEPTION 'You are not an approver for the current step of this application' USING ERRCODE = '42501';
  END IF;

  IF v_row IS NOT NULL THEN
    UPDATE public.leave_onduty_approvals
       SET status = p_action::public.approval_status,
           comments = nullif(btrim(coalesce(p_comments, '')), ''),
           action_taken_at = now(),
           approver_id = coalesce(approver_id, v_uid)
     WHERE id = v_row;
  ELSE
    -- Super-admin override with no actionable row: record it and decide.
    INSERT INTO public.leave_onduty_approvals
      (application_id, step_order, approver_id, approver_role, status, comments, action_taken_at)
    VALUES
      (p_application_id, v_app.current_step, v_uid, 'super_admin',
       p_action::public.approval_status, nullif(btrim(coalesce(p_comments, '')), ''), now());
  END IF;

  IF p_action = 'rejected' THEN
    v_status := 'rejected';
  ELSIF v_super AND v_row IS NULL THEN
    v_status := 'approved';
  ELSE
    SELECT min(ap.step_order) INTO v_next
    FROM public.leave_onduty_approvals ap
    WHERE ap.application_id = p_application_id
      AND ap.status = 'pending'
      AND ap.step_order > v_app.current_step;

    -- Legacy parallel rows at the same step: wait for them too.
    IF EXISTS (SELECT 1 FROM public.leave_onduty_approvals ap
               WHERE ap.application_id = p_application_id
                 AND ap.step_order = v_app.current_step
                 AND ap.status = 'pending'
                 AND ap.role_id IS NULL) THEN
      v_status := 'pending';
    ELSIF v_next IS NULL THEN
      v_status := 'approved';
    ELSE
      UPDATE public.leave_onduty_applications
         SET current_step = v_next, updated_at = now()
       WHERE id = p_application_id;
    END IF;
  END IF;

  -- Later steps of a rejected application stay 'pending'; every queue filters
  -- on the APPLICATION being pending, so they drop out without being faked
  -- as someone's rejection.
  IF v_status IN ('approved', 'rejected') THEN
    UPDATE public.leave_onduty_applications
       SET status = v_status::public.application_status, updated_at = now()
     WHERE id = p_application_id;
  END IF;

  SELECT coalesce(t.affects_attendance, true) INTO v_affects
  FROM (SELECT 1) x
  LEFT JOIN public.learner_leave_types t ON t.id = v_app.leave_type_id;

  RETURN jsonb_build_object(
    'status', v_status,
    'finalized', v_status = 'approved',
    'affects_attendance', coalesce(v_affects, true));
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_lo_decide(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_lo_decide(uuid, text, text) TO authenticated;

-- ─── fn_lo_my_approval_queue ───────────────────────────────────────────────
-- 'pending'  : applications whose CURRENT step I can act on
-- 'approved' / 'rejected' : applications I acted on with that decision
-- 'all'      : union of the above plus anything I acted on
CREATE OR REPLACE FUNCTION public.fn_lo_my_approval_queue(p_status text DEFAULT 'pending')
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT a.id
  FROM public.leave_onduty_applications a
  JOIN public.leave_onduty_approvals ap ON ap.application_id = a.id
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND (
      (p_status IN ('pending', 'all')
        AND a.status = 'pending'
        AND ap.step_order = a.current_step
        AND ap.status = 'pending'
        AND public.fn_lo_can_act(ap.id))
      OR
      (p_status IN ('approved', 'rejected', 'all')
        AND ap.approver_id = (SELECT auth.uid())
        AND ap.action_taken_at IS NOT NULL
        AND (p_status = 'all' OR ap.status::text = p_status))
    );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_lo_my_approval_queue(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_lo_my_approval_queue(text) TO authenticated;

-- ─── fn_lo_save_flow: replace a flow's steps atomically (INVOKER → RLS) ─────
-- p_steps = [{"role_id": uuid, "scope": "own_department"}, ...] in order.
-- An empty array deletes the flow (an institution override falls back to the
-- group default).
CREATE OR REPLACE FUNCTION public.fn_lo_save_flow(
  p_leave_type_id uuid, p_institution_id uuid, p_steps jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_flow uuid;
  v_i    integer := 0;
  s      jsonb;
BEGIN
  IF NOT (SELECT public.user_has_permission('learners.leave_types.manage')) THEN
    RAISE EXCEPTION 'You do not have permission to manage leave approval flows' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(coalesce(p_steps, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Steps must be an array' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_flow FROM public.learner_leave_flows
  WHERE leave_type_id = p_leave_type_id
    AND institution_id IS NOT DISTINCT FROM p_institution_id;

  IF jsonb_array_length(coalesce(p_steps, '[]'::jsonb)) = 0 THEN
    IF v_flow IS NOT NULL THEN
      DELETE FROM public.learner_leave_flows WHERE id = v_flow;
    END IF;
    RETURN NULL;
  END IF;

  IF v_flow IS NULL THEN
    INSERT INTO public.learner_leave_flows (leave_type_id, institution_id, created_by)
    VALUES (p_leave_type_id, p_institution_id, (SELECT auth.uid()))
    RETURNING id INTO v_flow;
  ELSE
    UPDATE public.learner_leave_flows SET is_active = true WHERE id = v_flow;
  END IF;

  DELETE FROM public.learner_leave_flow_steps WHERE flow_id = v_flow;

  FOR s IN SELECT * FROM jsonb_array_elements(p_steps) LOOP
    v_i := v_i + 1;
    INSERT INTO public.learner_leave_flow_steps (flow_id, step_order, role_id, scope)
    VALUES (v_flow, v_i, (s->>'role_id')::uuid, (s->>'scope')::public.learner_leave_step_scope);
  END LOOP;

  RETURN v_flow;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_lo_save_flow(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_lo_save_flow(uuid, uuid, jsonb) TO authenticated;

-- ─── can_see_leave_onduty_application: + role-step approvers ───────────────
-- Body was live-only (never committed); this is the live body plus branch 4.
CREATE OR REPLACE FUNCTION public.can_see_leave_onduty_application(p_application_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_result boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  -- 1. Approver on this application (pinned, or the actor of a role step)
  SELECT EXISTS (
    SELECT 1 FROM leave_onduty_approvals
    WHERE application_id = p_application_id
      AND approver_id = v_uid
  ) INTO v_result;
  IF v_result THEN RETURN true; END IF;

  -- 2. Applicant student
  SELECT EXISTS (
    SELECT 1 FROM leave_onduty_applications a
    JOIN profiles p ON p.learner_id = a.learner_id
    WHERE a.id = p_application_id
      AND p.id = v_uid
  ) INTO v_result;
  IF v_result THEN RETURN true; END IF;

  -- 3. Admin / same-institution academic role
  SELECT EXISTS (
    SELECT 1 FROM leave_onduty_applications a
    JOIN profiles p ON p.id = v_uid
    WHERE a.id = p_application_id
      AND (
        p.role IN ('super_admin','admin','institution_admin')
        OR (
          p.role IN ('hod','principal','faculty','staff')
          AND p.institution_id = a.institution_id
        )
      )
  ) INTO v_result;
  IF v_result THEN RETURN true; END IF;

  -- 4. Holder of a role step on this application (any step, so a later
  --    approver can read the history and an earlier one can see the outcome).
  --    Covers all_institutions roles (CAO) and hostel_block wardens.
  SELECT EXISTS (
    SELECT 1 FROM leave_onduty_approvals ap
    WHERE ap.application_id = p_application_id
      AND ap.role_id IS NOT NULL
      AND public.fn_lo_can_act(ap.id)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- ─── Permissions: catalog keys granted in the same migration ───────────────
-- learners.leave_types.manage edits the GROUP-WIDE list and flows, so it goes
-- only to group-level roles (those that managed hostel leave types, plus
-- all-institution roles that managed OD). Own-institution HOD/Principal get
-- view only — an HOD editing a group default would change it for everyone.
UPDATE public.custom_roles cr
   SET permissions = cr.permissions || jsonb_build_object(
         'learners.leave_types.view', true,
         'learners.leave_types.manage', true),
       updated_at = now()
 WHERE (cr.permissions->>'campus_living.leave_types.edit')::boolean IS TRUE
    OR ((cr.permissions->>'academic.leave_onduty.manage')::boolean IS TRUE AND cr.institution_scope = 'all');

UPDATE public.custom_roles cr
   SET permissions = cr.permissions || jsonb_build_object('learners.leave_types.view', true),
       updated_at = now()
 WHERE (cr.permissions->>'academic.leave_onduty.manage')::boolean IS TRUE
   AND (cr.permissions->>'learners.leave_types.view')::boolean IS NOT TRUE;

-- Approvers that flows will name need the approvals page.
UPDATE public.custom_roles cr
   SET permissions = cr.permissions || jsonb_build_object('academic.leave_onduty.approve', true),
       updated_at = now()
 WHERE cr.role_key IN ('hod', 'principal', 'vice_principal', 'warden', 'chief_warden', 'cao')
   AND (cr.permissions->>'academic.leave_onduty.approve')::boolean IS NOT TRUE;
