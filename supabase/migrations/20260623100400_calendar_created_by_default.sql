-- =====================================================================
-- Calendar: populate calendar_entries.created_by automatically            2026-06-23
-- Final-review M-1: the service insert does not set created_by, leaving audit
-- ownership NULL. A column DEFAULT of auth.uid() captures the inserting user
-- (the browser client carries the user JWT; service-role inserts get NULL,
-- which is fine). No backfill — existing rows (test data) stay NULL.
-- =====================================================================
ALTER TABLE public.calendar_entries ALTER COLUMN created_by SET DEFAULT auth.uid();
