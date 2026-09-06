-- ============================================================================
-- HR Recruitment Need Signal — Foundation Substrate (PR 1 of ~33-40)
-- ============================================================================
-- Spec: specs/hr-recruitment-need-signal-2026-05-24.md (53 decisions locked)
-- Interview: /myjkkn-module (38q) + /assumption-thrash (15q)
--
-- This migration creates:
--   1. hr_regulatory_bodies — CRUDable master (8 bodies seeded)
--   2. hr_specializations — master list of faculty specializations
--   3. hr_regulatory_norms — per body × program_type → SFR norms + counting rules
--   4. staff_specializations — junction: staff × specialization (multi-specialization)
--   5. institution_program_approvals — per-institution regulatory approval tracking
--   6. hr_staff_institution_allocation — cross-institution faculty allocation %
--   7. hr_peer_benchmarks — manual peer institution comparison data
--   8. ALTER TABLE staff ADD employment_type
--   9. ALTER TABLE profiles ADD date_of_birth
--   + RLS on all new tables
--   + Seed: 8 regulatory bodies
--
-- Decisions driving this migration:
--   AT.10: Bodies are CRUDable (not enum) — Director adds new bodies via admin UI
--   F1.4:  Faculty counting configurable per body (count_adjunct, weights)
--   F1.13: Cross-institution allocation via percentage
--   AT.2:  DOB on profiles (shared across student + staff)
--   Preflight gap: staff has no employment_type column
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. hr_regulatory_bodies — CRUDable master (Decision AT.10)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.hr_regulatory_bodies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  abbreviation text NOT NULL UNIQUE,
  description text,
  website_url text,
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_regulatory_bodies_abbr
  ON public.hr_regulatory_bodies(abbreviation);

COMMENT ON TABLE public.hr_regulatory_bodies IS
  'CRUDable master of regulatory bodies (AICTE/NMC/NCTE/PCI/INC/COA/BCI/UGC). Director can add new bodies via admin UI (Decision AT.10). is_system=true for seeded defaults.';

-- ============================================================================
-- 2. hr_specializations — master list (Decision F1.4 via AT.preflight)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.hr_specializations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  body_id uuid REFERENCES public.hr_regulatory_bodies(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_hr_specializations_name_body UNIQUE (name, body_id)
);

CREATE INDEX IF NOT EXISTS idx_hr_specializations_body
  ON public.hr_specializations(body_id);

COMMENT ON TABLE public.hr_specializations IS
  'Master list of faculty specializations (e.g., Oral Surgery, Pharmacology, Machine Learning). Body-scoped for regulatory alignment. Multi-specialization junction via staff_specializations.';

