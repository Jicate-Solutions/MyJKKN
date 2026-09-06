-- hr_trig_recompute_on_holiday_change was still joining balances on the old
-- academic_years FK.
--
-- Missed by the main function sweep in 20260810121000 because this trigger
-- lives on hr_public_holidays, not on the leave tables -- it only touches
-- hr_leave_balances as a side effect of recomputing day counts when a holiday
-- moves.
--
-- Left alone it fails silently, which is the worst available outcome:
--   * applications created from now on carry hr_academic_year_id and a NULL
--     academic_year_id, so `AND academic_year_id = v_app.academic_year_id`
--     matches zero rows. The application's total_days is corrected but the
--     balance it draws on is not, so used drifts from reality with no error.
--   * after 20260811090000 drops the column the function fails loudly instead.
--
-- Only the balance predicate and the selected column change; the recompute
-- logic is untouched. The missing `SET search_path` is pre-existing and left
-- as-is rather than folded into an unrelated fix.

CREATE OR REPLACE FUNCTION public.hr_trig_recompute_on_holiday_change()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_affected_start  date;
  v_affected_end    date;
  v_inst_id         uuid;
  v_app             RECORD;
  v_new_days        numeric;
  v_delta           numeric;
BEGIN
  -- Determine affected date range and institution
  IF TG_OP = 'DELETE' THEN
    v_affected_start := OLD.start_date;
    v_affected_end   := OLD.end_date;
    v_inst_id        := OLD.institution_id;
  ELSE
    v_affected_start := LEAST(NEW.start_date, COALESCE(OLD.start_date, NEW.start_date));
    v_affected_end   := GREATEST(NEW.end_date, COALESCE(OLD.end_date, NEW.end_date));
    v_inst_id        := NEW.institution_id;
  END IF;

  -- Find approved applications that overlap this date range within the institution's hr_org
  FOR v_app IN
    SELECT hla.id, hla.employee_id, hla.leave_type_id, hla.hr_academic_year_id,
           hla.hr_organization_id, hla.start_date, hla.end_date,
           hla.duration_type, hla.total_days,
           hlt.skip_weekends, hlt.skip_holidays
      FROM hr_leave_applications hla
      JOIN hr_leave_types hlt ON hlt.id = hla.leave_type_id
      JOIN hr_organizations hro ON hro.id = hla.hr_organization_id
     WHERE hla.status = 'approved'
       AND hro.institution_id = v_inst_id
       AND hla.start_date <= v_affected_end
       AND hla.end_date   >= v_affected_start
       AND hlt.skip_holidays = true  -- only re-calc if type respects holidays
  LOOP
    -- Recompute days with updated holiday table
    v_new_days := hr_calc_leave_days(
      v_app.start_date, v_app.end_date, v_app.duration_type,
      v_app.skip_weekends, v_app.skip_holidays, v_app.hr_organization_id
    );

    v_delta := v_new_days - v_app.total_days;

    IF v_delta != 0 THEN
      -- Update the application's total_days
      UPDATE hr_leave_applications
         SET total_days  = v_new_days,
             updated_at  = now()
       WHERE id = v_app.id;

      -- Adjust balance (positive delta = used more; negative = restore)
      UPDATE hr_leave_balances
         SET used       = GREATEST(0, used + v_delta),
             updated_at = now()
       WHERE employee_id         = v_app.employee_id
         AND leave_type_id       = v_app.leave_type_id
         AND hr_academic_year_id = v_app.hr_academic_year_id;
    END IF;
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $function$;
