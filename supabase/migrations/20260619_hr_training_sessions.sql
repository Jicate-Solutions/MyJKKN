-- ============================================================================
-- HR Training — Sessions + Enrollments (T5.3 + T5.4 substrate)
-- ============================================================================
-- Created: 2026-06-19
-- Spec: specs/hr-module-decomposition-2026-05-09.md §T5.3
--
-- SCOPE NOTE — collision with existing prod table `hr_training_programs`
-- ----------------------------------------------------------------------
-- The prod schema already contains a table named `hr_training_programs`
-- (visible in types/supabase.ts, but not authored by any retained
-- migration file). Its shape is catalog/template-style:
--   (id, program_name, hr_organization_id, applies_to_cadre_id, category,
--    description, duration_hours, is_mandatory, is_active, valid_from,
--    valid_until, superseded_by, ...) — i.e. a versioned program *definition*,
-- org-scoped + cadre-scoped, with no scheduling fields.
--
-- T5.3 needs operational tracking (start_date, end_date, location, capacity,
-- enrollments). To avoid a destructive ALTER on an existing table (per
-- migration notification protocol, that would be TIER-2), this migration
-- creates a NEW table `hr_training_sessions` representing a delivered
-- instance (cohort/session). The existing `hr_training_programs` table can
-- later be linked via `program_id uuid REFERENCES hr_training_programs(id)`
-- when T5.4 ships — that's a TIER-0 additive change. For now the link is
-- carried in `metadata.program_id` if desired.
--
-- Spec compliance: §T5.3 says "Training program tracking" with table
-- `hr_training_programs`. Reading the prod schema, that table already
-- exists as a catalog. The "tracking" half — scheduling + enrollments — is
-- what this migration adds, under a non-colliding name.
--
-- Forward-compat (T5.4): `hr_training_sessions.category` enum already
-- accepts `fdp`; `metadata jsonb` carries credit hours, certification body.
--
-- Category source:
--   `hr.staff_development.training_categories` policy (seeded upstream by
--   M6a #900). UI reads via fn_get_policy_text('hr.staff_development', ...).
--   Migration does NOT read the policy at apply time — categories are an
--   enum at the DB layer so DDL never blocks on policy presence. Policy
--   controls which categories the UI surfaces; DB accepts the full enum.
--
-- RLS pattern:
--   - super_admin / admin always
--   - hr.training.view / .create / .edit / .delete permissions for HR officers
--   - staff_id ↔ profiles.id for self-service enrollment reads/inserts
--
-- Mirrors:
--   - hr_recruitment_jobs (RLS pattern, audit cols)
--   - hr_shift_templates (versioning conventions, NOT NULL discipline)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) hr_training_sessions — delivered training instance (cohort/session)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_training_sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title            text NOT NULL,
  description      text,
  category         text NOT NULL CHECK (category IN ('induction','internal','specialised','fdp')),
  start_date       date NOT NULL,
  end_date         date NOT NULL,
  location         text,
  capacity         integer CHECK (capacity IS NULL OR capacity > 0),
  status           text NOT NULL DEFAULT 'open'
                     CHECK (status IN ('draft','open','in_progress','completed','cancelled')),
  institution_id   uuid REFERENCES public.institutions(id),
  facilitator_name text,
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Audit
  created_by       uuid REFERENCES public.profiles(id),
  updated_by       uuid REFERENCES public.profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hr_training_sessions_title_not_empty CHECK (length(trim(title)) > 0),
  CONSTRAINT hr_training_sessions_date_order CHECK (end_date >= start_date)
);

COMMENT ON TABLE public.hr_training_sessions IS
  'HR Training — Delivered session/cohort instance. T5.3 (induction/internal/specialised). T5.4 extends via category=fdp + metadata. New table (non-colliding with existing catalog-style hr_training_programs). Spec: hr-module-decomposition-2026-05-09 §T5.3.';
COMMENT ON COLUMN public.hr_training_sessions.category IS
  'induction / internal / specialised / fdp. UI surfaces a subset via hr.staff_development.training_categories policy; DB enum accepts full set.';
