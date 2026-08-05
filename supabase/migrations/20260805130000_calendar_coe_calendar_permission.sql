-- =====================================================================
-- Grant calendar.coe_calendar.view                                     2026-08-05
--
-- Backs the new "COE Calendar" chip on /calendar, which surfaces COE's
-- academic calendar (exam periods, result dates, ...) fetched over HTTP from
-- COE's /api/v1/coe-calendar.
--
-- SCOPE: every ACTIVE role EXCEPT learner-facing ones. Staff see the COE
-- academic calendar; learners do not get the chip at all.
--
-- The sibling "Exam Schedule" chip intentionally has NO key of its own — it is
-- open to anyone holding calendar.view, so no grant is needed for it here.
--
-- Declaring the key in lib/constants/permissions.ts only populates the Role-
-- Management dialog. THIS grant is what actually surfaces the chip: without it
-- the API route's is_super_admin/is_admin/user_has_permission triad fails and
-- every non-super-admin silently loses the tab.
--
-- Idempotent (re-runnable).
-- =====================================================================

UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object('calendar.coe_calendar.view', true),
       updated_at = now()
 WHERE role_key NOT IN (
         'student',
         'graduated_student',
         'production_learner',
         'cse_resident',
         'cohort_member',
         'client'
       )
   AND COALESCE((permissions->>'calendar.coe_calendar.view')::boolean, false) = false;

-- Verification (run manually):
--   SELECT count(*) FILTER (WHERE (permissions->>'calendar.coe_calendar.view')::boolean) AS granted,
--          count(*) AS total
--     FROM public.custom_roles;
