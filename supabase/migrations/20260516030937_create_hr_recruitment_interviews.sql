-- ============================================================================
-- HR Recruitment — Interviews table (Phase 3, Cvviz-sunset scope)
-- ============================================================================
-- Created: 2026-05-16
-- Spec: specs/hr-recruitment-module-spec.md
-- Agent: α (Wave 4-B interviews substrate)
--
-- Purpose
-- -------
-- The HR Recruitment service `lib/services/hr/recruitment-interviews-service.ts`
-- (RecruitmentInterviewsService) plus the API routes under
-- `app/api/hr/recruitment/interviews/` reference an `hr_recruitment_interviews`
-- table that did not exist in production. Hitting the interview-scheduling
-- surface returns 500 because the substrate is missing.
--
-- Schema below mirrors the TS contract in `types/hr-recruitment.ts` verbatim
-- (HRRecruitmentInterview, HRRecruitmentInterviewInsert, HRRecruitmentInterviewUpdate,
-- InterviewMode, InterviewStatus) — no inference. Service call-sites (listInterviews
-- filters, getInterview, scheduleInterview, rescheduleInterview, cancelInterview,
-- updateOutcome, updateInterview) all read/write columns enumerated below.
--
-- Why job_id has no FK in this migration
-- --------------------------------------
-- The companion `hr_recruitment_jobs` table is being applied in parallel by the
-- main thread (PR T4.x). To keep this migration independent + idempotent we land
-- `job_id` as a bare `uuid` column. Once jobs is live in prod a one-line follow-on
-- migration can add `ADD CONSTRAINT hr_recruitment_interviews_job_id_fkey
-- FOREIGN KEY (job_id) REFERENCES public.hr_recruitment_jobs(id) ON DELETE SET NULL`.
-- The service layer already tolerates NULL job_id (line 123 of the service).
--
-- RLS pattern
-- -----------
-- Mirrors `hr_recruitment_jobs` (which mirrors `hr_recruitment_candidates`):
-- is_super_admin() OR is_admin() OR user_has_permission('hr.recruitment.<verb>').
-- Permission keys reuse existing hr.recruitment.{view,create,edit,delete} grants
-- so HR Officers gain access automatically without a new permission row.
-- SELECT additionally allows panel members on the row (they need to see their own
-- interviews in /hr/recruitment/my-interviews queue) — implemented via
-- `auth.uid() = ANY(panel_member_ids)`.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_recruitment_interviews (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id            uuid NOT NULL REFERENCES public.hr_recruitment_candidates(id) ON DELETE CASCADE,
  job_id                  uuid,                                              -- FK to be added once hr_recruitment_jobs lands in prod (see header)
  round_number            integer NOT NULL DEFAULT 1 CHECK (round_number > 0),
  round_name              text,
  scheduled_at            timestamptz NOT NULL,
  duration_minutes        integer NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
  mode                    text NOT NULL CHECK (mode IN (
                            'in_person',
                            'phone',
                            'video',
                            'walk_in'
                          )),
  location_or_link        text,
  panel_member_ids        uuid[] NOT NULL CHECK (array_length(panel_member_ids, 1) > 0),
  status                  text NOT NULL DEFAULT 'scheduled' CHECK (status IN (
                            'scheduled',
                            'completed',
                            'cancelled',
                            'no_show',
                            'rescheduled'
                          )),
  rescheduled_from_id     uuid REFERENCES public.hr_recruitment_interviews(id) ON DELETE SET NULL,
  outcome_summary         text,
  created_by              uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hr_recruitment_interviews IS
  'HR Recruitment — Interview sittings for candidates. One row per scheduled sitting; reschedules create a NEW row with rescheduled_from_id pointing back to preserve audit history (see RecruitmentInterviewsService.rescheduleInterview).';
COMMENT ON COLUMN public.hr_recruitment_interviews.panel_member_ids IS
  'Array of profiles.id for the interview panel. RLS SELECT also allows any auth.uid() present in this array so panel members see their own queue.';
COMMENT ON COLUMN public.hr_recruitment_interviews.rescheduled_from_id IS
  'When the service reschedules, the old row gets status=rescheduled and a NEW row is created with this column pointing to the old id. Preserves full audit history.';
COMMENT ON COLUMN public.hr_recruitment_interviews.job_id IS
  'Optional FK to hr_recruitment_jobs.id (constraint to be added in follow-on migration once jobs table lands in prod).';

-- ---------------------------------------------------------------------------
-- 2) Indexes
-- ---------------------------------------------------------------------------
-- Match the access patterns hit by RecruitmentInterviewsService.listInterviews().
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_interviews_candidate
  ON public.hr_recruitment_interviews(candidate_id);