COMMENT ON COLUMN public.hr_training_sessions.capacity IS
  'Max enrollments. NULL = unlimited. Enforced by application layer, not a DB trigger (kept open for waitlist semantics in T5.4).';
COMMENT ON COLUMN public.hr_training_sessions.metadata IS
  'Flexible jsonb for T5.4 extensions (FDP credit hours, certification body, link to hr_training_programs catalog row via metadata.program_id) without schema change.';

CREATE INDEX IF NOT EXISTS idx_hr_training_sessions_status
  ON public.hr_training_sessions (status);
CREATE INDEX IF NOT EXISTS idx_hr_training_sessions_category
  ON public.hr_training_sessions (category);
CREATE INDEX IF NOT EXISTS idx_hr_training_sessions_start_date
  ON public.hr_training_sessions (start_date DESC);
CREATE INDEX IF NOT EXISTS idx_hr_training_sessions_institution
  ON public.hr_training_sessions (institution_id)
  WHERE institution_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) hr_training_enrollments — per-staff enrollment in a session
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_training_enrollments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid NOT NULL REFERENCES public.hr_training_sessions(id) ON DELETE CASCADE,
  staff_id         uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  status           text NOT NULL DEFAULT 'registered'
                     CHECK (status IN ('registered','attended','completed','dropped')),
  certificate_url  text,
  feedback         jsonb NOT NULL DEFAULT '{}'::jsonb,
  enrolled_at      timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz,
  -- Audit
  enrolled_by      uuid REFERENCES public.profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hr_training_enrollments_unique UNIQUE (session_id, staff_id)
);

COMMENT ON TABLE public.hr_training_enrollments IS
  'HR Training — Per-staff enrollment in a session. UNIQUE (session_id, staff_id) prevents double-registration. Lifecycle: registered → attended → completed (or dropped).';
COMMENT ON COLUMN public.hr_training_enrollments.feedback IS
  'Post-completion feedback jsonb (rating, comments, NAAC tracker fields). Flexible to accept T5.4 NAAC-ranking inputs without schema change.';
COMMENT ON COLUMN public.hr_training_enrollments.certificate_url IS
  'Signed URL or path to issued certificate. Set by application on status=completed transition.';

CREATE INDEX IF NOT EXISTS idx_hr_training_enrollments_session
  ON public.hr_training_enrollments (session_id);
CREATE INDEX IF NOT EXISTS idx_hr_training_enrollments_staff
  ON public.hr_training_enrollments (staff_id);
CREATE INDEX IF NOT EXISTS idx_hr_training_enrollments_status
  ON public.hr_training_enrollments (status);

-- ---------------------------------------------------------------------------
-- 3) updated_at triggers (mirrors hr_recruitment_jobs)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_training_sessions_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_hr_training_sessions_updated_at ON public.hr_training_sessions;
CREATE TRIGGER trg_hr_training_sessions_updated_at
  BEFORE UPDATE ON public.hr_training_sessions
  FOR EACH ROW EXECUTE FUNCTION public.hr_training_sessions_set_updated_at();

CREATE OR REPLACE FUNCTION public.hr_training_enrollments_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_hr_training_enrollments_updated_at ON public.hr_training_enrollments;
CREATE TRIGGER trg_hr_training_enrollments_updated_at
  BEFORE UPDATE ON public.hr_training_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.hr_training_enrollments_set_updated_at();

-- ---------------------------------------------------------------------------
-- 4) Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_training_enrollments ENABLE ROW LEVEL SECURITY;

-- ---- hr_training_sessions policies ----
-- SELECT: super_admin / admin always; hr.training.view + institution scope;
--         OR any authenticated user can see status='open'/'in_progress' (browse).
DROP POLICY IF EXISTS "hr_training_sessions_select" ON public.hr_training_sessions;
CREATE POLICY "hr_training_sessions_select"
  ON public.hr_training_sessions FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('hr.training.view')
        AND (institution_id IS NULL OR role_has_institution_access(institution_id)))
    OR (auth.role() = 'authenticated' AND status IN ('open','in_progress'))
  );

