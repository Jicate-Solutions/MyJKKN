-- =====================================================================
-- Campus Living — hostel_general_settings table
-- Date: 2026-04-24
-- Agent: F (migrations only; paired with Agent G service/hook wiring)
-- Context: PR #449 (Agent D, settings fake-Save audit) left
--          /campus-living/settings/general in preview mode because the
--          backing table did not exist. This migration creates the
--          table + RLS + triggers + seed so Agent G can wire the real
--          save handler (single-row-per-institution upsert pattern).
--
-- Schema spec'd inline in the page's docstring by Agent D:
--   app/(routes)/campus-living/settings/general/page.tsx
--
-- What this migration does:
--
--   PHASE 1: CREATE TABLE hostel_general_settings — one row per
--            institution (UNIQUE institution_id). Stores academic-year
--            selection, curfew window, visitor-hours window, and mess
--            cutoff/pricing defaults. These are the values the settings
--            page gates on "Save Changes".
--
--   PHASE 2: updated_at BEFORE UPDATE trigger using the existing
--            update_updated_at_column() convention.
--
--   PHASE 3: RLS — 4 policies using the canonical CLAUDE.md pattern
--            (is_super_admin() OR is_admin() OR (user_has_permission +
--            role_has_institution_access)). DELETE is super_admin/admin
--            only — there should never be more than one row per
--            institution, so deletion is an emergency-only operation.
--
--   PHASE 4: Seed one row per existing institution with the same
--            defaults the page shows today. ON CONFLICT (institution_id)
--            DO NOTHING so re-running is safe and doesn't overwrite
--            admin-edited values.
--
-- Default value choices (match Agent D's docstring AND the page form):
--   curfew_start_time        '22:00' -- page default
--   curfew_end_time          '06:00' -- page default
--   visitor_hours_start      '09:00' -- page default
--   visitor_hours_end        '18:00' -- page default
--   visitor_max_duration_hrs 4
--   mess_meal_cutoff_hours   2
--   mess_guest_meal_price    150.00
--   mess_allow_opt_out       true
--   current_semester         'even'  -- page default (matches "2025-26 even")
--
-- Note on dispatch-brief vs page defaults: the dispatch brief suggested
-- curfew 21:30-22:00 and visitor hours 16:00-19:00. I deliberately used
-- the page's own defaults (22:00/06:00 and 09:00/18:00) because:
--   1. Agent D's docstring locks those same defaults as the column DEFAULTs.
--   2. The page already renders those values — seeding different ones
--      would mean an admin's first Save silently widens the window
--      vs. what they saw on load.
--   3. "Match what the UI shows" > "match the dispatch brief's example".
-- Flagged in PR body; flip trivially if coordinator wants dispatch-brief values.
--
-- Atomicity: single BEGIN/COMMIT — all-or-nothing.
-- Idempotency: CREATE TABLE IF NOT EXISTS, ON CONFLICT DO NOTHING,
--              DROP POLICY IF EXISTS, DROP TRIGGER IF EXISTS.
-- Rollback: drop policies, drop trigger, drop table.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- PHASE 1: hostel_general_settings table
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.hostel_general_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    current_academic_year_id UUID REFERENCES public.academic_years(id),
    current_semester TEXT,
    curfew_start_time TIME NOT NULL DEFAULT '22:00',
    curfew_end_time TIME NOT NULL DEFAULT '06:00',
    curfew_enforcement_enabled BOOLEAN NOT NULL DEFAULT true,
    visitor_hours_start TIME NOT NULL DEFAULT '09:00',
    visitor_hours_end TIME NOT NULL DEFAULT '18:00',
    visitor_max_duration_hours INT NOT NULL DEFAULT 4,
    visitor_require_id_proof BOOLEAN NOT NULL DEFAULT true,
    mess_meal_cutoff_hours INT NOT NULL DEFAULT 2,
    mess_guest_meal_price NUMERIC(10, 2) NOT NULL DEFAULT 150,
    mess_allow_opt_out BOOLEAN NOT NULL DEFAULT true,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_hostel_general_settings_institution
        UNIQUE (institution_id),
    CONSTRAINT chk_hostel_general_settings_semester
        CHECK (current_semester IS NULL OR current_semester IN ('odd', 'even')),
    CONSTRAINT chk_hostel_general_settings_visitor_duration_positive
        CHECK (visitor_max_duration_hours > 0),
    CONSTRAINT chk_hostel_general_settings_meal_cutoff_non_negative
        CHECK (mess_meal_cutoff_hours >= 0),
    CONSTRAINT chk_hostel_general_settings_guest_meal_price_non_negative
        CHECK (mess_guest_meal_price >= 0)
);

COMMENT ON TABLE public.hostel_general_settings IS
  'One row per institution. Stores campus-living-wide configuration: '
  'academic year/semester selection, curfew window, visitor-hours window, '
  'mess cutoff/pricing. Spec''d in '
  'app/(routes)/campus-living/settings/general/page.tsx docstring by '
  'Agent D, table created by Agent F in PR follow-up to #449. '
  'Single-row-per-institution invariant enforced by UNIQUE(institution_id).';

COMMENT ON COLUMN public.hostel_general_settings.current_semester IS
  'Machine code for the active semester within current_academic_year_id. '
  'Values: odd | even. NULL allowed until admin picks one.';

