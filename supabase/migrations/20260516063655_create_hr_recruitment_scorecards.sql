-- ============================================================================
-- HR Recruitment — Scorecards table (Phase 3, Cvviz-sunset scope)
-- ============================================================================
-- Created: 2026-05-16
-- Spec: specs/hr-recruitment-module-spec.md
-- Decomposition: specs/hr-module-decomposition-2026-05-09.md (Tier 1, T1.2)
--
-- Purpose
-- -------
-- Interviewers submit a scorecard for each interview they conduct. One scorecard
-- per (interview, interviewer) pair — the UNIQUE constraint enforces this.
-- Ratings are 1..5 ints; the overall rating is required, sub-dimensions optional.
-- Recommendation enum mirrors types/hr-recruitment.ts ScorecardRecommendation.
--
-- Schema below mirrors HRRecruitmentScorecard / HRRecruitmentScorecardInsert in
-- types/hr-recruitment.ts. RLS pattern: super_admin / admin always; interviewers
-- always see + write their own scorecard; otherwise hr.recruitment.scorecards.view
-- for read.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_recruitment_scorecards (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id          uuid NOT NULL REFERENCES public.hr_recruitment_interviews(id) ON DELETE CASCADE,
  candidate_id          uuid NOT NULL REFERENCES public.hr_recruitment_candidates(id) ON DELETE CASCADE,
  interviewer_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating_overall        int  NOT NULL CHECK (rating_overall BETWEEN 1 AND 5),
  rating_technical      int  CHECK (rating_technical IS NULL OR rating_technical BETWEEN 1 AND 5),
  rating_communication  int  CHECK (rating_communication IS NULL OR rating_communication BETWEEN 1 AND 5),
  rating_culture_fit    int  CHECK (rating_culture_fit IS NULL OR rating_culture_fit BETWEEN 1 AND 5),
  recommendation        text NOT NULL CHECK (recommendation IN (
                          'strong_hire',
                          'hire',
                          'neutral',
                          'no_hire',
                          'strong_no_hire'
                        )),
  comments              text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_recruitment_scorecards_one_per_interviewer UNIQUE (interview_id, interviewer_id)
);

COMMENT ON TABLE public.hr_recruitment_scorecards IS
  'HR Recruitment — Interview scorecards. One row per (interview, interviewer). Overall rating required (1..5); sub-dimensions optional. Recommendation drives the hire/no-hire signal aggregated at candidate level.';
COMMENT ON COLUMN public.hr_recruitment_scorecards.recommendation IS
  'Enum mirrors ScorecardRecommendation in types/hr-recruitment.ts: strong_hire | hire | neutral | no_hire | strong_no_hire.';

-- ---------------------------------------------------------------------------
-- 2) Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_scorecards_interview
  ON public.hr_recruitment_scorecards(interview_id);

CREATE INDEX IF NOT EXISTS idx_hr_recruitment_scorecards_candidate
  ON public.hr_recruitment_scorecards(candidate_id);

CREATE INDEX IF NOT EXISTS idx_hr_recruitment_scorecards_interviewer
  ON public.hr_recruitment_scorecards(interviewer_id);

-- ---------------------------------------------------------------------------
-- 3) Trigger — keep updated_at fresh on every UPDATE.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS hr_recruitment_scorecards_updated_at
  ON public.hr_recruitment_scorecards;
CREATE TRIGGER hr_recruitment_scorecards_updated_at
  BEFORE UPDATE ON public.hr_recruitment_scorecards
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4) Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_recruitment_scorecards ENABLE ROW LEVEL SECURITY;

-- SELECT: super_admin / admin always; hr.recruitment.scorecards.view permission;
-- interviewer always sees their own scorecard.
DROP POLICY IF EXISTS "hr_recruitment_scorecards_select_permission"
  ON public.hr_recruitment_scorecards;
CREATE POLICY "hr_recruitment_scorecards_select_permission"
  ON public.hr_recruitment_scorecards FOR SELECT USING (
    is_super_admin()
    OR is_admin()
    OR user_has_permission('hr.recruitment.scorecards.view')
    OR interviewer_id = auth.uid()
  );

-- INSERT: only the interviewer can submit their own scorecard; super_admin override.
DROP POLICY IF EXISTS "hr_recruitment_scorecards_insert_permission"
  ON public.hr_recruitment_scorecards;
CREATE POLICY "hr_recruitment_scorecards_insert_permission"
  ON public.hr_recruitment_scorecards FOR INSERT WITH CHECK (
    interviewer_id = auth.uid()
    OR is_super_admin()
  );

-- UPDATE: interviewer can revise their own scorecard; super_admin override.
DROP POLICY IF EXISTS "hr_recruitment_scorecards_update_permission"
  ON public.hr_recruitment_scorecards;
CREATE POLICY "hr_recruitment_scorecards_update_permission"
  ON public.hr_recruitment_scorecards FOR UPDATE USING (
    interviewer_id = auth.uid()
    OR is_super_admin()
  );

-- DELETE: super_admin / admin only — preserve audit trail.
DROP POLICY IF EXISTS "hr_recruitment_scorecards_delete_permission"
  ON public.hr_recruitment_scorecards;
CREATE POLICY "hr_recruitment_scorecards_delete_permission"
  ON public.hr_recruitment_scorecards FOR DELETE USING (
    is_super_admin()
    OR is_admin()
  );

-- ---------------------------------------------------------------------------
-- 5) Done. Table starts empty per task scope (no seed migration).
-- ---------------------------------------------------------------------------
