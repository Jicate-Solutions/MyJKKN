-- Migration: Foundation programme — student identity core (PR-B1)
-- Date: 2026-07-06
-- ADDITIVE. Creates fp_students / fp_cohorts / fp_enrollments (empty — no child data stored by creation).
-- Consent is an OPTIONAL admin toggle (foundation.require_parental_consent, default OFF), NOT a hard gate.
-- Minors'-PII RLS: super-admin only (NO is_admin cross-tenant bypass) + school-scope, via SECURITY DEFINER helpers (recursion-safe).
-- Reversible: DROP TABLE fp_enrollments, fp_cohorts, fp_students; DROP the 4 fn_fp_* helpers; DELETE the consent policy row.

BEGIN;

-- ---------- Tables ----------
CREATE TABLE IF NOT EXISTS public.fp_students (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  institution_id      uuid,
  profile_id          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,          -- child's own MyJKKN user (pilot)
  parent_profile_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,          -- parent's MyJKKN user (optional)
  learner_profile_id  uuid REFERENCES public.learners_profiles(id) ON DELETE SET NULL, -- funnel handoff (set on conversion)
  full_name           text NOT NULL,
  grade               text,
  parental_consent_at timestamptz,   -- OPTIONAL; enforced only when foundation.require_parental_consent is ON
  status              text NOT NULL DEFAULT 'active',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES public.profiles(id),
  updated_by          uuid REFERENCES public.profiles(id)
);
COMMENT ON TABLE public.fp_students IS 'Foundation programme students (minors). History follows the student: school_id is mutable on transfer, record persists. learner_profile_id links to college learner on funnel conversion. Added 2026-07-06 (PR-B1).';

CREATE TABLE IF NOT EXISTS public.fp_cohorts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id          uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exam_definition_id uuid NOT NULL REFERENCES public.exam_definitions(id) ON DELETE RESTRICT,
  institution_id     uuid,
  term               text,
  resource_person_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid REFERENCES public.profiles(id),
  updated_by         uuid REFERENCES public.profiles(id)
);
COMMENT ON TABLE public.fp_cohorts IS 'Foundation programme cohorts: a batch = school + exam (exam_definitions) + term, taught by a resource person. Added 2026-07-06 (PR-B1).';

CREATE TABLE IF NOT EXISTS public.fp_enrollments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL REFERENCES public.fp_students(id) ON DELETE CASCADE,
  cohort_id   uuid NOT NULL REFERENCES public.fp_cohorts(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'enrolled',
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fp_enrollments_unique UNIQUE (student_id, cohort_id)
);

CREATE INDEX IF NOT EXISTS idx_fp_students_school   ON public.fp_students (school_id);
CREATE INDEX IF NOT EXISTS idx_fp_students_profile  ON public.fp_students (profile_id);
CREATE INDEX IF NOT EXISTS idx_fp_students_parent   ON public.fp_students (parent_profile_id);
CREATE INDEX IF NOT EXISTS idx_fp_students_learner  ON public.fp_students (learner_profile_id);
CREATE INDEX IF NOT EXISTS idx_fp_cohorts_school    ON public.fp_cohorts (school_id);
CREATE INDEX IF NOT EXISTS idx_fp_cohorts_exam      ON public.fp_cohorts (exam_definition_id);
CREATE INDEX IF NOT EXISTS idx_fp_enroll_student    ON public.fp_enrollments (student_id);
CREATE INDEX IF NOT EXISTS idx_fp_enroll_cohort     ON public.fp_enrollments (cohort_id);

DROP TRIGGER IF EXISTS trg_fp_students_touch    ON public.fp_students;
DROP TRIGGER IF EXISTS trg_fp_cohorts_touch     ON public.fp_cohorts;
DROP TRIGGER IF EXISTS trg_fp_enrollments_touch ON public.fp_enrollments;
CREATE TRIGGER trg_fp_students_touch    BEFORE UPDATE ON public.fp_students    FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
CREATE TRIGGER trg_fp_cohorts_touch     BEFORE UPDATE ON public.fp_cohorts     FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
CREATE TRIGGER trg_fp_enrollments_touch BEFORE UPDATE ON public.fp_enrollments FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- ---------- Recursion-safe SECURITY DEFINER scope helpers ----------
CREATE OR REPLACE FUNCTION public.fn_fp_manages_school(p_school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.school_jkkn_owners o
    WHERE o.school_id = p_school_id AND o.jkkn_user_id = auth.uid() AND o.is_active);
$$;

CREATE OR REPLACE FUNCTION public.fn_fp_manages_cohort_school(p_cohort_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.fp_cohorts c
    JOIN public.school_jkkn_owners o ON o.school_id = c.school_id
    WHERE c.id = p_cohort_id AND o.jkkn_user_id = auth.uid() AND o.is_active);
$$;