COMMENT ON COLUMN public.hostel_general_settings.curfew_start_time IS
  'Time of day curfew begins (wall-clock, institution-local TZ). Default 22:00.';

COMMENT ON COLUMN public.hostel_general_settings.curfew_end_time IS
  'Time of day curfew ends (wall-clock, institution-local TZ). Default 06:00. '
  'end < start is expected — curfew window spans midnight.';

COMMENT ON COLUMN public.hostel_general_settings.visitor_max_duration_hours IS
  'Max allowed visitor stay within visitor-hours window. Default 4h.';

COMMENT ON COLUMN public.hostel_general_settings.mess_meal_cutoff_hours IS
  'Advance-notice hours for meal opt-out requests. Default 2h.';

CREATE INDEX IF NOT EXISTS hostel_general_settings_institution_idx
  ON public.hostel_general_settings (institution_id);

ALTER TABLE public.hostel_general_settings ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- PHASE 2: updated_at trigger (canonical campus-living convention)
-- ---------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_hostel_general_settings_updated_at
  ON public.hostel_general_settings;
CREATE TRIGGER trg_hostel_general_settings_updated_at
  BEFORE UPDATE ON public.hostel_general_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- PHASE 3: RLS policies (canonical CLAUDE.md pattern)
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS hostel_general_settings_select_permission
  ON public.hostel_general_settings;
CREATE POLICY hostel_general_settings_select_permission
  ON public.hostel_general_settings FOR SELECT
  USING (
      is_super_admin() OR is_admin()
      OR (user_has_permission('campus_living.settings.view')
          AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS hostel_general_settings_insert_permission
  ON public.hostel_general_settings;
CREATE POLICY hostel_general_settings_insert_permission
  ON public.hostel_general_settings FOR INSERT
  WITH CHECK (
      is_super_admin() OR is_admin()
      OR (user_has_permission('campus_living.settings.edit')
          AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS hostel_general_settings_update_permission
  ON public.hostel_general_settings;
CREATE POLICY hostel_general_settings_update_permission
  ON public.hostel_general_settings FOR UPDATE
  USING (
      is_super_admin() OR is_admin()
      OR (user_has_permission('campus_living.settings.edit')
          AND role_has_institution_access(institution_id))
  )
  WITH CHECK (
      is_super_admin() OR is_admin()
      OR (user_has_permission('campus_living.settings.edit')
          AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS hostel_general_settings_delete_permission
  ON public.hostel_general_settings;
CREATE POLICY hostel_general_settings_delete_permission
  ON public.hostel_general_settings FOR DELETE
  USING (
      is_super_admin() OR is_admin()
  );

-- ---------------------------------------------------------------------
-- PHASE 4: Seed one row per institution with the page's defaults
-- ---------------------------------------------------------------------

INSERT INTO public.hostel_general_settings (
    institution_id,
    current_semester,
    curfew_start_time,
    curfew_end_time,
    curfew_enforcement_enabled,
    visitor_hours_start,
    visitor_hours_end,
    visitor_max_duration_hours,
    visitor_require_id_proof,
    mess_meal_cutoff_hours,
    mess_guest_meal_price,
    mess_allow_opt_out
)
SELECT
    i.id AS institution_id,
    'even' AS current_semester,
    '22:00'::time AS curfew_start_time,
    '06:00'::time AS curfew_end_time,
    true  AS curfew_enforcement_enabled,
    '09:00'::time AS visitor_hours_start,
    '18:00'::time AS visitor_hours_end,
    4     AS visitor_max_duration_hours,
    true  AS visitor_require_id_proof,
    2     AS mess_meal_cutoff_hours,
    150   AS mess_guest_meal_price,
    true  AS mess_allow_opt_out
FROM public.institutions i
ON CONFLICT (institution_id) DO NOTHING;

COMMIT;

-- =====================================================================
-- Post-migration verification (run in Supabase SQL Editor)
-- =====================================================================
--
-- -- 1. Seed populated for all institutions:
-- SELECT i.name AS institution,
--        gs.id IS NOT NULL AS has_settings_row
-- FROM public.institutions i
-- LEFT JOIN public.hostel_general_settings gs ON gs.institution_id = i.id
-- ORDER BY i.name;
-- -- Expected: has_settings_row = true for every institution.
--
-- -- 2. UNIQUE constraint enforced:
-- SELECT institution_id, COUNT(*) AS rows_per_institution
-- FROM public.hostel_general_settings
-- GROUP BY institution_id
-- HAVING COUNT(*) > 1;
-- -- Expected: 0 rows (no duplicates).
--
-- -- 3. RLS policies:
-- SELECT policyname, cmd
-- FROM pg_policies
-- WHERE tablename = 'hostel_general_settings'
-- ORDER BY policyname;
-- -- Expected: 4 rows (select/insert/update/delete)_permission.
--
-- -- 4. Trigger installed:
-- SELECT tgname, tgenabled
-- FROM pg_trigger
-- WHERE tgrelid = 'public.hostel_general_settings'::regclass
--   AND NOT tgisinternal;
-- -- Expected: trg_hostel_general_settings_updated_at, O (origin).
