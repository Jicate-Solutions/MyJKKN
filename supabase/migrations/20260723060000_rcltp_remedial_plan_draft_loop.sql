-- ============================================================================
-- RCLTP remedial-plan draft loop — Slice 1: DB foundation
-- 2026-07-23 — "Giving Senior Learners their learning-studio time back"
-- ----------------------------------------------------------------------------
-- An at-risk reader flagged by RCLTP (low_band | regression) → AI drafts a
-- remedial reading plan → the Senior Learner reviews, EDITS, and APPROVES it →
-- the edit + approval are captured. Mirrors the proven curriculum lesson-spine
-- pattern: AI is the author, the Senior Learner is the authority. The ONLY path
-- to status='approved' is fn_rcltp_remedial_plan_approve (a permissioned human
-- action) — nothing the generator writes is ever auto-approved.
--
-- Edit-capture (moat-loop Part 5 foundation): edited_content stores the Senior
-- Learner's version distinct from ai_draft, so a later cycle can feed forward
-- "what the human changed" and the measured outcome. This migration lays the
-- store; generation (Slice 2) + review UI (Slice 3) build on it.
-- ============================================================================

BEGIN;

-- ---- table -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rcltp_remedial_plans (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id     uuid NOT NULL,
  learner_id         uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  assessment_id      uuid REFERENCES public.rcltp_assessments(id) ON DELETE SET NULL,
  cycle_no           integer,

  -- why this learner was flagged, snapshotted at draft time
  trigger_reason     text NOT NULL CHECK (trigger_reason IN ('low_band','regression')),
  band_at_trigger    text,
  overall_at_trigger numeric(5,2),

  -- AI author
  ai_draft           jsonb,           -- { summary, focus_areas[], activities[], target_band, ... }
  ai_model           text,
  ai_generated_at    timestamptz,

  -- Senior Learner authority + EDIT-CAPTURE (the human's version, distinct from ai_draft)
  edited_content     jsonb,           -- NULL until a human edits; the fed-forward "what changed" signal
  status             text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('queued','draft','approved','archived')),
  approved_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at        timestamptz,

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- one active (non-archived) plan per learner+cycle
CREATE UNIQUE INDEX IF NOT EXISTS uq_rcltp_remedial_plan_learner_cycle_active
  ON public.rcltp_remedial_plans (learner_id, cycle_no)
  WHERE status <> 'archived';
CREATE INDEX IF NOT EXISTS ix_rcltp_remedial_plans_inst_status
  ON public.rcltp_remedial_plans (institution_id, status);

COMMENT ON TABLE  public.rcltp_remedial_plans IS
  'AI-drafted, Senior-Learner-approved remedial reading plans for at-risk RCLTP learners. edited_content = human edit-capture; only fn_rcltp_remedial_plan_approve sets status=approved.';

-- updated_at trigger (reuse the standard helper if present, else inline)
DROP TRIGGER IF EXISTS trg_rcltp_remedial_plans_updated_at ON public.rcltp_remedial_plans;
CREATE TRIGGER trg_rcltp_remedial_plans_updated_at
  BEFORE UPDATE ON public.rcltp_remedial_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---- RLS -------------------------------------------------------------------
ALTER TABLE public.rcltp_remedial_plans ENABLE ROW LEVEL SECURITY;

-- Read: super/admin, or a report/review permission holder with access to the institution.
DROP POLICY IF EXISTS rcltp_remedial_plans_select ON public.rcltp_remedial_plans;
CREATE POLICY rcltp_remedial_plans_select ON public.rcltp_remedial_plans
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR ((user_has_permission('rcltp.review') OR user_has_permission('rcltp.report.view_all')
         OR user_has_permission('rcltp.config.manage'))
        AND role_has_institution_access(institution_id))
  );

-- Writes go ONLY through the SECURITY DEFINER RPCs below (generator = service_role,
-- approve = authenticated with rcltp.review). No direct INSERT/UPDATE/DELETE policy
-- for authenticated clients → the status lifecycle can't be bypassed from the browser.

