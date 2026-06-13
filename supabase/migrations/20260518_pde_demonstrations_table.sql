-- ============================================================================
-- Migration: 20260518_pde_demonstrations_table
-- PDE substrate — captures evidence that learners have demonstrated 1 of the
-- 7 PDE durable-value categories.
-- ============================================================================
-- Purpose
-- -------
-- Foundation for the future scoring engine. The scoring engine will consume
-- the 20 policy rows seeded in `pde.scoring.*`, `pde.visibility.*`, `pde.rollout.*`,
-- `pde.quests.*`, `pde.governance.*` (PRs Agents A-F) plus the 13 rubric rows
-- seeded by Agents G/H/I, then write `raw_score / weighted_score / passed /
-- scored_at` back onto rows of this table.
--
-- Distinction from existing `pde_submissions`
-- -------------------------------------------
-- `pde_submissions` (in 20260405200000_add_pde_tables.sql) is tied to a specific
-- `pde_assessment` (an assignable, gradeable artifact authored by faculty). This
-- new `pde_demonstrations` table is GENERAL — a learner self-submits or has
-- co-submitted evidence (a video, an OSCE score, a credential PDF, an artifact
-- link, a peer endorsement) tagged to one of the 7 PDE categories, optionally
-- pointing at a `pde.rubrics.*` policy_key. Not every demonstration belongs to
-- an assessment; not every assessment yields a portable demonstration.
--
-- RLS shape
-- ---------
-- Adapted from the canonical `profiles.role` + `profiles.institution_id` pattern
-- used across the codebase (e.g. 20250120_add_payment_gateway_tables.sql,
-- 20260513150001_create_consultant_tier_policy.sql). The original task spec
-- assumed a `profile_institution_roles` join table — that does not exist in this
-- repo. Trusting reality.
--
-- Verification
-- ------------
-- This migration ships table + indexes + trigger + RLS + grants only. No INSERT
-- rows. Per memory `feedback_smoke_test_must_include_all_not_null_columns.md`,
-- inline DO $$ smoke tests with INSERT-then-DELETE on tables with NOT NULL
-- columns can fail silently. Verification happens out-of-band via
-- information_schema + pg_policies probes (see PR body).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pde_demonstrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who & what
  learner_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  institution_id    UUID REFERENCES public.institutions(id),
  category_key      TEXT NOT NULL CHECK (category_key IN (
    'judgment', 'embodied', 'problem_finding', 'accountability',
    'social_leadership', 'cultural_civic', 'credential'
  )),
  rubric_policy_key TEXT,  -- e.g. 'pde.rubrics.embodied.medical' — optional ref into platform_policies
  skill_name        TEXT,  -- e.g. 'Patient history-taking'

  -- Evidence
  evidence          JSONB NOT NULL DEFAULT '{}'::jsonb, -- { type, url, mime, notes, ... }
  evidence_type     TEXT,  -- 'video' | 'document' | 'artifact_link' | 'osce_score' | 'simulator_pass' | etc.

  -- Submission state
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'submitted', 'under_review', 'validated', 'scored', 'rejected', 'withdrawn'
  )),
  submitted_at      TIMESTAMPTZ,

  -- Validation (filled when faculty/peer/AI reviews)
  validator_ids     JSONB DEFAULT '[]'::jsonb,  -- array of profile.id who validated
  validator_notes   JSONB DEFAULT '{}'::jsonb,

  -- Scoring (filled by scoring engine consuming pde.scoring.* policies)
  raw_score         NUMERIC,
  weighted_score    NUMERIC,
  passed            BOOLEAN,
  scored_at         TIMESTAMPTZ,

  -- Audit
  created_by        UUID REFERENCES public.profiles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pde_demonstrations IS
  'Captures evidence that learners have demonstrated 1 of the 7 PDE durable-value categories. Consumed at scoring time by services that read pde.scoring.* + pde.rubrics.* platform_policies. Distinct from pde_submissions (which is tied to a specific pde_assessment).';