-- ============================================================================
-- 3. hr_regulatory_norms — per body × program_type (Decisions F1.4, F1.12, AT.5)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.hr_regulatory_norms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body_id uuid NOT NULL REFERENCES public.hr_regulatory_bodies(id),
  program_type text NOT NULL,
  sfr_norm_ratio numeric(5,1) NOT NULL,
  sfr_denominator_type text NOT NULL DEFAULT 'student'
    CHECK (sfr_denominator_type IN ('student', 'bed', 'custom')),
  count_adjunct boolean NOT NULL DEFAULT false,
  adjunct_weight numeric(3,2) NOT NULL DEFAULT 0.50,
  count_visiting boolean NOT NULL DEFAULT false,
  visiting_weight numeric(3,2) NOT NULL DEFAULT 0.25,
  threshold_amber_pct numeric(5,2) NOT NULL DEFAULT 100.00,
  threshold_red_pct numeric(5,2) NOT NULL DEFAULT 120.00,
  computation_function_ref text,
  effective_from date,
  effective_until date,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_hr_regulatory_norms_body_program
    UNIQUE (body_id, program_type, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_hr_regulatory_norms_body_program
  ON public.hr_regulatory_norms(body_id, program_type);

COMMENT ON TABLE public.hr_regulatory_norms IS
  'Regulatory norms per body × program_type. SFR ratio, counting rules for adjunct/visiting faculty (Decision F1.4), R/A/G thresholds with Director-override (F1.12), per-body algorithm plugin ref (AT.5). Effective dates support norm versioning for dual-display (AT.3: current + approval-time).';

-- ============================================================================
-- 4. staff_specializations — junction (Decision AT.preflight: multi-specialization)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.staff_specializations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  specialization_id uuid NOT NULL REFERENCES public.hr_specializations(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  verified_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_staff_specializations UNIQUE (staff_id, specialization_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_specializations_staff
  ON public.staff_specializations(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_specializations_spec
  ON public.staff_specializations(specialization_id);

COMMENT ON TABLE public.staff_specializations IS
  'Multi-specialization junction: a faculty can hold multiple specializations (e.g., Pharmacology + Pharmacognosy). is_primary marks the primary teaching specialization. verified_by tracks who confirmed the specialization.';

-- ============================================================================
-- 5. institution_program_approvals — regulatory approval tracking (Decision AT.preflight)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.institution_program_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  program_id uuid NOT NULL,
  body_id uuid NOT NULL REFERENCES public.hr_regulatory_bodies(id),
  sanctioned_faculty_count integer NOT NULL,
  approved_intake integer,
  approval_date date,
  renewal_due_date date,
  approval_reference text,
  norm_version_at_approval text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_inst_prog_approvals
    UNIQUE (institution_id, program_id, body_id, approval_date)
);

CREATE INDEX IF NOT EXISTS idx_inst_prog_approvals_inst
  ON public.institution_program_approvals(institution_id);
CREATE INDEX IF NOT EXISTS idx_inst_prog_approvals_body
  ON public.institution_program_approvals(body_id);

COMMENT ON TABLE public.institution_program_approvals IS
  'Per-institution regulatory approval tracking. sanctioned_faculty_count is the body-approved headcount that drives input #3 (sanctioned vs actual). norm_version_at_approval supports dual-norm display (Decision AT.3: current + approval-time side-by-side). renewal_due_date tracks AICTE 3-year renewal cycle.';

-- ============================================================================
-- 6. hr_staff_institution_allocation — cross-institution faculty (Decision F1.13)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.hr_staff_institution_allocation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  allocation_percentage numeric(5,2) NOT NULL
    CHECK (allocation_percentage > 0 AND allocation_percentage <= 100),
  academic_year text,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_until date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_staff_inst_allocation
    UNIQUE (staff_id, institution_id, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_staff_inst_alloc_staff
  ON public.hr_staff_institution_allocation(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_inst_alloc_inst
  ON public.hr_staff_institution_allocation(institution_id);

COMMENT ON TABLE public.hr_staff_institution_allocation IS
  'Cross-institution faculty allocation percentages. When one faculty teaches at 2 JKKN colleges, their headcount contribution is weighted (e.g., 70% at Dental, 30% at AHS). Signal engine uses this for accurate SFR computation (Decision F1.13). If no allocation row exists for a staff, defaults to 100% at their primary institution_id.';

-- ============================================================================
-- 7. hr_peer_benchmarks — manual peer comparison data (Input #7)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.hr_peer_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_name text NOT NULL,
  naac_grade text,
  program_type text NOT NULL,
  faculty_count integer,
  student_count integer,
  sfr_ratio numeric(5,1),
  source_url text,
  data_year integer,
  notes text,
  entered_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hr_peer_benchmarks IS
  'Manual-entry peer institution data for Input #7 (peer benchmark). Director enters comparison institutions with same NAAC grade. External data — not auto-populated. data_year tracks when the data was valid.';

-- ============================================================================
-- 8. ALTER TABLE staff — add employment_type (AT.preflight)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'staff'
      AND column_name = 'employment_type'
  ) THEN
    ALTER TABLE public.staff ADD COLUMN employment_type text NOT NULL DEFAULT 'full_time';
    COMMENT ON COLUMN public.staff.employment_type IS
      'Faculty employment classification: full_time (default) / adjunct / visiting / contractual. Drives counting rules in recruitment-need signal (Decision F1.4). Backfill existing rows as full_time.';
  END IF;
END $$;

-- ============================================================================
-- 9. ALTER TABLE profiles — add date_of_birth (Decision AT.2)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'date_of_birth'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN date_of_birth date;
    COMMENT ON COLUMN public.profiles.date_of_birth IS
      'Date of birth. Shared across student + staff. For staff: drives retirement projection in recruitment-need signal Input #6 (attrition pipeline). For students: age verification, hostel eligibility. Decision AT.2: add to profiles (shared) not staff.';
  END IF;
END $$;

-- ============================================================================
-- RLS — all new tables
-- ============================================================================

-- hr_regulatory_bodies: read open (all authenticated), write super_admin/admin
ALTER TABLE public.hr_regulatory_bodies ENABLE ROW LEVEL SECURITY;

CREATE POLICY hr_regulatory_bodies_select ON public.hr_regulatory_bodies
  FOR SELECT USING (true);

CREATE POLICY hr_regulatory_bodies_insert ON public.hr_regulatory_bodies
  FOR INSERT WITH CHECK (public.is_super_admin() OR public.is_admin());

CREATE POLICY hr_regulatory_bodies_update ON public.hr_regulatory_bodies
  FOR UPDATE USING (public.is_super_admin() OR public.is_admin());

CREATE POLICY hr_regulatory_bodies_delete ON public.hr_regulatory_bodies
  FOR DELETE USING (public.is_super_admin() OR public.is_admin());

-- hr_specializations: read open, write admin
ALTER TABLE public.hr_specializations ENABLE ROW LEVEL SECURITY;

CREATE POLICY hr_specializations_select ON public.hr_specializations
  FOR SELECT USING (true);

CREATE POLICY hr_specializations_write ON public.hr_specializations
  FOR ALL USING (public.is_super_admin() OR public.is_admin())
  WITH CHECK (public.is_super_admin() OR public.is_admin());

-- hr_regulatory_norms: read open, write super_admin/admin
ALTER TABLE public.hr_regulatory_norms ENABLE ROW LEVEL SECURITY;

CREATE POLICY hr_regulatory_norms_select ON public.hr_regulatory_norms
  FOR SELECT USING (true);

CREATE POLICY hr_regulatory_norms_write ON public.hr_regulatory_norms
  FOR ALL USING (public.is_super_admin() OR public.is_admin())
  WITH CHECK (public.is_super_admin() OR public.is_admin());

-- staff_specializations: read by same-institution staff, write by HR roles
ALTER TABLE public.staff_specializations ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_specializations_select ON public.staff_specializations
  FOR SELECT USING (
    public.is_super_admin() OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_specializations.staff_id
        AND s.profile_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.staff acting
      WHERE acting.profile_id = auth.uid()
        AND acting.role_key IN ('hr_officer','hr_admin','hr_manager','director','principal','cao')
    )
  );

CREATE POLICY staff_specializations_write ON public.staff_specializations
  FOR ALL USING (
    public.is_super_admin() OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.staff acting
      WHERE acting.profile_id = auth.uid()
        AND acting.role_key IN ('hr_officer','hr_admin','hr_manager','director')
    )
  )
  WITH CHECK (
    public.is_super_admin() OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.staff acting
      WHERE acting.profile_id = auth.uid()
        AND acting.role_key IN ('hr_officer','hr_admin','hr_manager','director')
    )
  );

-- institution_program_approvals: read by institution staff, write by admin
ALTER TABLE public.institution_program_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY inst_prog_approvals_select ON public.institution_program_approvals
  FOR SELECT USING (
    public.is_super_admin() OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.staff acting
      WHERE acting.profile_id = auth.uid()
        AND (acting.institution_id = institution_program_approvals.institution_id
             OR acting.role_key IN ('director','trust_secretary','chairperson'))
    )
  );

CREATE POLICY inst_prog_approvals_write ON public.institution_program_approvals
  FOR ALL USING (public.is_super_admin() OR public.is_admin())
  WITH CHECK (public.is_super_admin() OR public.is_admin());

-- hr_staff_institution_allocation: same as staff_specializations
ALTER TABLE public.hr_staff_institution_allocation ENABLE ROW LEVEL SECURITY;

CREATE POLICY hr_staff_inst_alloc_select ON public.hr_staff_institution_allocation
  FOR SELECT USING (
    public.is_super_admin() OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.staff acting
      WHERE acting.profile_id = auth.uid()
        AND acting.role_key IN ('hr_officer','hr_admin','hr_manager','director','principal','cao')
    )
  );

