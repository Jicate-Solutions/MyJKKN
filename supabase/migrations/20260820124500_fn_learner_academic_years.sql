-- =====================================================================
-- 20260820124500 — fn_learner_academic_years: which cohort is each learner in?
-- =====================================================================
-- PURELY ADDITIVE. Creates ONE new function. Changes no existing function, no
-- table, no policy, no signature. Nothing in the database or the codebase refers
-- to this name today, so it cannot collide with anything — including the pending
-- Director-gated 20260821010000 (provisional freshers), which rewrites
-- fn_attendance_roster and is entirely untouched by this file.
--
-- THE DEFECT (reported by JKKN College of Allied Health Sciences)
-- --------------------------------------------------------------
-- "The Fresher's Name List has been updated along with the current first year's
-- list, which is preventing us from marking attendance."
--
-- `sections` carries no academic year — its columns are institution / degree /
-- program / department / semester (verified against the live schema). One
-- "Section A" row is therefore reused by every intake that passes through it, and
-- the attendance roster is keyed on section. The moment the next intake is loaded
-- into that same section, two cohorts share one marking screen.
--
-- Measured on production 2026-08-20 (SELECT only; these numbers drift):
--   9 AHS timetables affected, 22 learners from the 2026-2027 intake appearing on
--   2025-2026 first-year rosters. All 22 have roll_number IS NULL — exactly the
--   "Roll: N/A" rows in the screenshots attached to the report.
--   26 of the 35 rosters checked are unaffected.
--
-- WHY A FUNCTION IS NEEDED AT ALL
-- -------------------------------
-- The filter itself is trivial ("keep learners whose academic year matches the
-- timetable's"), and it belongs in TypeScript. The obstacle is purely one of
-- visibility: `learners_profiles` SELECT RLS only admits roles holding a
-- `learners.*view` permission, and faculty — who do most of the marking — do not
-- hold one. That is the whole reason the roster is served by fn_attendance_roster,
-- a SECURITY DEFINER RPC. A direct client read of academic_year_id therefore
-- returns zero rows with error = null for exactly the people who need it: the
-- silent-denial failure class this module has been bitten by before.
--
-- So this function exists to expose ONE column that fn_attendance_roster does not
-- return. It is the smallest possible unit of new surface area.
--
-- WHY NOT WIDEN fn_attendance_roster INSTEAD
-- ------------------------------------------
-- Adding academic_year_id to that function's RETURNS TABLE is a return-type
-- change, which Postgres will not accept via CREATE OR REPLACE — it forces DROP +
-- CREATE. Dropping it would: (a) require the app deploy and the migration to land
-- in the same window or every attendance screen loses its roster, and (b) leave
-- the pending 20260821010000 recreating the old signature afterwards, so two
-- divergent roster definitions could coexist and the fresher filter would
-- silently stop applying. None of that risk buys anything. This file avoids all
-- of it by not touching that function.
--
-- WHY academic_year_id AND NOT admission_year_id
-- ----------------------------------------------
-- On production, 12 AHS sections legitimately span more than one ADMISSION year
-- (e.g. "THIRD YEAR - MRS" holds 2023-2024 + 2024-2025 — lateral entrants and
-- repeaters who are genuinely in that class today). Filtering on admission year
-- would drop learners who belong on the roster. academic_year_id answers the
-- question actually being asked — is this learner in the cohort this timetable is
-- teaching this year — and removes only the next intake.
-- =====================================================================

-- Returns identifiers only: a learner id and the cohort they belong to. No names,
-- no contact details, no counts — nothing that widens what a caller can learn
-- about a learner beyond the roster they were already entitled to load.
--
-- SECURITY DEFINER for the same reason fn_attendance_roster is: the caller cannot
-- read learners_profiles directly. The permission gate below is copied from
-- fn_attendance_roster so the two cannot drift apart — a caller who may load the
-- roster may resolve its cohorts, and nobody else may do either.
--
-- Note the gate is on INSTITUTION, and the ids passed in are then constrained to
-- that institution in the WHERE clause. Passing another college's learner ids
-- therefore returns nothing rather than leaking their cohort.
CREATE OR REPLACE FUNCTION public.fn_learner_academic_years(
  p_institution_id uuid,
  p_learner_ids uuid[]
)
RETURNS TABLE(id uuid, academic_year_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    is_super_admin()
    OR is_admin()
    OR (
      (
        role_has_institution_access(p_institution_id)
        OR staff_teaches_in_institution(p_institution_id)
      )
      AND (
        user_has_permission('academic.attendance.mark')
        OR user_has_permission('academic.attendance.view')
        OR user_has_permission('academic.attendance.reports')
      )
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to resolve learner academic years for this institution'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT lp.id, lp.academic_year_id
  FROM public.learners_profiles lp
  WHERE lp.institution_id = p_institution_id
    AND lp.id = ANY (p_learner_ids);
END;
$function$;

-- Lock down execution. REVOKE FROM PUBLIC alone is NOT sufficient on Supabase:
-- `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon`
-- gives anon a DIRECT grant on every newly created function, separate from
-- PUBLIC. Without the explicit anon revoke this would be callable by any
-- unauthenticated client holding the public anon key, which ships in the browser
-- bundle.
REVOKE EXECUTE ON FUNCTION public.fn_learner_academic_years(uuid, uuid[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_learner_academic_years(uuid, uuid[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- DEPLOY — no ordering constraint, in either direction
-- =====================================================================
-- Applying this before the app deploys: nothing calls the function yet. No effect.
-- Deploying the app before this is applied: the caller treats a missing function
-- as "cannot determine cohorts" and skips the filter, logging a warning. Freshers
-- keep appearing until the migration lands — today's behaviour, not a new failure.
-- Rollback is DROP FUNCTION public.fn_learner_academic_years(uuid, uuid[]);
-- =====================================================================