-- ---- RPC 1: generator upsert (service_role only — called by the drain handler) ----
CREATE OR REPLACE FUNCTION public.fn_rcltp_remedial_plan_ai_draft_upsert(
  p_institution_id uuid,
  p_learner_id     uuid,
  p_assessment_id  uuid,
  p_cycle_no       integer,
  p_trigger_reason text,
  p_band           text,
  p_overall        numeric,
  p_ai_draft       jsonb,
  p_ai_model       text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.rcltp_remedial_plans AS rp (
    institution_id, learner_id, assessment_id, cycle_no, trigger_reason,
    band_at_trigger, overall_at_trigger, ai_draft, ai_model, ai_generated_at, status
  ) VALUES (
    p_institution_id, p_learner_id, p_assessment_id, p_cycle_no, p_trigger_reason,
    p_band, p_overall, p_ai_draft, p_ai_model, now(), 'draft'
  )
  ON CONFLICT (learner_id, cycle_no) WHERE status <> 'archived'
  DO UPDATE SET
    ai_draft = EXCLUDED.ai_draft,
    ai_model = EXCLUDED.ai_model,
    ai_generated_at = now(),
    trigger_reason = EXCLUDED.trigger_reason,
    band_at_trigger = EXCLUDED.band_at_trigger,
    overall_at_trigger = EXCLUDED.overall_at_trigger,
    -- re-drafting an unapproved plan refreshes the draft; an approved plan is left intact
    status = CASE WHEN rp.status = 'approved' THEN rp.status ELSE 'draft' END
  RETURNING rp.id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_rcltp_remedial_plan_ai_draft_upsert(uuid,uuid,uuid,integer,text,text,numeric,jsonb,text) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_rcltp_remedial_plan_ai_draft_upsert(uuid,uuid,uuid,integer,text,text,numeric,jsonb,text) TO service_role;

-- ---- RPC 2: approve (authenticated Senior Learner with rcltp.review) --------
-- Captures the human's edited_content and flips to approved. This is the ONLY
-- path to status='approved'.
CREATE OR REPLACE FUNCTION public.fn_rcltp_remedial_plan_approve(
  p_plan_id        uuid,
  p_edited_content jsonb
) RETURNS public.rcltp_remedial_plans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.rcltp_remedial_plans;
BEGIN
  SELECT * INTO v_row FROM public.rcltp_remedial_plans WHERE id = p_plan_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'remedial plan % not found', p_plan_id USING ERRCODE = '42704';
  END IF;

  IF NOT (
    is_super_admin() OR is_admin()
    OR (user_has_permission('rcltp.review') AND role_has_institution_access(v_row.institution_id))
  ) THEN
    RAISE EXCEPTION 'Not authorized to approve this remedial plan' USING ERRCODE = '42501';
  END IF;

  UPDATE public.rcltp_remedial_plans
     SET edited_content = COALESCE(p_edited_content, ai_draft),
         status = 'approved',
         approved_by = auth.uid(),
         approved_at = now()
   WHERE id = p_plan_id
   RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_rcltp_remedial_plan_approve(uuid,jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_rcltp_remedial_plan_approve(uuid,jsonb) TO authenticated;

-- ---- ai_job_types registration (lane='max' = ₹0 drain, mirrors lesson-spine) ----
INSERT INTO public.ai_job_types (
  job_type, title, description, lane, output_target, tool_set,
  provider, model_id, interactive, schedulable, allow_rule, enabled, input_schema
) VALUES (
  'rcltp.remedial_plan_draft',
  'RCLTP · Remedial Plan Draft',
  'Drafts a remedial reading plan for an at-risk RCLTP learner (grounded in their band, scores, and weak areas) for Senior Learner review and approval. AI authors; the Senior Learner is the authority.',
  'max', 'job.result', 'none',
  'anthropic', 'claude-sonnet-4-6',
  false, false, 'seat_owner', true,
  '[{"key":"learner_id","type":"text","label":"Learner","required":true},{"key":"plan_id","type":"text","label":"Plan row","required":false},{"key":"cycle_no","type":"text","label":"Cycle","required":false}]'::jsonb
)
ON CONFLICT (job_type) DO UPDATE SET
  title = EXCLUDED.title, description = EXCLUDED.description, enabled = EXCLUDED.enabled,
  provider = EXCLUDED.provider, model_id = EXCLUDED.model_id, updated_at = now();

COMMIT;
