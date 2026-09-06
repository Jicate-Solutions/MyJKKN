-- =====================================================================
-- hr_shift_timings — institution-wise shift timing configuration
-- =====================================================================
-- Plan: docs/superpowers/plans/2026-08-06-hr-shift-timings.md
--
-- Replaces four partial representations that could not express the
-- requirement (all were empty / unreachable):
--   * hr_shift_templates        single start/end, no weekday, no grace
--   * hr_work_schedules         has grace + working_days_mask, but its RLS
--                               gates on auth_hr_organization_id(), which reads
--                               user_hr_access — a table with ONE row DB-wide.
--                               The table is therefore invisible and unwritable
--                               to every non-super-admin, silently.
--   * platform_policies 'hr.working_schedule'   right grain, unread JSON blob
--   * hr_attendance_status_types.late_grace_minutes   grace on the wrong table
--
-- Tenancy is institution_id, NOT hr_organization_id. They are strictly 1:1
-- (hr_organizations has UNIQUE (institution_id)), so hr_organization_id buys
-- nothing and drags in the broken helper above. institution_id is NOT NULL on
-- all 861 staff and is the axis role_has_institution_access() gates on.
--
-- Staff category is employment_categories, NOT staff.role_type (all 861 rows
-- read 'teacher') and NOT hr_staff_details.cadre_id (covers only 314/861 and
-- contradicts staff.institution_id on 15 live staff).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.hr_shift_timings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,

  -- Most specific wins at resolution:
  --   'category'     -> exact employment_category_id
  --   'teaching'     -> employment_categories.is_teaching = true
  --   'non_teaching' -> employment_categories.is_teaching = false
  staff_scope text NOT NULL CHECK (staff_scope IN ('teaching','non_teaching','category')),
  employment_category_id uuid NULL REFERENCES public.employment_categories(id) ON DELETE CASCADE,

  -- ISO-8601: 1=Mon .. 7=Sun. Matches EXTRACT(ISODOW FROM date) exactly.
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),

  is_working_day boolean NOT NULL DEFAULT true,

  -- The two half-day session windows. They MAY overlap (09:00-13:00 / 12:30-16:30)
  -- — that is the real JKKN pattern, and the reason lunch_start/lunch_end on
  -- hr_work_schedules could not be reused: a lunch gap and a session overlap
  -- are opposites.
  first_half_start  time NULL,
  first_half_end    time NULL,
  second_half_start time NULL,
  second_half_end   time NULL,

  -- Applies to first_half_start ONLY. Confirmed requirement: morning punch only.
  grace_minutes integer NOT NULL DEFAULT 0 CHECK (grace_minutes BETWEEN 0 AND 240),

  -- 2nd Saturday of the month is non-working. Only meaningful when day_of_week = 6.
  second_saturday_holiday boolean NOT NULL DEFAULT false,

  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_until date NULL,

  notes text NULL,
  is_active boolean NOT NULL DEFAULT true,

  created_by uuid NULL REFERENCES public.profiles(id),
  updated_by uuid NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hr_shift_timings_scope_category_chk CHECK (
    (staff_scope =  'category' AND employment_category_id IS NOT NULL) OR
    (staff_scope <> 'category' AND employment_category_id IS NULL)
  ),

  CONSTRAINT hr_shift_timings_times_present_chk CHECK (
    (is_working_day = false
       AND first_half_start IS NULL AND first_half_end IS NULL
       AND second_half_start IS NULL AND second_half_end IS NULL)
    OR
    (is_working_day = true
       AND first_half_start IS NOT NULL AND first_half_end IS NOT NULL
       AND second_half_start IS NOT NULL AND second_half_end IS NOT NULL)
  ),

  -- Overlap between the halves is ALLOWED; inversion is not.
  CONSTRAINT hr_shift_timings_order_chk CHECK (
    is_working_day = false OR (
      first_half_end    >  first_half_start  AND
      second_half_end   >  second_half_start AND
      second_half_start >= first_half_start  AND
      second_half_end   >= first_half_end
    )
  ),

  CONSTRAINT hr_shift_timings_second_saturday_chk CHECK (
    second_saturday_holiday = false OR day_of_week = 6
  ),

  CONSTRAINT hr_shift_timings_effective_chk CHECK (
    effective_until IS NULL OR effective_until > effective_from
  )
);

