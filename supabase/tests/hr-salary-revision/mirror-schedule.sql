-- REHEARSAL ONLY (20271008093015): a stand-in for the nightly schedule record.
-- Loaded by run-targets.sh after seed-targets.sql, as the SQL console.
--
-- In production the cron route asks the app's own resolver
-- (FacultyAttendanceService.getFacultyTodayPeriods, TypeScript) for each team
-- member's periods on each day and writes them to hr_target_scheduled_periods.
-- The rehearsal has no TypeScript, so this file keeps that table filled the
-- way the resolver would for the fixtures' timetables (weekday-keyed, one or
-- two periods): every day from 420 days before today to 400 days after, for
-- every team member, re-written whenever a timetable or a holiday changes.
-- Rows it writes carry resolver 'rehearsal-mirror'; a row a probe writes
-- itself (as the resolver would for a cycle or batch timetable) is never
-- touched. The resolver's own behaviour (cycle, batch, scoped holidays,
-- co-teachers) is proven by __tests__/hr/salary-revision-scheduled-periods.test.ts.
CREATE FUNCTION t.mirror_staff(p_staff uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_from date := (now() AT TIME ZONE 'Asia/Kolkata')::date - 420;
  v_to   date := (now() AT TIME ZONE 'Asia/Kolkata')::date + 400;
BEGIN
  DELETE FROM public.hr_target_scheduled_periods WHERE staff_id = p_staff AND resolver = 'rehearsal-mirror';
  INSERT INTO public.hr_target_scheduled_periods (staff_id, day, periods, recorded_live, holiday_key, resolver)
  SELECT p_staff, g.d,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
                    'timetable_id', t.id, 'institution_id', t.institution_id,
                    'slot_id', t.id::text || '_' || k.dk || '_' || slot.key,
                    'period_name', NULLIF(btrim(pe.period_name), ''),
                    'course_id', NULLIF(slot.value->>'course_id', ''),
                    'section_ids', '[]'::jsonb,
                    'start_time', to_char(pe.start_time, 'HH24:MI'), 'end_time', to_char(pe.end_time, 'HH24:MI'),
                    'is_primary', true, 'kind', 'slot') ORDER BY t.id, slot.key)
             FROM public.timetables t
             CROSS JOIN LATERAL (SELECT upper(btrim(to_char(g.d, 'DAY'))) AS dk) k
             CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(t.timetable_data -> k.dk) = 'object'
                                                THEN t.timetable_data -> k.dk ELSE '{}'::jsonb END) slot
             LEFT JOIN LATERAL (
               SELECT x->>'period_name' AS period_name, NULLIF(x->>'start_time', '')::time AS start_time,
                      NULLIF(x->>'end_time', '')::time AS end_time
                 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(t.periods) = 'array' THEN t.periods ELSE '[]'::jsonb END) x
                WHERE x->>'id' = slot.key
                LIMIT 1) pe ON true
            WHERE g.d BETWEEN t.start_date AND t.end_date
              AND jsonb_typeof(slot.value) = 'object'
              AND lower(slot.value->>'primary_staff_id') = p_staff::text
              -- The app's holiday rule (approved-leave-scope.ts): an approved
              -- holiday of the timetable's college, in its department, semester
              -- and section scope (an empty list means all).
              AND NOT EXISTS (SELECT 1 FROM public.institution_leaves l
                               WHERE l.institution_id = t.institution_id AND l.status = 'approved'
                                 AND g.d BETWEEN l.start_date AND l.end_date
                                 AND (COALESCE(cardinality(l.department_ids), 0) = 0 OR t.department_id = ANY (l.department_ids))
                                 AND (COALESCE(cardinality(l.semester_ids), 0) = 0 OR t.semester_id = ANY (l.semester_ids))
                                 AND (COALESCE(cardinality(l.section_ids), 0) = 0 OR t.section_id = ANY (l.section_ids)
                                      OR COALESCE(t.section_ids, '{}') && l.section_ids))), '[]'::jsonb),
         false,
         public.hr_target_schedule_holiday_key(public.hr_target_schedule_institutions(p_staff), g.d),
         'rehearsal-mirror'
    FROM (SELECT x::date AS d FROM generate_series(v_from, v_to, interval '1 day') x) g
   WHERE NOT EXISTS (SELECT 1 FROM public.hr_target_scheduled_periods sp WHERE sp.staff_id = p_staff AND sp.day = g.d);
END $$;

CREATE FUNCTION t.mirror_all() RETURNS void LANGUAGE sql AS $$
  SELECT t.mirror_staff(s.id) FROM public.staff s;
$$;

CREATE FUNCTION t.mirror_timetable() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_staff uuid;
BEGIN
  FOR v_staff IN
    SELECT DISTINCT (sl.value->>'primary_staff_id')::uuid
      FROM (SELECT NEW.timetable_data AS d WHERE TG_OP <> 'DELETE'
            UNION ALL SELECT OLD.timetable_data WHERE TG_OP <> 'INSERT') x
      CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(x.d) = 'object' THEN x.d ELSE '{}'::jsonb END) dd
      CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(dd.value) = 'object' THEN dd.value ELSE '{}'::jsonb END) sl
     WHERE jsonb_typeof(sl.value) = 'object' AND NULLIF(sl.value->>'primary_staff_id', '') IS NOT NULL
  LOOP
    IF EXISTS (SELECT 1 FROM public.staff s WHERE s.id = v_staff) THEN
      PERFORM t.mirror_staff(v_staff);
    END IF;
  END LOOP;
  RETURN NULL;
END $$;

CREATE FUNCTION t.mirror_holidays() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM t.mirror_all();
  RETURN NULL;
END $$;

CREATE TRIGGER zz_rehearsal_mirror AFTER INSERT OR UPDATE OR DELETE ON public.timetables
  FOR EACH ROW EXECUTE FUNCTION t.mirror_timetable();
CREATE TRIGGER zz_rehearsal_mirror AFTER INSERT OR UPDATE OR DELETE ON public.institution_leaves
  FOR EACH STATEMENT EXECUTE FUNCTION t.mirror_holidays();

SELECT t.mirror_all();
