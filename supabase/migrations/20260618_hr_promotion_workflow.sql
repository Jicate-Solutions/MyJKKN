-- ============================================================================
-- HR — Promotion Workflow (T5.2)
-- ============================================================================
-- Created: 2026-05-15
-- Spec: specs/hr-module-decomposition-2026-05-09.md Tier 5, T5.2
-- Policy reader: hr.promotion_policy (seeded in PR #904 / migration
--   20260609_hr_governance_part2_seeds.sql, scope=institution).
--
-- Substrate (this migration) creates:
--   1. hr_promotion_applications — one row per submitted promotion request.
--      Lifecycle: submitted → sedc_scored → director_decided → approved | rejected.
--   2. hr_promotion_decisions — append-only audit log of every score / decision
--      event on an application. Used by the detail page to show the SEDC + Director
--      chain inline (who scored what, when, with notes).
--
-- Per `reference_platform_policies_director_view_pattern.md`: the policy ROW
-- already exists (PR #904), the READ function is the generic fn_get_policy
-- (migration 20260429000002), and the WRITE UI is /admin/hr/policies/promotion
-- (Wave 3 policy shell). This T5.2 migration adds ONLY the workflow tables that
-- consume the policy at runtime — it does NOT create a parallel policy table.
--
-- Why two tables (applications + decisions)?
--   * applications stores the LIVE state (current scores, current status, who
--     submitted, what designation is sought).
--   * decisions is an append-only audit log — every SEDC re-score, Director
--     approval, requested-revision event becomes a row. The detail page reads
--     decisions ordered by created_at to render the scoring history.
--   * This mirrors hr_recruitment_candidates + hr_recruitment_approvals (live
--     state + audit chain) — well-established pattern in this repo.
--
-- Migration tier: TIER-0 (additive — new tables, new indexes, new policies; no
-- writes to existing data). Safe to apply on production.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) hr_promotion_applications — live state
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_promotion_applications (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Subject + scope
  staff_id                    uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  hr_organization_id          uuid NOT NULL REFERENCES public.hr_organizations(id),
  institution_id              uuid NOT NULL REFERENCES public.institutions(id),

  -- From / to designation. We store the UUID for joins where useful, and the
  -- snapshot name as the source of truth for audit (so renaming or deleting a
  -- designation row doesn't rewrite history). No FK is declared because the
  -- canonical designations table lives in core MyJKKN (FK target name varies
  -- by env: `designations` in some installs, `hr_designations` in others) —
  -- the snapshot column makes the FK redundant for audit purposes and the
  -- service layer fills both fields atomically from the same lookup.
  from_designation_id         uuid,
  from_designation_name       text NOT NULL,
  to_designation_id           uuid,
  to_designation_name         text NOT NULL,

  -- Scoring (set when SEDC reviews; null while still in 'submitted')
  merit_score                 numeric(5,2),
  qualification_points        numeric(5,2),
  commitment_points           numeric(5,2),
  total_score                 numeric(6,2)
                              GENERATED ALWAYS AS (
                                COALESCE(merit_score, 0)
                                + COALESCE(qualification_points, 0)
                                + COALESCE(commitment_points, 0)
                              ) STORED,

  -- Evidence the applicant attaches at submit time. Free-form JSON; UI hints
  -- at masters_completed / training_days / book_publications / etc.
  evidence_jsonb              jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Lifecycle
  status                      text NOT NULL DEFAULT 'submitted' CHECK (status IN (
                                'submitted',           -- staff filed; waiting on SEDC
                                'sedc_scored',         -- SEDC scored; waiting on Director
                                'director_decided',    -- Director clicked approve/reject; final
                                'approved',            -- terminal: approved
                                'rejected',            -- terminal: rejected
                                'withdrawn'            -- applicant pulled it back
                              )),

  -- Timestamps (one column per gate so we can render a timeline)
  submitted_at                timestamptz NOT NULL DEFAULT now(),
  sedc_reviewed_at            timestamptz,
  director_approved_at        timestamptz,

  -- Reviewer attribution
  sedc_reviewed_by            uuid REFERENCES public.profiles(id),
  director_approved_by        uuid REFERENCES public.profiles(id),

  -- Final note from Director (for the audit trail; longer per-step notes go in
  -- hr_promotion_decisions).
  decision_notes              text,

  -- Audit
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  created_by                  uuid REFERENCES public.profiles(id),
  updated_by                  uuid REFERENCES public.profiles(id),

  -- Invariants
  CONSTRAINT hr_promotion_applications_from_to_differ
    CHECK (from_designation_name IS DISTINCT FROM to_designation_name)
);

COMMENT ON TABLE public.hr_promotion_applications IS
  'HR — Promotion Workflow (T5.2). One row per submitted promotion request. Consumes hr.promotion_policy (platform_policies row, seeded via PR #904) at score-time. Lifecycle: submitted → sedc_scored → director_decided → approved|rejected. Snapshot fields (from_/to_designation_name) preserve audit even if FK rows are renamed.';
COMMENT ON COLUMN public.hr_promotion_applications.total_score IS
  'Generated column: merit_score + qualification_points + commitment_points. Recomputed automatically; never written directly.';
COMMENT ON COLUMN public.hr_promotion_applications.evidence_jsonb IS
  'Applicant-supplied evidence at submit time. Loose shape: {masters_completed: bool, training_days: int, book_publications: int, article_publications: int, narrative: text}. Read by SEDC at score time.';

-- ---------------------------------------------------------------------------
-- 2) hr_promotion_decisions — append-only audit log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_promotion_decisions (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id              uuid NOT NULL REFERENCES public.hr_promotion_applications(id) ON DELETE CASCADE,

  -- What happened
  event_type                  text NOT NULL CHECK (event_type IN (
                                'submitted',            -- applicant clicked submit
                                'sedc_scored',          -- SEDC reviewer set merit + qual + commit
                                'sedc_rescored',        -- subsequent SEDC edit
                                'director_approved',    -- Director said yes
                                'director_rejected',    -- Director said no
                                'revision_requested',   -- Director sent it back to SEDC
                                'withdrawn'             -- applicant withdrew
                              )),

  -- Scoring snapshot (NULL when event is non-scoring, e.g. 'submitted')
  merit_score_snapshot        numeric(5,2),
  qualification_points_snapshot numeric(5,2),
  commitment_points_snapshot  numeric(5,2),

  -- Free-form notes from the reviewer / applicant
  notes                       text,

  -- Who + when
  actor_id                    uuid NOT NULL REFERENCES public.profiles(id),
  actor_role                  text,   -- snapshot label e.g. 'sedc_reviewer' / 'director' / 'applicant'
  created_at                  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hr_promotion_decisions IS
  'HR — Promotion Workflow (T5.2). Append-only audit log of every event on a promotion application. Read by the detail page to render the SEDC + Director chain. Use INSERT only — never UPDATE or DELETE.';

-- ---------------------------------------------------------------------------
-- 3) Indexes
-- ---------------------------------------------------------------------------
-- Primary list patterns: by-staff (My Applications), by-status (review queue),
-- by-organization (admin overview).
CREATE INDEX IF NOT EXISTS idx_hr_promotion_applications_staff
  ON public.hr_promotion_applications(staff_id, status);