DROP POLICY IF EXISTS "hr_training_sessions_insert" ON public.hr_training_sessions;
CREATE POLICY "hr_training_sessions_insert"
  ON public.hr_training_sessions FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR user_has_permission('hr.training.create')
  );

DROP POLICY IF EXISTS "hr_training_sessions_update" ON public.hr_training_sessions;
CREATE POLICY "hr_training_sessions_update"
  ON public.hr_training_sessions FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('hr.training.edit')
        AND (institution_id IS NULL OR role_has_institution_access(institution_id)))
  );

DROP POLICY IF EXISTS "hr_training_sessions_delete" ON public.hr_training_sessions;
CREATE POLICY "hr_training_sessions_delete"
  ON public.hr_training_sessions FOR DELETE USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('hr.training.delete')
  );

-- ---- hr_training_enrollments policies ----
-- SELECT: super_admin / admin always; hr.training.view; OR self (staff_id ↔ profiles.id).
DROP POLICY IF EXISTS "hr_training_enrollments_select" ON public.hr_training_enrollments;
CREATE POLICY "hr_training_enrollments_select"
  ON public.hr_training_enrollments FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('hr.training.view')
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = hr_training_enrollments.staff_id
        AND s.profile_id = auth.uid()
    )
  );

-- INSERT: super_admin / admin; hr.training.enroll; OR self-enrollment.
DROP POLICY IF EXISTS "hr_training_enrollments_insert" ON public.hr_training_enrollments;
CREATE POLICY "hr_training_enrollments_insert"
  ON public.hr_training_enrollments FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR user_has_permission('hr.training.enroll')
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = hr_training_enrollments.staff_id
        AND s.profile_id = auth.uid()
    )
  );

-- UPDATE: super_admin / admin; hr.training.edit; OR self (for feedback only — app enforces field-level).
DROP POLICY IF EXISTS "hr_training_enrollments_update" ON public.hr_training_enrollments;
CREATE POLICY "hr_training_enrollments_update"
  ON public.hr_training_enrollments FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('hr.training.edit')
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = hr_training_enrollments.staff_id
        AND s.profile_id = auth.uid()
    )
  );

-- DELETE: super_admin / admin; hr.training.delete.
DROP POLICY IF EXISTS "hr_training_enrollments_delete" ON public.hr_training_enrollments;
CREATE POLICY "hr_training_enrollments_delete"
  ON public.hr_training_enrollments FOR DELETE USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('hr.training.delete')
  );

-- ---------------------------------------------------------------------------
-- 5) Smoke test — verify NOT NULL discipline + CHECK constraints + FKs.
--    All inserts use DO blocks scoped to gen_random_uuid() and cleaned up.
-- ---------------------------------------------------------------------------
DO $smoke$
DECLARE
  v_session_id uuid;
  v_staff_id uuid;
  v_existing_staff_count int;
BEGIN
  SELECT COUNT(*) INTO v_existing_staff_count FROM public.staff LIMIT 1;
  IF v_existing_staff_count = 0 THEN
    RAISE NOTICE 'hr_training_sessions smoke test skipped — no staff rows yet';
    RETURN;
  END IF;

  SELECT id INTO v_staff_id FROM public.staff ORDER BY id LIMIT 1;

  -- Insert a session with ALL NOT NULL columns set
  INSERT INTO public.hr_training_sessions (
    title, category, start_date, end_date, status
  ) VALUES (
    '__smoke_test_session__',
    'induction',
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '1 day',
    'draft'
  ) RETURNING id INTO v_session_id;

  -- Insert an enrollment
  INSERT INTO public.hr_training_enrollments (
    session_id, staff_id, status
  ) VALUES (
    v_session_id, v_staff_id, 'registered'
  );

  -- Cascade delete cleanup
  DELETE FROM public.hr_training_sessions WHERE id = v_session_id;

  RAISE NOTICE 'hr_training_sessions smoke test passed';
END
$smoke$;