COMMENT ON COLUMN public.pde_demonstrations.category_key IS
  'One of the 7 PDE durable-value categories: judgment, embodied, problem_finding, accountability, social_leadership, cultural_civic, credential.';
COMMENT ON COLUMN public.pde_demonstrations.rubric_policy_key IS
  'Optional reference to a rubric stored as a platform_policies row (e.g. pde.rubrics.embodied.medical). Resolved at scoring time via fn_get_policy.';
COMMENT ON COLUMN public.pde_demonstrations.evidence IS
  'Free-form JSON: { type, url, mime, notes, ... }. Shape varies by evidence_type.';
COMMENT ON COLUMN public.pde_demonstrations.validator_ids IS
  'JSON array of profile.id values who validated this demonstration. Append-only convention; no JSONB constraint enforced (kept flexible for peer/AI/faculty mixed-validator scenarios).';
COMMENT ON COLUMN public.pde_demonstrations.weighted_score IS
  'Final weighted score after applying pde.scoring.* policy weights. Written by the scoring engine, not by client code.';

-- ---------------------------------------------------------------------------
-- 2) Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_pde_demonstrations_learner
  ON public.pde_demonstrations (learner_id);
CREATE INDEX IF NOT EXISTS idx_pde_demonstrations_institution
  ON public.pde_demonstrations (institution_id);
CREATE INDEX IF NOT EXISTS idx_pde_demonstrations_category
  ON public.pde_demonstrations (category_key);
CREATE INDEX IF NOT EXISTS idx_pde_demonstrations_status
  ON public.pde_demonstrations (status);
CREATE INDEX IF NOT EXISTS idx_pde_demonstrations_rubric_key
  ON public.pde_demonstrations (rubric_policy_key)
  WHERE rubric_policy_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3) Updated-at trigger (reuses pde_set_updated_at from 20260405200000_add_pde_tables.sql)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS set_updated_at_pde_demonstrations ON public.pde_demonstrations;
CREATE TRIGGER set_updated_at_pde_demonstrations
  BEFORE UPDATE ON public.pde_demonstrations
  FOR EACH ROW EXECUTE FUNCTION public.pde_set_updated_at();

-- ---------------------------------------------------------------------------
-- 4) RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.pde_demonstrations ENABLE ROW LEVEL SECURITY;

-- Policy 1: learner reads + writes own
DROP POLICY IF EXISTS pde_demonstrations_learner_own ON public.pde_demonstrations;
CREATE POLICY pde_demonstrations_learner_own ON public.pde_demonstrations
  FOR ALL TO authenticated
  USING (learner_id = auth.uid())
  WITH CHECK (learner_id = auth.uid());

-- Policy 2: faculty/staff in the same institution can READ all demonstrations.
-- Adapted from the canonical `profiles.role` + `profiles.institution_id` pattern
-- (the spec's `profile_institution_roles` join table does not exist in this repo).
DROP POLICY IF EXISTS pde_demonstrations_faculty_same_inst ON public.pde_demonstrations;
CREATE POLICY pde_demonstrations_faculty_same_inst ON public.pde_demonstrations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('faculty', 'hod', 'coordinator', 'dean', 'institution_admin', 'administrator')
        AND (
          p.institution_id = public.pde_demonstrations.institution_id
          OR public.pde_demonstrations.institution_id IS NULL
        )
    )
  );

-- Policy 3: super_admin all
DROP POLICY IF EXISTS pde_demonstrations_super_admin_all ON public.pde_demonstrations;
CREATE POLICY pde_demonstrations_super_admin_all ON public.pde_demonstrations
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'super_admin' OR p.is_super_admin = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'super_admin' OR p.is_super_admin = true)
    )
  );

-- ---------------------------------------------------------------------------
-- 5) Grants
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pde_demonstrations TO authenticated;