COMMENT ON TABLE public.hr_shift_timings IS
  'Institution-wise shift timing config, grained on (institution, staff scope, weekday) and effective-dated. Two half-day session windows that may overlap; grace_minutes applies to first_half_start ONLY. Resolution is most-specific-wins: a staff_scope=category row beats teaching/non_teaching. Plan: docs/superpowers/plans/2026-08-06-hr-shift-timings.md';

COMMENT ON COLUMN public.hr_shift_timings.day_of_week IS 'ISO-8601 weekday: 1=Mon .. 7=Sun. Matches EXTRACT(ISODOW FROM date).';
COMMENT ON COLUMN public.hr_shift_timings.grace_minutes IS 'Late allowance on first_half_start ONLY. Punching within grace is on time; beyond it is flagged late but the day still counts full.';
COMMENT ON COLUMN public.hr_shift_timings.second_saturday_holiday IS 'When true and day_of_week=6, the 2nd Saturday of each month resolves as non-working.';

-- One live row per (institution, scope, category, weekday).
-- COALESCE is load-bearing: Postgres treats NULLs as DISTINCT in a plain UNIQUE
-- index, which would allow unlimited duplicate 'teaching' rows through.
-- Note none of hr_shift_templates / hr_shift_assignments / hr_work_schedules /
-- hr_biometric_punches has any unique constraint at all — do not repeat that.
CREATE UNIQUE INDEX IF NOT EXISTS hr_shift_timings_current_uq
  ON public.hr_shift_timings (
    institution_id,
    staff_scope,
    COALESCE(employment_category_id, '00000000-0000-0000-0000-000000000000'::uuid),
    day_of_week
  )
  WHERE effective_until IS NULL AND is_active;

CREATE INDEX IF NOT EXISTS hr_shift_timings_lookup
  ON public.hr_shift_timings (institution_id, day_of_week, effective_from DESC)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS hr_shift_timings_category
  ON public.hr_shift_timings (employment_category_id)
  WHERE employment_category_id IS NOT NULL;

DROP TRIGGER IF EXISTS hr_shift_timings_updated_at ON public.hr_shift_timings;
CREATE TRIGGER hr_shift_timings_updated_at
  BEFORE UPDATE ON public.hr_shift_timings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS. Mirrors the hr_attendance_status_types idiom. The (SELECT fn())
-- wrapping is load-bearing: it forces once-per-query evaluation and is the
-- fix for the 57014 statement-timeout class of bug.
--
-- Contrast with hr_shift_templates, whose write policies gate on
-- is_super_admin() OR is_admin() with NO permission key — which locks out
-- custom roles such as HR Head that hold every other HR key.
-- ---------------------------------------------------------------------
ALTER TABLE public.hr_shift_timings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_shift_timings_select ON public.hr_shift_timings;
CREATE POLICY hr_shift_timings_select ON public.hr_shift_timings
  FOR SELECT USING (
       (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('hr.shift_timings.view'))
        AND public.role_has_institution_access(institution_id))
    OR ((SELECT public.user_has_permission('hr.shift_timings.manage'))
        AND public.role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS hr_shift_timings_insert ON public.hr_shift_timings;
CREATE POLICY hr_shift_timings_insert ON public.hr_shift_timings
  FOR INSERT WITH CHECK (
       (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('hr.shift_timings.manage'))
        AND public.role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS hr_shift_timings_update ON public.hr_shift_timings;
CREATE POLICY hr_shift_timings_update ON public.hr_shift_timings
  FOR UPDATE USING (
       (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('hr.shift_timings.manage'))
        AND public.role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS hr_shift_timings_delete ON public.hr_shift_timings;
CREATE POLICY hr_shift_timings_delete ON public.hr_shift_timings
  FOR DELETE USING (
       (SELECT public.is_super_admin())
    OR ((SELECT public.is_admin())
        AND (SELECT public.user_has_permission('hr.shift_timings.manage'))
        AND public.role_has_institution_access(institution_id))
  );