CREATE INDEX IF NOT EXISTS idx_hr_promotion_applications_org_status
  ON public.hr_promotion_applications(hr_organization_id, status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_hr_promotion_applications_institution
  ON public.hr_promotion_applications(institution_id, status);

CREATE INDEX IF NOT EXISTS idx_hr_promotion_decisions_application
  ON public.hr_promotion_decisions(application_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 4) Triggers
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS hr_promotion_applications_updated_at
  ON public.hr_promotion_applications;
CREATE TRIGGER hr_promotion_applications_updated_at
  BEFORE UPDATE ON public.hr_promotion_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5) Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_promotion_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_promotion_decisions ENABLE ROW LEVEL SECURITY;

-- ── hr_promotion_applications ────────────────────────────────────────
-- SELECT: super_admin/admin always; HR officer with permission + inst access;
-- applicant viewing their OWN application (staff.profile_id = auth.uid()).
DROP POLICY IF EXISTS "hr_promotion_applications_select"
  ON public.hr_promotion_applications;
CREATE POLICY "hr_promotion_applications_select"
  ON public.hr_promotion_applications FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (
      user_has_permission('hr.employees.view')
      AND role_has_institution_access(institution_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = hr_promotion_applications.staff_id
        AND s.profile_id = auth.uid()
    )
  );

-- INSERT: applicant submitting OWN application; HR/admin can submit on behalf.
DROP POLICY IF EXISTS "hr_promotion_applications_insert"
  ON public.hr_promotion_applications;
CREATE POLICY "hr_promotion_applications_insert"
  ON public.hr_promotion_applications FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR (
      user_has_permission('hr.employees.edit')
      AND role_has_institution_access(institution_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = hr_promotion_applications.staff_id
        AND s.profile_id = auth.uid()
        AND s.institution_id = hr_promotion_applications.institution_id
    )
  );

-- UPDATE: SEDC reviewers + Director only (HR permission). Applicants cannot
-- mutate; they withdraw via a status flip (the service layer enforces the
-- withdrawn-vs-other-state transition rules).
DROP POLICY IF EXISTS "hr_promotion_applications_update"
  ON public.hr_promotion_applications;
