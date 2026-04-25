-- PR-A6b: Business-day SLA calculator functions.
-- (Migration file mirrors the MCP-applied migration by the same name.)
--
-- Work calendar: 9am-6pm IST, Mon-Fri, minus hr_public_holidays entries for
-- the institution's shadow-tenant hr_organization. Fallback when no
-- hr_organization mapping exists is weekend-only logic.

CREATE OR REPLACE FUNCTION is_business_day(d date, inst_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dow int;
  v_hr_org uuid;
  v_is_holiday boolean := false;
BEGIN
  v_dow := EXTRACT(ISODOW FROM d);
  IF v_dow IN (6, 7) THEN
    RETURN false;
  END IF;

  SELECT id INTO v_hr_org FROM hr_organizations WHERE institution_id = inst_id LIMIT 1;
  IF v_hr_org IS NULL THEN
    RETURN true;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM hr_public_holidays h
    WHERE h.hr_organization_id = v_hr_org
      AND h.holiday_date = d
      AND (h.valid_from IS NULL OR h.valid_from <= d::timestamptz)
      AND (h.valid_until IS NULL OR h.valid_until >= d::timestamptz)
      AND h.superseded_by IS NULL
  ) INTO v_is_holiday;

  RETURN NOT v_is_holiday;
END;
$$;

CREATE OR REPLACE FUNCTION add_business_hours(start_ts timestamptz, hours int, inst_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining int := hours;
  v_cursor timestamptz;
  v_cursor_date date;
  v_cursor_local timestamp;
  v_work_start_h int := 9;
  v_work_end_h   int := 18;
  v_hours_left_today int;
BEGIN
  IF hours IS NULL OR hours <= 0 THEN
    RETURN start_ts;
  END IF;

  v_cursor := start_ts;

  LOOP
    v_cursor_date := (v_cursor AT TIME ZONE 'Asia/Kolkata')::date;
    v_cursor_local := (v_cursor AT TIME ZONE 'Asia/Kolkata');

    IF NOT is_business_day(v_cursor_date, inst_id) THEN
      v_cursor := ((v_cursor_date + 1)::timestamp + TIME '09:00') AT TIME ZONE 'Asia/Kolkata';
      CONTINUE;
    END IF;

    IF EXTRACT(HOUR FROM v_cursor_local) < v_work_start_h THEN
      v_cursor := (v_cursor_date::timestamp + TIME '09:00') AT TIME ZONE 'Asia/Kolkata';
      EXIT;
    END IF;

    IF EXTRACT(HOUR FROM v_cursor_local) >= v_work_end_h THEN
      v_cursor := ((v_cursor_date + 1)::timestamp + TIME '09:00') AT TIME ZONE 'Asia/Kolkata';
      CONTINUE;
    END IF;

    EXIT;
  END LOOP;

  WHILE v_remaining > 0 LOOP
    v_cursor_date := (v_cursor AT TIME ZONE 'Asia/Kolkata')::date;
    v_cursor_local := (v_cursor AT TIME ZONE 'Asia/Kolkata');
    v_hours_left_today := v_work_end_h - EXTRACT(HOUR FROM v_cursor_local)::int;

    IF v_remaining <= v_hours_left_today THEN
      v_cursor := v_cursor + (v_remaining || ' hours')::interval;
      v_remaining := 0;
    ELSE
      v_remaining := v_remaining - v_hours_left_today;
      LOOP
        v_cursor_date := v_cursor_date + 1;
        EXIT WHEN is_business_day(v_cursor_date, inst_id);
      END LOOP;
      v_cursor := (v_cursor_date::timestamp + TIME '09:00') AT TIME ZONE 'Asia/Kolkata';
    END IF;
  END LOOP;

  RETURN v_cursor;
END;
$$;

CREATE OR REPLACE FUNCTION calculate_grievance_sla_deadline(
  p_institution_id uuid,
  p_sla_hours int,
  p_start_ts timestamptz DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN add_business_hours(COALESCE(p_start_ts, now()), p_sla_hours, p_institution_id);
END;
$$;
