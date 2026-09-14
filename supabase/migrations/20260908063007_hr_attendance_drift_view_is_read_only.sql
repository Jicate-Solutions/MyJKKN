-- The project's default privileges hand `authenticated` ALL on every new view
-- (v_hr_staff carries the same set). v_hr_attendance_institution_drift, added in
-- 20260908062656, is a read-only reporting surface, so it is narrowed to SELECT.
--
-- REVOKE before GRANT, never GRANT alone: the default has already been applied
-- by the time this runs, so granting SELECT on top would leave INSERT, UPDATE,
-- DELETE and TRUNCATE exactly where they were.
--
-- Kept as its own migration rather than folded into 20260908062656, which was
-- already applied -- a file that contains more than was recorded is the drift
-- this repo has been bitten by before.
REVOKE ALL ON public.v_hr_attendance_institution_drift FROM authenticated;
GRANT SELECT ON public.v_hr_attendance_institution_drift TO authenticated;
