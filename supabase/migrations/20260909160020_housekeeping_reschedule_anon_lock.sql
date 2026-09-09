-- Housekeeping reschedule, follow-up: narrow the coarse door on the new table.
--
-- Supabase ships `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon`, so
-- a new public-schema table can be born writable by the anon key embedded in
-- every page of the public site. This project's live defaults are already clean
-- (the table came up with nothing granted to anon), but the REVOKE has to live
-- in a migration so a replay onto a stock Supabase project is safe too. Enforced
-- by scripts/ci/check-table-anon-revoke.mjs.
--
-- authenticated is left with SELECT alone. Rows are written only by
-- fn_cl_housekeeping_reschedule (SECURITY DEFINER) and the table has no INSERT,
-- UPDATE or DELETE policy, so the grants and the policies now say the same
-- thing — the same posture hostel_cleaning_bookings has for INSERT/DELETE.
--
-- Split out of 20260909160010_housekeeping_reschedule_schema.sql because that
-- file had already been applied and recorded; a file that quietly grows past
-- what was applied is exactly the drift the migration log exists to prevent.

REVOKE ALL ON TABLE public.hostel_cleaning_booking_reschedules FROM anon, PUBLIC;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.hostel_cleaning_booking_reschedules FROM authenticated;

GRANT SELECT ON TABLE public.hostel_cleaning_booking_reschedules TO authenticated;