CREATE INDEX IF NOT EXISTS idx_hr_recruitment_interviews_job
  ON public.hr_recruitment_interviews(job_id);

CREATE INDEX IF NOT EXISTS idx_hr_recruitment_interviews_status
  ON public.hr_recruitment_interviews(status);

CREATE INDEX IF NOT EXISTS idx_hr_recruitment_interviews_scheduled
  ON public.hr_recruitment_interviews(scheduled_at DESC);

CREATE INDEX IF NOT EXISTS idx_hr_recruitment_interviews_rescheduled_from
  ON public.hr_recruitment_interviews(rescheduled_from_id);

-- GIN index for `panel_member_ids @> [uid]` contains-lookups used by the
-- `panel_member_id` filter (service line 61-64: q.contains('panel_member_ids', ...)).
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_interviews_panel
  ON public.hr_recruitment_interviews USING GIN (panel_member_ids);

-- ---------------------------------------------------------------------------
-- 3) Trigger — keep updated_at fresh on every UPDATE.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS hr_recruitment_interviews_updated_at
  ON public.hr_recruitment_interviews;
CREATE TRIGGER hr_recruitment_interviews_updated_at
  BEFORE UPDATE ON public.hr_recruitment_interviews
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4) Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_recruitment_interviews ENABLE ROW LEVEL SECURITY;

-- SELECT: super_admin / admin always; hr.recruitment.view holders; panel members
-- see rows where their uid is in panel_member_ids (own-queue surface).
DROP POLICY IF EXISTS "hr_recruitment_interviews_select_permission"
  ON public.hr_recruitment_interviews;
CREATE POLICY "hr_recruitment_interviews_select_permission"
  ON public.hr_recruitment_interviews FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('hr.recruitment.view')
    OR (auth.uid() = ANY(panel_member_ids))
  );

-- INSERT: super_admin / admin always; otherwise hr.recruitment.create.
DROP POLICY IF EXISTS "hr_recruitment_interviews_insert_permission"
  ON public.hr_recruitment_interviews;
CREATE POLICY "hr_recruitment_interviews_insert_permission"
  ON public.hr_recruitment_interviews FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR user_has_permission('hr.recruitment.create')
  );

-- UPDATE: super_admin / admin always; otherwise hr.recruitment.edit. Panel members
-- can also update their own outcome_summary via the service-layer updateOutcome —
-- but since RLS UPDATE is row-level not column-level, we keep this tight to
-- recruitment.edit holders. Panel-member outcome submissions go through a future
-- scorecard table (Agent β) under stricter RLS.
DROP POLICY IF EXISTS "hr_recruitment_interviews_update_permission"
  ON public.hr_recruitment_interviews;
CREATE POLICY "hr_recruitment_interviews_update_permission"
  ON public.hr_recruitment_interviews FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('hr.recruitment.edit')
  );

-- DELETE: super_admin / admin always; otherwise hr.recruitment.delete.
DROP POLICY IF EXISTS "hr_recruitment_interviews_delete_permission"
  ON public.hr_recruitment_interviews;
CREATE POLICY "hr_recruitment_interviews_delete_permission"
  ON public.hr_recruitment_interviews FOR DELETE USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('hr.recruitment.delete')
  );

-- ---------------------------------------------------------------------------
-- 5) Done. Table starts empty per task scope (no seed migration).
-- ---------------------------------------------------------------------------
