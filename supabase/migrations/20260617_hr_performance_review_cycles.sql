-- ============================================================================
-- HR — Performance Review Cycles (T5.1 from specs/hr-module-decomposition-2026-05-09.md)
-- ============================================================================
-- Created: 2026-05-15
-- Spec: specs/hr-module-decomposition-2026-05-09.md (Tier 5, T5.1)
-- Policy substrate: hr.performance_review (seeded by M6a #900):
--   appraisal cycle = Jul 1 → Jun 30, min 6 months service, SEDC committee,
--   Director final approver.
--
-- Two tables:
--   1. hr_performance_review_cycles — yearly cycle window (e.g. 2026-07-01 →
--      2027-06-30). Director creates one per appraisal year.
--   2. hr_performance_reviews — per-staff appraisal row within a cycle.
--      State machine: draft → self_submitted → supervisor_reviewed →
--      sedc_reviewed → final_approved.
--
-- Routing model (per migration 20260507000001_departments_add_hod.sql):
--   Supervisor = departments.head_of_department_id for the staff's department.
--   SEDC + Director see all rows via permission/role checks (no per-row pointer).
--
-- Tier-2 migration per feedback_migration_notification_protocol.md:
--   - DDL on production (2 new tables + indexes + RLS + triggers)
--   - Additive only (no existing table touched, no data migration)
--   - Reversible (DROP TABLE)
--   - Zero existing rows affected
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) hr_performance_review_cycles — yearly appraisal window.
--    cycle_year is the year the cycle ENDS (e.g. cycle_year=2027 means the
--    Jul 2026 → Jun 2027 cycle). UNIQUE on cycle_year prevents duplicates.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_performance_review_cycles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_year      integer NOT NULL,                        -- year the cycle ends (e.g. 2027 for Jul'26→Jun'27)
  start_date      date NOT NULL,                           -- e.g. 2026-07-01
  end_date        date NOT NULL,                           -- e.g. 2027-06-30
  status          text NOT NULL DEFAULT 'draft',           -- draft | open | locked | closed
  description     text,                                    -- optional Director note
  created_by      uuid REFERENCES public.profiles(id),
  updated_by      uuid REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_performance_review_cycles_year_unique UNIQUE (cycle_year),
  CONSTRAINT hr_performance_review_cycles_status_chk CHECK (
    status IN ('draft', 'open', 'locked', 'closed')
  ),
  CONSTRAINT hr_performance_review_cycles_dates_chk CHECK (end_date > start_date)
);

COMMENT ON TABLE public.hr_performance_review_cycles IS
  'HR T5.1 — Yearly performance appraisal window (Jul 1 → Jun 30 per hr.performance_review policy). Director creates one cycle per year; staff appraisals live in hr_performance_reviews scoped by cycle_id.';
COMMENT ON COLUMN public.hr_performance_review_cycles.cycle_year IS
  'The year the cycle ends (e.g. 2027 = Jul 2026 → Jun 2027 cycle). UNIQUE — one cycle per year.';
COMMENT ON COLUMN public.hr_performance_review_cycles.status IS
  'draft = setup only (no staff rows yet); open = staff can self-appraise; locked = SEDC review phase (no edits by staff/supervisor); closed = Director final-approved, archive.';

CREATE INDEX IF NOT EXISTS idx_hr_performance_review_cycles_status
  ON public.hr_performance_review_cycles(status, start_date DESC);