CREATE POLICY hr_staff_inst_alloc_write ON public.hr_staff_institution_allocation
  FOR ALL USING (
    public.is_super_admin() OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.staff acting
      WHERE acting.profile_id = auth.uid()
        AND acting.role_key IN ('hr_officer','hr_admin','hr_manager','director')
    )
  )
  WITH CHECK (
    public.is_super_admin() OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.staff acting
      WHERE acting.profile_id = auth.uid()
        AND acting.role_key IN ('hr_officer','hr_admin','hr_manager','director')
    )
  );

-- hr_peer_benchmarks: read open, write admin
ALTER TABLE public.hr_peer_benchmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY hr_peer_benchmarks_select ON public.hr_peer_benchmarks
  FOR SELECT USING (true);

CREATE POLICY hr_peer_benchmarks_write ON public.hr_peer_benchmarks
  FOR ALL USING (public.is_super_admin() OR public.is_admin())
  WITH CHECK (public.is_super_admin() OR public.is_admin());

-- ============================================================================
-- Seed: 8 regulatory bodies (Decision P1.4 + AT.10)
-- ============================================================================
INSERT INTO public.hr_regulatory_bodies (name, abbreviation, description, is_system)
VALUES
  ('All India Council for Technical Education', 'AICTE', 'Regulates engineering, management, pharmacy, architecture, hotel management, and applied arts programs', true),
  ('National Medical Commission', 'NMC', 'Regulates medical education and practice (replaced MCI)', true),
  ('National Council for Teacher Education', 'NCTE', 'Regulates teacher education programs (B.Ed, M.Ed, D.El.Ed)', true),
  ('Pharmacy Council of India', 'PCI', 'Regulates pharmacy education and practice', true),
  ('Indian Nursing Council', 'INC', 'Regulates nursing education programs', true),
  ('Council of Architecture', 'COA', 'Regulates architecture education and practice', true),
  ('Bar Council of India', 'BCI', 'Regulates legal education', true),
  ('University Grants Commission', 'UGC', 'Regulates university-level education, research grants, standards', true)
