-- =============================================================================
-- Housekeeping: generate hostel_cleaning_tasks from active schedules
--
-- Until now nothing connected hostel_cleaning_schedules (the recurring plan)
-- to hostel_cleaning_tasks (the day's work items) — a created schedule never
-- surfaced anywhere. This adds:
--   1) fn_housekeeping_schedule_due(frequency, anchor, date) — dueness rule
--      anchored on the schedule's creation date (IST):
--        daily: every day · weekly: every 7 days · biweekly: every 14 days
--        monthly/quarterly/half_yearly/yearly: same day-of-month (clamped to
--        month end) every 1/3/6/12 months
--   2) fn_housekeeping_generate_tasks(p_date) — idempotently inserts one
--      'scheduled' task per due active schedule for the date (default: today
--      in Asia/Kolkata). Called by the daily Vercel cron
--      /api/cron/campus-living/housekeeping-task-generator.
--   3) AFTER INSERT trigger on hostel_cleaning_schedules — a schedule that is
--      due today produces today's task immediately, so creators see their
--      plan land on the Tasks page right away (daily plans always do).
--   4) Partial unique index (schedule_id, date) backing the idempotency.
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_cleaning_task_schedule_date
  ON public.hostel_cleaning_tasks (schedule_id, date)
  WHERE schedule_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_housekeeping_schedule_due(
  p_frequency text, p_anchor date, p_date date
)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
AS $function$
DECLARE
  v_months_apart int;
  v_dom int;
BEGIN
  IF p_date < p_anchor THEN RETURN false; END IF;
  CASE p_frequency
    WHEN 'daily' THEN RETURN true;
    WHEN 'weekly' THEN RETURN (p_date - p_anchor) % 7 = 0;
    WHEN 'biweekly' THEN RETURN (p_date - p_anchor) % 14 = 0;
    WHEN 'monthly', 'quarterly', 'half_yearly', 'yearly' THEN
      v_months_apart := (EXTRACT(YEAR FROM p_date)::int * 12 + EXTRACT(MONTH FROM p_date)::int)
                      - (EXTRACT(YEAR FROM p_anchor)::int * 12 + EXTRACT(MONTH FROM p_anchor)::int);
      IF v_months_apart % (CASE p_frequency
                             WHEN 'monthly' THEN 1
                             WHEN 'quarterly' THEN 3
                             WHEN 'half_yearly' THEN 6
                             ELSE 12 END) <> 0 THEN
        RETURN false;
      END IF;
      -- Same day-of-month as the anchor, clamped to short months
      -- (anchor on the 31st fires on the 30th/28th when needed).
      v_dom := LEAST(
        EXTRACT(DAY FROM p_anchor)::int,
        EXTRACT(DAY FROM (date_trunc('month', p_date) + interval '1 month - 1 day'))::int
      );
      RETURN EXTRACT(DAY FROM p_date)::int = v_dom;
    ELSE
      RETURN false;
  END CASE;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_housekeeping_generate_tasks(p_date date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_date date := COALESCE(p_date, (now() AT TIME ZONE 'Asia/Kolkata')::date);
  v_count int;
BEGIN
  INSERT INTO hostel_cleaning_tasks (
    institution_id, schedule_id, block_id, floor_number, date,
    cleaning_type, assigned_staff, status
  )
  SELECT s.institution_id, s.id, s.block_id, s.floor_number, v_date,
         s.cleaning_type, s.assigned_staff, 'scheduled'
  FROM hostel_cleaning_schedules s
  WHERE s.is_active
    AND fn_housekeeping_schedule_due(
          s.frequency::text,
          (s.created_at AT TIME ZONE 'Asia/Kolkata')::date,
          v_date)
  ON CONFLICT (schedule_id, date) WHERE schedule_id IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_housekeeping_generate_tasks(date) FROM anon, authenticated, PUBLIC;

-- New schedule that is due today -> today's task appears immediately.
CREATE OR REPLACE FUNCTION public._on_cleaning_schedule_seed_task()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  BEGIN
    IF NEW.is_active AND fn_housekeeping_schedule_due(
         NEW.frequency::text,
         (NEW.created_at AT TIME ZONE 'Asia/Kolkata')::date,
         v_today) THEN
      INSERT INTO hostel_cleaning_tasks (
        institution_id, schedule_id, block_id, floor_number, date,
        cleaning_type, assigned_staff, status
      ) VALUES (
        NEW.institution_id, NEW.id, NEW.block_id, NEW.floor_number, v_today,
        NEW.cleaning_type, NEW.assigned_staff, 'scheduled'
      )
      ON CONFLICT (schedule_id, date) WHERE schedule_id IS NOT NULL DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Never fail schedule creation over task seeding; the daily cron catches up.
    RAISE WARNING '_on_cleaning_schedule_seed_task: %', SQLERRM;
  END;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_cleaning_schedule_seed_task ON public.hostel_cleaning_schedules;
CREATE TRIGGER trg_cleaning_schedule_seed_task
AFTER INSERT ON public.hostel_cleaning_schedules
FOR EACH ROW EXECUTE FUNCTION public._on_cleaning_schedule_seed_task();