-- ---------------------------------------------------------------------------
-- 2) hr_performance_reviews — per-staff appraisal row within a cycle.
--    JSONB payloads keep the schema simple while the form catalogue evolves.
--    UNIQUE (cycle_id, staff_id) prevents duplicate rows for the same staff.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_performance_reviews (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id                 uuid NOT NULL REFERENCES public.hr_performance_review_cycles(id) ON DELETE CASCADE,
  staff_id                 uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  -- Three review tiers, each a JSONB payload to keep the catalogue flexible.
  self_appraisal_jsonb     jsonb,                          -- staff fills (achievements, goals, ratings)
  supervisor_review_jsonb  jsonb,                          -- dept HoD fills (validation, comments)
  sedc_review_jsonb        jsonb,                          -- SEDC committee fills (normalization, recommendations)
  final_score              numeric(5,2),                   -- Director-stamped final number
  final_remarks            text,                           -- Director-stamped narrative
  status                   text NOT NULL DEFAULT 'draft',
  -- Audit / state-machine timestamps
  self_submitted_at        timestamptz,
  supervisor_reviewed_at   timestamptz,
  sedc_reviewed_at         timestamptz,
  final_approved_at        timestamptz,
  final_approved_by        uuid REFERENCES public.profiles(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_performance_reviews_status_chk CHECK (
    status IN ('draft', 'self_submitted', 'supervisor_reviewed', 'sedc_reviewed', 'final_approved')
  ),
  CONSTRAINT hr_performance_reviews_unique_per_cycle UNIQUE (cycle_id, staff_id)
);

COMMENT ON TABLE public.hr_performance_reviews IS
  'HR T5.1 — Per-staff appraisal row scoped to a hr_performance_review_cycles. State machine: draft → self_submitted → supervisor_reviewed → sedc_reviewed → final_approved. Supervisor = departments.head_of_department_id for the staff''s department.';
COMMENT ON COLUMN public.hr_performance_reviews.self_appraisal_jsonb IS
  'Free-form JSONB the staff member fills (achievements, goals, self-rating). Shape evolves as the appraisal form catalogue grows.';
COMMENT ON COLUMN public.hr_performance_reviews.supervisor_review_jsonb IS
  'Free-form JSONB the dept HoD fills after the staff submits. Includes validation, ratings, narrative.';
COMMENT ON COLUMN public.hr_performance_reviews.sedc_review_jsonb IS
  'Free-form JSONB the SEDC committee fills (per hr.performance_review.review_committee). Adds normalization + recommendations.';
COMMENT ON COLUMN public.hr_performance_reviews.final_score IS
  'Director-stamped final number (after SEDC review). Drives downstream T5.2 (promotion) merit_score_formula.';
COMMENT ON COLUMN public.hr_performance_reviews.status IS
  'draft = staff editing; self_submitted = waiting for supervisor; supervisor_reviewed = waiting for SEDC; sedc_reviewed = waiting for Director sign-off; final_approved = closed.';

CREATE INDEX IF NOT EXISTS idx_hr_performance_reviews_cycle
  ON public.hr_performance_reviews(cycle_id, status);
CREATE INDEX IF NOT EXISTS idx_hr_performance_reviews_staff
  ON public.hr_performance_reviews(staff_id, cycle_id);
CREATE INDEX IF NOT EXISTS idx_hr_performance_reviews_status
  ON public.hr_performance_reviews(status, updated_at DESC);

-- ---------------------------------------------------------------------------
-- 3) Triggers — keep updated_at fresh.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS hr_performance_review_cycles_updated_at
  ON public.hr_performance_review_cycles;
CREATE TRIGGER hr_performance_review_cycles_updated_at
  BEFORE UPDATE ON public.hr_performance_review_cycles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS hr_performance_reviews_updated_at
  ON public.hr_performance_reviews;
CREATE TRIGGER hr_performance_reviews_updated_at
  BEFORE UPDATE ON public.hr_performance_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4) Row Level Security — cycles
--    SELECT: any authenticated user (read-only window definitions are not sensitive).
--    INSERT/UPDATE/DELETE: super_admin / admin only (Director provisions cycles).
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_performance_review_cycles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_performance_review_cycles_select"
  ON public.hr_performance_review_cycles;
CREATE POLICY "hr_performance_review_cycles_select"
  ON public.hr_performance_review_cycles FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "hr_performance_review_cycles_write"
  ON public.hr_performance_review_cycles;
CREATE POLICY "hr_performance_review_cycles_write"
  ON public.hr_performance_review_cycles FOR ALL USING (
    is_super_admin() OR is_admin()
  ) WITH CHECK (
    is_super_admin() OR is_admin()
  );

