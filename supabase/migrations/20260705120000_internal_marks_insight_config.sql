-- 2026-07-05 - internal_marks_insight_config
-- Per-institution tunable lines for the Attendance-vs-Internal-Marks insight
-- (/academic/internal-marks/attendance-insight). Follows the config-table pattern:
-- every threshold a super-admin might tweak = a DB row + a super-admin UI to edit it,
-- zero deploys. Defaults match the platform-standard eligibility lines.
--
--   attendance_threshold      : attendance % that counts as "regular" (default 75)
--   anomaly_cia_threshold     : marks % at/above which low-attendance = "anomaly" (default 75)
--   struggling_cia_threshold  : marks % below which high-attendance = "struggling" (default 50)

CREATE TABLE IF NOT EXISTS public.internal_marks_insight_config (
  institution_id           uuid PRIMARY KEY REFERENCES public.institutions(id) ON DELETE CASCADE,
  attendance_threshold     integer NOT NULL DEFAULT 75  CHECK (attendance_threshold     BETWEEN 0 AND 100),
  anomaly_cia_threshold     integer NOT NULL DEFAULT 75  CHECK (anomaly_cia_threshold     BETWEEN 0 AND 100),
  struggling_cia_threshold integer NOT NULL DEFAULT 50  CHECK (struggling_cia_threshold BETWEEN 0 AND 100),
  updated_by               uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.internal_marks_insight_config ENABLE ROW LEVEL SECURITY;

-- Read: internal-marks viewers, scoped to their institutions (admins/super-admins see all).
DROP POLICY IF EXISTS imic_select ON public.internal_marks_insight_config;
CREATE POLICY imic_select ON public.internal_marks_insight_config
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.internal-marks.view') AND role_has_institution_access(institution_id))
);

-- Write: institution-marks editors, scoped; admins/super-admins anywhere.
DROP POLICY IF EXISTS imic_write ON public.internal_marks_insight_config;
CREATE POLICY imic_write ON public.internal_marks_insight_config
FOR ALL USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.internal-marks.edit') AND role_has_institution_access(institution_id))
) WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.internal-marks.edit') AND role_has_institution_access(institution_id))
);

-- Seed every existing institution with the standard defaults so admins have an
-- editable row from day one. Re-runnable: existing rows are left untouched.
INSERT INTO public.internal_marks_insight_config (institution_id)
SELECT id FROM public.institutions
ON CONFLICT (institution_id) DO NOTHING;