CREATE OR REPLACE FUNCTION public.fn_fp_teaches_student(p_student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.fp_enrollments e
    JOIN public.fp_cohorts c ON c.id = e.cohort_id
    WHERE e.student_id = p_student_id AND c.resource_person_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.fn_fp_is_own_or_guardian(p_student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.fp_students s
    WHERE s.id = p_student_id AND (s.profile_id = auth.uid() OR s.parent_profile_id = auth.uid()));
$$;

REVOKE EXECUTE ON FUNCTION public.fn_fp_manages_school(uuid)        FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_fp_manages_cohort_school(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_fp_teaches_student(uuid)       FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_fp_is_own_or_guardian(uuid)    FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_fp_manages_school(uuid)        TO authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_fp_manages_cohort_school(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_fp_teaches_student(uuid)       TO authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_fp_is_own_or_guardian(uuid)    TO authenticated;

-- ---------- RLS ----------
ALTER TABLE public.fp_students    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fp_cohorts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fp_enrollments ENABLE ROW LEVEL SECURITY;

-- fp_students: minors' PII — super-admin only (NO is_admin) + child/parent self + school mgmt + teacher
DROP POLICY IF EXISTS fp_students_select ON public.fp_students;
DROP POLICY IF EXISTS fp_students_insert ON public.fp_students;
DROP POLICY IF EXISTS fp_students_update ON public.fp_students;
DROP POLICY IF EXISTS fp_students_delete ON public.fp_students;

CREATE POLICY fp_students_select ON public.fp_students FOR SELECT USING (
  public.is_super_admin()
  OR profile_id = auth.uid()
  OR parent_profile_id = auth.uid()
  OR public.fn_fp_manages_school(school_id)
  OR public.fn_fp_teaches_student(id)
);
CREATE POLICY fp_students_insert ON public.fp_students FOR INSERT WITH CHECK (
  public.is_super_admin()
  OR (public.user_has_permission('foundation.students.manage') AND public.fn_fp_manages_school(school_id))
);
CREATE POLICY fp_students_update ON public.fp_students FOR UPDATE USING (
  public.is_super_admin()
  OR (public.user_has_permission('foundation.students.manage') AND public.fn_fp_manages_school(school_id))
) WITH CHECK (
  public.is_super_admin()
  OR (public.user_has_permission('foundation.students.manage') AND public.fn_fp_manages_school(school_id))
);
CREATE POLICY fp_students_delete ON public.fp_students FOR DELETE USING (
  public.is_super_admin()
  OR (public.user_has_permission('foundation.students.manage') AND public.fn_fp_manages_school(school_id))
);

-- fp_cohorts: batch metadata (non-PII)
DROP POLICY IF EXISTS fp_cohorts_select ON public.fp_cohorts;
DROP POLICY IF EXISTS fp_cohorts_write  ON public.fp_cohorts;
CREATE POLICY fp_cohorts_select ON public.fp_cohorts FOR SELECT USING (
  public.is_super_admin()
  OR resource_person_id = auth.uid()
  OR public.fn_fp_manages_school(school_id)
  OR public.user_has_permission('foundation.cohorts.view')
);
CREATE POLICY fp_cohorts_write ON public.fp_cohorts FOR ALL USING (
  public.is_super_admin()
  OR (public.user_has_permission('foundation.cohorts.manage') AND public.fn_fp_manages_school(school_id))
) WITH CHECK (
  public.is_super_admin()
  OR (public.user_has_permission('foundation.cohorts.manage') AND public.fn_fp_manages_school(school_id))
);

-- fp_enrollments: reveals which student in which cohort — scope to staff + the student/guardian
DROP POLICY IF EXISTS fp_enrollments_select ON public.fp_enrollments;
DROP POLICY IF EXISTS fp_enrollments_write  ON public.fp_enrollments;
CREATE POLICY fp_enrollments_select ON public.fp_enrollments FOR SELECT USING (
  public.is_super_admin()
  OR public.fn_fp_manages_cohort_school(cohort_id)
  OR public.fn_fp_teaches_student(student_id)
  OR public.fn_fp_is_own_or_guardian(student_id)
);
CREATE POLICY fp_enrollments_write ON public.fp_enrollments FOR ALL USING (
  public.is_super_admin()
  OR (public.user_has_permission('foundation.students.manage') AND public.fn_fp_manages_cohort_school(cohort_id))
) WITH CHECK (
  public.is_super_admin()
  OR (public.user_has_permission('foundation.students.manage') AND public.fn_fp_manages_cohort_school(cohort_id))
);

-- ---------- Consent = OPTIONAL admin toggle (default OFF), NOT a hard gate ----------
INSERT INTO public.platform_policies (policy_key, scope_type, scope_id, value, data_type, description, is_system, is_active)
SELECT 'foundation.require_parental_consent', 'global', NULL, 'false'::jsonb, 'boolean',
       'When ON, the Foundation programme requires parental consent (fp_students.parental_consent_at) before storing a child''s performance data. Default OFF (optional) — admin switches on if needed. App reads via fn_get_policy_bool.',
       false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
  WHERE policy_key = 'foundation.require_parental_consent' AND scope_type = 'global' AND scope_id IS NULL
);

COMMIT;
