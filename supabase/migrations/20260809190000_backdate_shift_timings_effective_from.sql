-- ============================================================================
-- Backdate the seeded shift timings so historical biometric imports resolve
-- Created: 2026-08-09
-- Plan: docs/superpowers/plans/2026-08-09-my-attendance-log-and-calendar.md
--
-- THE BUG
--   The July 2026 biometric import ran for real, matched 41 employees across 7
--   institutions, and wrote ZERO attendance records. It wrote 1,271 exceptions
--   instead — every one of them reading "No shift timing configured for this
--   staff member on this date."
--
--   Cause: all 196 hr_shift_timings rows were seeded in a single transaction on
--   2026-08-06 with effective_from = CURRENT_DATE (the column default), while
--   the imported report covers 2026-07-01 .. 2026-07-31.
--   fn_resolve_shift_timings_bulk requires `tt.effective_from <= d.wd`, so the
--   lateral join matched nothing for any July day, evaluate_day() returned
--   EXCEPTION for all 1,271 day cells, and the importer — correctly — refused
--   to invent a verdict it could not compute.
--
--   Verified before writing this migration, for a staff member on:
--     2026-07-15 -> 0 candidate timing rows
--     2026-08-15 -> 2 candidate timing rows
--
-- THE FIX
--   Backdate the seed batch to 2026-06-01, the start of academic year 2026-27
--   (AY convention: Jun 1 -> Mar 31). The working hours were genuinely in force
--   from the start of the year; only the configuration was entered late. This
--   corrects the record rather than rewriting it.
--
--   NOT backdated further on purpose. effective_from is the claim "these hours
--   applied from this date". Pushing it into AY 2025-26 would assert timings
--   for a year they did not cover, and would silently mis-evaluate any older
--   report someone uploads later.
--
-- SAFETY
--   - Guarded on the exact seed batch (effective_from = 2026-08-06 AND the
--     single created_at timestamp all 196 rows share), so a timing row someone
--     deliberately future-dates to 2026-08-06 later is never dragged back.
--   - Idempotent: after this runs, no row matches the predicate.
--   - Cannot collide with hr_shift_timings_current_uq — that unique index keys
--     on (institution_id, staff_scope, category, day_of_week) WHERE
--     effective_until IS NULL AND is_active. effective_from is not part of it.
--   - hr_shift_timings_effective_chk (effective_until > effective_from) holds:
--     all 196 rows have effective_until IS NULL.
--
-- AFTER THIS MIGRATION
--   Re-run the July import at /hr/attendance/import. It upserts on
--   (employee_id, work_date), so re-running is safe and idempotent.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Backdate the seed batch.
-- ---------------------------------------------------------------------------
UPDATE public.hr_shift_timings
   SET effective_from = DATE '2026-06-01',
       updated_at     = now()
 WHERE effective_from = DATE '2026-08-06'
   AND created_at     = TIMESTAMPTZ '2026-08-06 07:08:00.079243+00';

-- ---------------------------------------------------------------------------
-- 2. Retire the exceptions the config gap manufactured.
--
-- These 1,271 rows are not real unresolved attendance days — they are the
-- artifact this migration removes the cause of. Left open they would render
-- forever as "attendance entries yet to be processed" on the My Attendance
-- calendar, for days the re-import is about to decide properly.
--
-- Resolved, never deleted: the audit trail of a bad import is the point.
-- The reason string is matched exactly so a genuinely unresolvable day (bad
-- punch pair, unreadable cell) that happens to share the type is left alone.
-- resolved_by stays NULL — no human resolved these.
-- ---------------------------------------------------------------------------
UPDATE public.hr_attendance_exceptions
   SET resolution_status = 'resolved',
       resolved_at       = now(),
       raw_payload       = COALESCE(raw_payload, '{}'::jsonb)
                           || jsonb_build_object(
                                'resolution_note',
                                'Auto-resolved 2026-08-09: raised only because the shift timings '
                                || 'seeded on 2026-08-06 post-dated this work_date. Timings backdated '
                                || 'to 2026-06-01 by migration 20260809190000; re-import supersedes.'
                              )
 WHERE exception_type          = 'biometric_unresolved'
   AND resolution_status       = 'open'
   AND raw_payload->>'reason'  = 'No shift timing configured for this staff member on this date.';

COMMIT;
