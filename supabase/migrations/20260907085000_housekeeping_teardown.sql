-- Housekeeping rebuild, migration 1 of 4: teardown.
--
-- Removes BOTH old housekeeping systems:
--   1. hostel_cleaning_schedules / _tasks -- recurring block-level sweeps,
--      generated nightly by fn_housekeeping_generate_tasks.
--   2. hostel_cleaning_bookings -- resident slot booking, tier-gated.
--
-- Verified before writing: no table outside this set has a foreign key to
-- these three, no policy on any other table references them, and no view
-- reads them. The CASCADE below is therefore contained. Re-verify if replaying
-- against a drifted schema -- DROP TABLE CASCADE removes OTHER tables'
-- policies and FKs, which is how the HR regularizations table once went
-- deny-all.
--
-- ONE function body does reference a dropped table:
--   fn_delete_hostel_room() runs
--     DELETE FROM hostel_cleaning_bookings WHERE room_id = p_room_id;
--   and returns the count as purged_cleaning. plpgsql resolves table names at
--   EXECUTION, not at CREATE, so this does not fail here -- room deletion
--   simply starts erroring at runtime until migration 2 recreates a table of
--   the same name. Migrations 1 and 2 are applied back to back for that
--   reason, and the function is re-verified after migration 2. Do not apply
--   this migration without applying the next one.
--
-- Row counts at authoring time: bookings 3, schedules 4, tasks 144.
-- Removal approved as irreversible; no archive is taken.
--
-- Spec: specs/campus-living-housekeeping-rebuild-spec-2026-09-07.md section 2
--
-- HOW THIS WAS APPLIED (2026-09-07): NOT through
-- scripts/apply-migration-file.mjs. That path posts the whole file to
-- exec_sql() over PostgREST, which aborts this file at ~8.9s with 57014
-- "canceling statement due to statement timeout". The limit is the HTTP
-- transport, not the database: `SET LOCAL statement_timeout` was tried and
-- changed nothing, while the identical DDL run over a direct SQL connection
-- completes in milliseconds. The statements below were therefore applied in
-- four groups over a direct connection, in the order written, and this file
-- was then recorded in supabase_migrations.schema_migrations by hand so the
-- log and the repo agree. The file is exactly what ran.
--
-- If you replay this, use a direct SQL connection, not the apply script.

-- == Tables ================================================================
DROP TABLE IF EXISTS public.hostel_cleaning_bookings CASCADE;
DROP TABLE IF EXISTS public.hostel_cleaning_tasks CASCADE;
DROP TABLE IF EXISTS public.hostel_cleaning_schedules CASCADE;

-- == Functions =============================================================
-- Signatures are explicit: DROP FUNCTION without them fails on overloads.
DROP FUNCTION IF EXISTS public.fn_housekeeping_assign_booking(uuid, uuid, text, boolean);
DROP FUNCTION IF EXISTS public.fn_housekeeping_assignable_staff(uuid);
DROP FUNCTION IF EXISTS public.fn_housekeeping_available_slots(uuid, date);
DROP FUNCTION IF EXISTS public.fn_housekeeping_book_slot(date, time without time zone, text);
DROP FUNCTION IF EXISTS public.fn_housekeeping_booking_board(uuid, date, date, date);
DROP FUNCTION IF EXISTS public.fn_housekeeping_cancel_booking(uuid);
DROP FUNCTION IF EXISTS public.fn_housekeeping_entitlement_tier(uuid);
DROP FUNCTION IF EXISTS public.fn_housekeeping_generate_tasks(date);
DROP FUNCTION IF EXISTS public.fn_housekeeping_mark_booking(uuid, text);
DROP FUNCTION IF EXISTS public.fn_housekeeping_my_entitlement();
DROP FUNCTION IF EXISTS public.fn_housekeeping_schedule_due(text, date, date);
DROP FUNCTION IF EXISTS public._on_cleaning_schedule_seed_task();

-- == Enums =================================================================
-- Safe only because the three tables above are gone; these types were used
-- nowhere else.
DROP TYPE IF EXISTS public.cleaning_task_status_enum;
DROP TYPE IF EXISTS public.cleaning_frequency_enum;
DROP TYPE IF EXISTS public.cleaning_type_enum;

-- == Policy rows ===========================================================
-- Five of seven go. The knobs they held are now table config:
--   slot_duration_minutes       -> hostel_cleaning_types.duration_minutes
--   service_window              -> hostel_cleaning_availability.window_start/_end
--   capacity_per_slot_per_block -> hostel_cleaning_availability.capacity
--   weekly_quota_by_tier        -> hostel_cleaning_types.usage_limit_count/_period
--   cancellation_cutoff_minutes -> replaced by "cancel while unassigned"
-- booking_enabled and booking_advance_days SURVIVE and stay in
-- platform_policies; the Availability page edits them.
DELETE FROM public.platform_policies
WHERE policy_key IN (
  'housekeeping.slot_duration_minutes',
  'housekeeping.service_window',
  'housekeeping.capacity_per_slot_per_block',
  'housekeeping.cancellation_cutoff_minutes',
  'housekeeping.weekly_quota_by_tier'
);

-- == Permission keys =======================================================
-- .view survives (re-labelled in migration 4). .schedule and .mark_done are
-- replaced by a finer-grained set, so strip them from every role now.
UPDATE public.custom_roles
SET permissions = permissions
                  - 'campus_living.housekeeping.schedule'
                  - 'campus_living.housekeeping.mark_done'
WHERE permissions ?| array[
  'campus_living.housekeeping.schedule',
  'campus_living.housekeeping.mark_done'
];
