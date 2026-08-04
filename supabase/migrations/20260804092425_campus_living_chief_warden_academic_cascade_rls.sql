-- Let campus-living settings admins (Chief Warden) read the academic cascade
-- for the colleges a hostel block actually serves.
--
-- Why the dropdowns were empty: "Add Room Eligibility Rule" offers an
-- Institution list scoped to hostel_block_institutions for the chosen block --
-- deliberately cross-institution, since one hostel houses several colleges.
-- But degrees_select_by_role (and its department/program/semester twins) only
-- admit is_super_admin/is_admin, own-institution scope, or an
-- organizations.*.view key. chief_warden has institution_scope='own', its own
-- institution is an administrative office rather than a college, and all four
-- organizations.*.view keys are false -> zero rows, with no error. A silent
-- empty dropdown that reads as "no degrees exist".
--
-- Additive by design: RLS policies are permissive (OR'd together), so these can
-- only widen access and cannot affect any existing role's result set.
--
-- Deliberately NOT granting organizations.*.view instead: those keys drive
-- sidebar entries in lib/sidebarMenuLink.ts, so granting them would push four
-- Organizations pages into the warden's navigation and expose every college's
-- academic tree rather than just the block-served ones.
--
-- user_has_permission() is wrapped in a scalar subquery so the planner
-- evaluates it ONCE per query instead of once per row -- the same idiom the
-- surrounding policies on these tables already use.
--
-- Verified on apply (2026-08-04):
--   chief_warden (girlschiefwarden@jkkn.ac.in): degrees 0 -> 11, departments 50,
--     programs 65, semesters 368; Allied Health degree now visible.
--   plain warden (no campus_living.settings.view): still 0 across all three.

DROP POLICY IF EXISTS degrees_select_campus_living_settings     ON public.degrees;
DROP POLICY IF EXISTS departments_select_campus_living_settings ON public.departments;
DROP POLICY IF EXISTS programs_select_campus_living_settings    ON public.programs;
DROP POLICY IF EXISTS semesters_select_campus_living_settings   ON public.semesters;

CREATE POLICY degrees_select_campus_living_settings ON public.degrees
  FOR SELECT TO authenticated
  USING (
    (SELECT user_has_permission('campus_living.settings.view'))
    AND institution_id IN (SELECT institution_id FROM hostel_block_institutions)
  );

CREATE POLICY departments_select_campus_living_settings ON public.departments
  FOR SELECT TO authenticated
  USING (
    (SELECT user_has_permission('campus_living.settings.view'))
    AND institution_id IN (SELECT institution_id FROM hostel_block_institutions)
  );

CREATE POLICY programs_select_campus_living_settings ON public.programs
  FOR SELECT TO authenticated
  USING (
    (SELECT user_has_permission('campus_living.settings.view'))
    AND institution_id IN (SELECT institution_id FROM hostel_block_institutions)
  );

CREATE POLICY semesters_select_campus_living_settings ON public.semesters
  FOR SELECT TO authenticated
  USING (
    (SELECT user_has_permission('campus_living.settings.view'))
    AND institution_id IN (SELECT institution_id FROM hostel_block_institutions)
  );