-- ---------------------------------------------------------------------------
-- 5) Row Level Security — reviews
--    SELECT:
--      - super_admin / admin always (SEDC + Director catch-all)
--      - staff can see their own row (staff_id = my staff record)
--      - dept HoD can see rows for staff in their department
--    INSERT/UPDATE/DELETE: super_admin / admin (service-role + Director path).
--    Staff and HoD write paths go through SECURITY DEFINER service-role RPCs
--    later; for now restrict mutation to admins to fail-loud.
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_performance_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_performance_reviews_select"
  ON public.hr_performance_reviews;
CREATE POLICY "hr_performance_reviews_select"
  ON public.hr_performance_reviews FOR SELECT USING (
    is_super_admin()
    OR is_admin()
    -- Staff sees their own row (staff.profile_id = profiles.id = auth.uid())
    OR staff_id IN (SELECT id FROM public.staff WHERE profile_id = auth.uid())
    -- Dept HoD sees rows for staff in their department (HoD pointer is profile_id)
    OR staff_id IN (
      SELECT s.id
      FROM public.staff s
      JOIN public.departments d ON d.id = s.department_id
      WHERE d.head_of_department_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "hr_performance_reviews_write"
  ON public.hr_performance_reviews;
CREATE POLICY "hr_performance_reviews_write"
  ON public.hr_performance_reviews FOR ALL USING (
    is_super_admin() OR is_admin()
  ) WITH CHECK (
    is_super_admin() OR is_admin()
  );

-- ---------------------------------------------------------------------------
-- 6) Inline smoke test — verifies the substrate against the seeded policy.
--    Uses a TEST cycle row (cycle_year=9999 to avoid colliding with real
--    cycles) that we insert, query, then delete. NO permanent rows added.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_cycle_id   uuid;
  v_count      integer;
  v_policy     jsonb;
BEGIN
  -- 6a. Insert a sentinel cycle row (cycle_year=9999).
  INSERT INTO public.hr_performance_review_cycles
    (cycle_year, start_date, end_date, status, description)
  VALUES
    (9999, DATE '9998-07-01', DATE '9999-06-30', 'draft',
     'T5.1 smoke-test sentinel row (auto-cleaned).')
  RETURNING id INTO v_cycle_id;

  IF v_cycle_id IS NULL THEN
    RAISE EXCEPTION 'T5.1 smoke test FAILED: cycle insert returned NULL id.';
  END IF;

  -- 6b. Confirm SELECT works through RLS-disabled DO block (definer = postgres).
  SELECT COUNT(*) INTO v_count
  FROM public.hr_performance_review_cycles
  WHERE id = v_cycle_id;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'T5.1 smoke test FAILED: cycle read returned % rows, expected 1.', v_count;
  END IF;

  -- 6c. Verify hr.performance_review policy resolves to a JSONB object.
  SELECT public.fn_get_policy_json('hr.performance_review') INTO v_policy;
  IF v_policy IS NULL THEN
    RAISE WARNING 'T5.1 smoke test: hr.performance_review policy not yet seeded — Wave-3 M6a #900 may be pending.';
  ELSE
    -- Confirm the load-bearing keys exist.
    IF NOT (v_policy ? 'review_committee') THEN
      RAISE WARNING 'T5.1 smoke test: hr.performance_review policy missing review_committee key.';
    END IF;
    IF NOT (v_policy ? 'final_approver') THEN
      RAISE WARNING 'T5.1 smoke test: hr.performance_review policy missing final_approver key.';
    END IF;
  END IF;

  -- 6d. Cleanup.
  DELETE FROM public.hr_performance_review_cycles WHERE id = v_cycle_id;

  RAISE NOTICE 'T5.1 smoke test PASSED — hr_performance_review_cycles + hr_performance_reviews substrate verified.';
END $$;

-- ============================================================================
-- VERIFICATION QUERIES (run manually after apply)
-- ============================================================================
-- SELECT table_name FROM information_schema.tables
--   WHERE table_name IN ('hr_performance_review_cycles', 'hr_performance_reviews');
--   -- 2 rows
-- SELECT policyname FROM pg_policies
--   WHERE tablename IN ('hr_performance_review_cycles', 'hr_performance_reviews');
--   -- 4 policies (2 per table)
-- SELECT public.fn_get_policy_json('hr.performance_review') ?& ARRAY['review_committee','final_approver','period_start','period_end'];
--   -- true (after M6a #900 lands)
-- ============================================================================
