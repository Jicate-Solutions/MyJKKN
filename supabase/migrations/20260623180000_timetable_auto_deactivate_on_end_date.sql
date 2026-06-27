-- =====================================================================
-- Auto-deactivate ended timetables (+ reactivate on end-date extension)
-- =====================================================================
-- Problem: timetables.is_active is a static flag set at creation (default
-- true) and never recomputed from the date window. A timetable whose
-- end_date has passed keeps showing the green "Active" badge in the list
-- AND keeps leaking into the is_active-gated attendance/period lookups
-- that do not also date-check (e.g. attendance-core-service fallback
-- scans, daily-session-attendance). At the time of writing, 182
-- non-template timetables were is_active=true with a past end_date.
--
-- Fix (two directions, keeping the stored flag honest so the existing
-- .eq('is_active', true) filters across the codebase Just Work):
--   1. fn_deactivate_ended_timetables() — a daily pg_cron job flips
--      is_active=false for any non-template timetable whose end_date is
--      strictly in the past. No application-layer change is needed: the
--      list status badge and every attendance/period query already gate
--      on is_active, so ended timetables disappear automatically.
--   2. trg_reactivate_extended_timetable — a BEFORE UPDATE trigger that
--      brings an inactive timetable back to Active the moment an admin
--      extends its end_date to today-or-later (e.g. renewing for a new
--      term). Editing the date is enough to un-expire it.
--
-- Timezone: "today" is computed in Asia/Kolkata, not UTC, to avoid the
-- ~5.5h date-rollover skew that would otherwise deactivate a timetable on
-- its final valid day. end_date is INCLUSIVE: a timetable is valid THROUGH
-- its end_date and only deactivates once that date is strictly past.
--
-- Mirrors the existing fn_auto_complete_past_due_reservations pattern
-- (cron jobid 18) and auto_update_expo_event_statuses (jobid 12).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Daily auto-deactivation function
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_deactivate_ended_timetables()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  UPDATE public.timetables
     SET is_active  = false,
         updated_at = now()
   WHERE is_active   = true
     AND is_template = false
     AND end_date IS NOT NULL
     AND end_date < v_today;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    RAISE NOTICE 'fn_deactivate_ended_timetables: deactivated % timetable(s)', v_count;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- 2. Reactivate-on-edit trigger
--    Fires BEFORE UPDATE OF end_date. Brings a previously-inactive,
--    non-template timetable back to Active when its end_date is moved to
--    today-or-later. The "NEW.is_active IS NOT DISTINCT FROM OLD.is_active"
--    guard means a deliberate manual is_active toggle in the same statement
--    always wins (we only auto-reactivate when the caller is changing the
--    date alone, not the flag).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reactivate_extended_timetable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_template = false
     AND OLD.is_active = false
     AND NEW.is_active IS NOT DISTINCT FROM OLD.is_active
     AND NEW.end_date IS DISTINCT FROM OLD.end_date
     AND NEW.end_date IS NOT NULL
     AND NEW.end_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date
  THEN
    NEW.is_active := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reactivate_extended_timetable ON public.timetables;
CREATE TRIGGER trg_reactivate_extended_timetable
  BEFORE UPDATE OF end_date ON public.timetables
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_reactivate_extended_timetable();

-- ---------------------------------------------------------------------
-- 3. Schedule the daily job (00:15 IST == 18:45 UTC).
--    Unschedule first so re-running this migration is idempotent.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  PERFORM cron.unschedule('deactivate-ended-timetables');
EXCEPTION WHEN OTHERS THEN
  NULL; -- job didn't exist yet, safe to continue
END;
$$;

SELECT cron.schedule(
  'deactivate-ended-timetables',
  '45 18 * * *',
  $$ SELECT public.fn_deactivate_ended_timetables(); $$
);

-- ---------------------------------------------------------------------
-- 4. One-time backfill: deactivate timetables that already ended.
-- ---------------------------------------------------------------------
SELECT public.fn_deactivate_ended_timetables();