ON CONFLICT (abbreviation) DO NOTHING;

-- ============================================================================
-- updated_at triggers
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'hr_regulatory_bodies',
      'hr_specializations',
      'hr_regulatory_norms',
      'institution_program_approvals',
      'hr_staff_institution_allocation',
      'hr_peer_benchmarks'
    ])
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I; '
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();',
      tbl, tbl, tbl, tbl
    );
  END LOOP;
END $$;

-- ============================================================================
-- Verification
-- ============================================================================
DO $$
DECLARE
  v_body_count int;
  v_has_employment_type bool;
  v_has_dob bool;
BEGIN
  SELECT count(*) INTO v_body_count FROM public.hr_regulatory_bodies;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'staff' AND column_name = 'employment_type'
  ) INTO v_has_employment_type;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'date_of_birth'
  ) INTO v_has_dob;

  RAISE NOTICE 'HR Recruitment Need Foundation verified: % regulatory bodies seeded, staff.employment_type=%, profiles.date_of_birth=%',
    v_body_count, v_has_employment_type, v_has_dob;

  IF v_body_count < 8 THEN
    RAISE EXCEPTION 'Expected 8 regulatory bodies, got %', v_body_count;
  END IF;
  IF NOT v_has_employment_type THEN
    RAISE EXCEPTION 'staff.employment_type column not found';
  END IF;
  IF NOT v_has_dob THEN
    RAISE EXCEPTION 'profiles.date_of_birth column not found';
  END IF;
END $$;

COMMIT;