CREATE POLICY "hr_promotion_applications_update"
  ON public.hr_promotion_applications FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR (
      user_has_permission('hr.employees.edit')
      AND role_has_institution_access(institution_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = hr_promotion_applications.staff_id
        AND s.profile_id = auth.uid()
    )
  ) WITH CHECK (
    is_super_admin() OR is_admin()
    OR (
      user_has_permission('hr.employees.edit')
      AND role_has_institution_access(institution_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = hr_promotion_applications.staff_id
        AND s.profile_id = auth.uid()
    )
  );

-- DELETE: super_admin/admin only — audit chain via decisions.
DROP POLICY IF EXISTS "hr_promotion_applications_delete"
  ON public.hr_promotion_applications;
CREATE POLICY "hr_promotion_applications_delete"
  ON public.hr_promotion_applications FOR DELETE USING (
    is_super_admin() OR is_admin()
  );

-- ── hr_promotion_decisions ───────────────────────────────────────────
-- SELECT: same audience as the parent application (delegates via JOIN).
DROP POLICY IF EXISTS "hr_promotion_decisions_select"
  ON public.hr_promotion_decisions;
CREATE POLICY "hr_promotion_decisions_select"
  ON public.hr_promotion_decisions FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR EXISTS (
      SELECT 1 FROM public.hr_promotion_applications a
      WHERE a.id = hr_promotion_decisions.application_id
        AND (
          (
            user_has_permission('hr.employees.view')
            AND role_has_institution_access(a.institution_id)
          )
          OR EXISTS (
            SELECT 1 FROM public.staff s
            WHERE s.id = a.staff_id
              AND s.profile_id = auth.uid()
          )
        )
    )
  );

-- INSERT: anyone who can update the parent (HR officer / Director / applicant
-- for the 'withdrawn' event). Service layer enforces which event_type each
-- role may emit.
DROP POLICY IF EXISTS "hr_promotion_decisions_insert"
  ON public.hr_promotion_decisions;
CREATE POLICY "hr_promotion_decisions_insert"
  ON public.hr_promotion_decisions FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR EXISTS (
      SELECT 1 FROM public.hr_promotion_applications a
      WHERE a.id = hr_promotion_decisions.application_id
        AND (
          (
            user_has_permission('hr.employees.edit')
            AND role_has_institution_access(a.institution_id)
          )
          OR EXISTS (
            SELECT 1 FROM public.staff s
            WHERE s.id = a.staff_id
              AND s.profile_id = auth.uid()
          )
        )
    )
  );

-- No UPDATE/DELETE policy — table is append-only. (Absent policies + RLS
-- enabled means default-deny for those ops.)

-- ---------------------------------------------------------------------------
-- 6) Inline smoke test
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  cnt INT;
  applications_cols INT;
  decisions_cols INT;
BEGIN
  -- Tables exist
  SELECT COUNT(*) INTO cnt FROM information_schema.tables
   WHERE table_schema='public' AND table_name='hr_promotion_applications';
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'hr_promotion_applications table missing';
  END IF;

  SELECT COUNT(*) INTO cnt FROM information_schema.tables
   WHERE table_schema='public' AND table_name='hr_promotion_decisions';
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'hr_promotion_decisions table missing';
  END IF;

  -- Critical NOT NULL columns present (smoke against schema drift)
  SELECT COUNT(*) INTO applications_cols
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='hr_promotion_applications'
     AND column_name IN ('staff_id','hr_organization_id','institution_id',
                         'from_designation_name','to_designation_name','status',
                         'submitted_at','evidence_jsonb')
     AND is_nullable='NO';
  IF applications_cols < 8 THEN
    RAISE EXCEPTION 'hr_promotion_applications missing one of the required NOT NULL columns (got % of 8)', applications_cols;
  END IF;

  SELECT COUNT(*) INTO decisions_cols
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='hr_promotion_decisions'
     AND column_name IN ('application_id','event_type','actor_id','created_at')
     AND is_nullable='NO';
  IF decisions_cols < 4 THEN
    RAISE EXCEPTION 'hr_promotion_decisions missing one of the required NOT NULL columns (got % of 4)', decisions_cols;
  END IF;

  -- RLS is enabled
  SELECT relrowsecurity::int INTO cnt FROM pg_class
   WHERE relname='hr_promotion_applications' AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public');
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'RLS not enabled on hr_promotion_applications';
  END IF;

  SELECT relrowsecurity::int INTO cnt FROM pg_class
   WHERE relname='hr_promotion_decisions' AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public');
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'RLS not enabled on hr_promotion_decisions';
  END IF;

  -- Policy is seeded (consumed by the service layer)
  SELECT COUNT(*) INTO cnt FROM public.platform_policies
   WHERE policy_key='hr.promotion_policy' AND is_active=true;
  IF cnt < 1 THEN
    RAISE EXCEPTION 'hr.promotion_policy not seeded (expected via PR #904 / 20260609 governance seeds)';
  END IF;

  RAISE NOTICE 'T5.2 promotion workflow smoke test PASSED — tables, RLS, policy reader all wired.';
END $$;
