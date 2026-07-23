-- =====================================================================
-- Fix 2026-07-17: faculty dashboard hero tiles read 0 + cluster ranking
--                 collapses all low-activity faculty onto the bottom.
-- =====================================================================
-- Applied live to prod on 2026-07-17 (recorded here for repo parity /
-- rebuild-from-scratch reproducibility). Idempotent: CREATE OR REPLACE.
--
-- 1) fn_faculty_metrics / fn_person_conflicts — timetable slot lookup
--    matched periods[] elements by 'period_id' ONLY, but 179/205 active
--    timetables key the period as 'id' (older writer shape) -> NULL slot
--    key -> every slot silently skipped -> "Classes to Mark" and
--    "Upcoming Classes" falsely read 0 for 310 faculty. Fix: COALESCE
--    period_id -> id.
--
-- 2) fn_precompute_percentile_cache — the Cluster Standing percentile used
--    "peers strictly below me / (N-1)". 198 faculty tie at TES=0, so none
--    are below any other, and all 198 collapsed to percentile 0 /
--    bottom_quartile. Fix: MIDRANK — a tie shares the midpoint of its
--    group: (below + 0.5*equal) / (N-1). Also purge rows not refreshed
--    this run (the fn previously only upserted, so ex-faculty rows
--    accumulated forever, hidden only by the 7-day freshness gate).
--
-- 3) Schedule the never-scheduled weekly refresh (rows had been frozen at
--    2026-04-19; the private-rank RPC rejects anything older than 7 days,
--    so Cluster Standing showed "--" cluster-wide).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_faculty_metrics()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_institution_id uuid; v_staff_id uuid;
  v_today date; v_day_name text; v_now_ist timestamptz; v_now_time time;
  v_week_start date; v_week_end date;
  v_total_today int := 0; v_marked_today int := 0;
  v_upcoming jsonb := '[]'::jsonb; v_next_2h_count int := 0;
  v_week_days_total int := 0; v_week_days_marked int := 0; v_week_pct numeric := 0;
  v_tt record; v_period jsonb; v_slot jsonb; v_period_id text;
  v_start_time time; v_end_time time;
  v_course_code text; v_course_name text; v_section_name text; v_period_name text;
  v_has_marked boolean; v_cutoff_time time;
  v_30d_start date; v_tes_stu_att numeric; v_tes_marking numeric;
  v_tes_nps numeric; v_tes_research numeric;
  v_tes_stu_present int := 0; v_tes_stu_total int := 0;
  v_tes_marked_rows int := 0; v_tes_assigned_rows int := 0;
  v_tes_composite jsonb;
BEGIN
  v_now_ist := now() AT TIME ZONE 'Asia/Kolkata';
  v_today := v_now_ist::date; v_now_time := v_now_ist::time;
  v_cutoff_time := v_now_time + interval '2 hours';
  v_day_name := upper(trim(to_char(v_today, 'DAY')));
  v_week_start := v_today - (extract(isodow from v_today)::int - 1);
  v_week_end := v_week_start + 4;
  v_30d_start := v_today - interval '30 days';
  SELECT institution_id INTO v_institution_id FROM profiles WHERE id = v_user_id;
  SELECT s.id INTO v_staff_id FROM staff s WHERE s.profile_id = v_user_id LIMIT 1;
  IF v_staff_id IS NULL THEN
    RETURN jsonb_build_object(
      'unmarked_classes', jsonb_build_object('count', 0, 'total_today', 0, 'data_source', 'no_staff_record'),
      'learner_flags', jsonb_build_object('count', 0, 'data_source', 'not_available'),
      'upcoming_timetable', jsonb_build_object('classes', '[]'::jsonb, 'next_2h_count', 0, 'data_source', 'no_staff_record'),
      'week_attendance', jsonb_build_object('pct', 0, 'days_marked', 0, 'days_total', 0, 'data_source', 'no_staff_record'),
      'teaching_excellence_score', jsonb_build_object('score', 0, 'band', 'red', 'components', '{}'::jsonb, 'data_source', 'no_staff_record'),
      'scope', jsonb_build_object('user_id', v_user_id, 'institution_id', v_institution_id, 'computed_at', now())
    );
  END IF;

  FOR v_tt IN
    SELECT t.timetable_data, t.periods, t.section_id, sec.section_name
    FROM timetables t LEFT JOIN sections sec ON sec.id = t.section_id
    WHERE t.is_active = true AND t.institution_id = v_institution_id
      AND t.timetable_data IS NOT NULL AND t.periods IS NOT NULL
      AND t.timetable_data ? v_day_name
  LOOP
    FOR v_period IN SELECT * FROM jsonb_array_elements(v_tt.periods) LOOP
      IF (v_period->>'is_break')::boolean THEN CONTINUE; END IF;
      v_period_id := COALESCE(v_period->>'period_id', v_period->>'id');
      v_start_time := (v_period->>'start_time')::time;
      v_end_time := (v_period->>'end_time')::time;
      v_period_name := v_period->>'period_name';
      v_slot := v_tt.timetable_data->v_day_name->v_period_id;
      IF v_slot IS NULL THEN CONTINUE; END IF;
      IF v_slot->>'primary_staff_id' = v_staff_id::text
         OR v_slot->'staff_ids' @> to_jsonb(v_staff_id::text) THEN
        v_total_today := v_total_today + 1;
        v_course_code := ''; v_course_name := '';
        BEGIN
          SELECT c.course_code, c.course_name INTO v_course_code, v_course_name
          FROM courses c WHERE c.id = (v_slot->>'course_id')::uuid;
        EXCEPTION WHEN OTHERS THEN NULL; END;
        v_section_name := COALESCE(v_tt.section_name, 'Unknown Section');
        v_has_marked := EXISTS (
          SELECT 1 FROM student_attendance sa
          WHERE sa.attendance_date = v_today
            AND sa.timetable_id IN (SELECT t2.id FROM timetables t2
              WHERE t2.is_active = true AND t2.institution_id = v_institution_id AND t2.section_id = v_tt.section_id)
            AND sa.attendance_data ? v_period_id
        );
        IF v_has_marked THEN v_marked_today := v_marked_today + 1; END IF;
        IF v_start_time >= v_now_time AND v_start_time < v_cutoff_time THEN
          v_next_2h_count := v_next_2h_count + 1;
          v_upcoming := v_upcoming || jsonb_build_object(
            'course', COALESCE(NULLIF(v_course_code, ''), v_course_name, v_period_name),
            'time', to_char(v_start_time, 'HH24:MI') || '-' || to_char(v_end_time, 'HH24:MI'),
            'section', v_section_name);
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  v_week_days_total := LEAST(extract(isodow from v_today)::int, 5);
  SELECT COUNT(DISTINCT sa.attendance_date) INTO v_week_days_marked
  FROM student_attendance sa, jsonb_each(sa.attendance_data) AS periods(period_key, period_val)
  WHERE sa.attendance_date >= v_week_start AND sa.attendance_date <= LEAST(v_today, v_week_end)
    AND sa.institution_id = v_institution_id
    AND period_val->'marked_by_details'->>'marker_id' = v_user_id::text;
  IF v_week_days_total > 0 THEN
    v_week_pct := ROUND((v_week_days_marked::numeric / v_week_days_total) * 100, 1);
  END IF;

  -- TES components
  BEGIN
    SELECT
      COALESCE(SUM((SELECT COUNT(*) FROM jsonb_each(sa.attendance_data) AS pkv,
        LATERAL jsonb_array_elements(pkv.value -> 'students') AS se
        WHERE se ->> 'status' = 'Present'
          AND pkv.value->'marked_by_details'->>'marker_id' = v_user_id::text)), 0),
      COALESCE(SUM((SELECT COUNT(*) FROM jsonb_each(sa.attendance_data) AS pkv,
        LATERAL jsonb_array_elements(pkv.value -> 'students') AS se
        WHERE pkv.value->'marked_by_details'->>'marker_id' = v_user_id::text)), 0)
    INTO v_tes_stu_present, v_tes_stu_total
    FROM student_attendance sa
    WHERE sa.attendance_date >= v_30d_start AND sa.institution_id = v_institution_id;
    IF v_tes_stu_total > 0 THEN
      v_tes_stu_att := LEAST(100, GREATEST(0, ROUND((v_tes_stu_present::numeric / v_tes_stu_total::numeric) * 100)));
    END IF;
  EXCEPTION WHEN OTHERS THEN v_tes_stu_att := NULL; END;

  BEGIN
    SELECT COUNT(DISTINCT sa.attendance_date) INTO v_tes_marked_rows
    FROM student_attendance sa, jsonb_each(sa.attendance_data) AS pkv(period_key, period_val)
    WHERE sa.attendance_date >= v_30d_start AND sa.attendance_date <= v_today
      AND sa.institution_id = v_institution_id
      AND period_val->'marked_by_details'->>'marker_id' = v_user_id::text;
    v_tes_assigned_rows := 22;
    IF v_tes_assigned_rows > 0 THEN
      v_tes_marking := LEAST(100, GREATEST(0, ROUND((v_tes_marked_rows::numeric / v_tes_assigned_rows::numeric) * 100)));
    END IF;
  EXCEPTION WHEN OTHERS THEN v_tes_marking := NULL; END;

  v_tes_nps := NULL; v_tes_research := NULL;

  v_tes_composite := compute_renormalized_composite(
    jsonb_build_object('student_attendance', v_tes_stu_att, 'marking_compliance', v_tes_marking, 'feedback_nps', v_tes_nps, 'research_mentorship', v_tes_research),
    jsonb_build_object('student_attendance', 25, 'marking_compliance', 25, 'feedback_nps', 25, 'research_mentorship', 25)
  );

  RETURN jsonb_build_object(
    'unmarked_classes', jsonb_build_object('count', v_total_today - v_marked_today, 'total_today', v_total_today),
    'learner_flags', jsonb_build_object('count', 0, 'data_source', 'not_available'),
    'upcoming_timetable', jsonb_build_object('classes', v_upcoming, 'next_2h_count', v_next_2h_count),
    'week_attendance', jsonb_build_object('pct', v_week_pct, 'days_marked', v_week_days_marked, 'days_total', v_week_days_total),
    'teaching_excellence_score', v_tes_composite || jsonb_build_object(
      'components', jsonb_build_object('student_attendance', v_tes_stu_att, 'marking_compliance', v_tes_marking, 'feedback_nps', v_tes_nps, 'research_mentorship', v_tes_research),
      'window', 'trailing_30_days'),
    'scope', jsonb_build_object('user_id', v_user_id, 'institution_id', v_institution_id, 'computed_at', now())
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_person_conflicts(p_profile_id uuid, p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS TABLE(source text, ref_id uuid, label text, starts_at timestamp with time zone, ends_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tz          text := 'Asia/Kolkata';
  v_target_inst uuid;
  v_staff_id    uuid;
  v_date        date;
  v_end_date    date;
  v_dow         int;
  v_dayname     text;
  v_tt          record;
  v_key         text;
  v_cell        jsonb;
  v_pstart      time;
  v_pend        time;
  v_pname       text;
  v_slot_start  timestamptz;
  v_slot_end    timestamptz;
  v_dedupe_key  text;
  v_seen        text[] := ARRAY[]::text[];  -- collapses the same slot listed by >1 active timetable
BEGIN
  IF p_profile_id IS NULL OR p_start IS NULL OR p_end IS NULL OR p_end <= p_start THEN
    RETURN;
  END IF;

  -- Authn + scope guard. Out-of-scope callers get no rows (not an exception) so a
  -- picker iterating a mixed-institution candidate list never breaks mid-list.
  IF auth.uid() IS NULL THEN RETURN; END IF;
  SELECT institution_id INTO v_target_inst FROM public.profiles WHERE id = p_profile_id;
  IF NOT (is_super_admin() OR is_admin() OR role_has_institution_access(v_target_inst)) THEN
    RETURN;
  END IF;

  -- ── Source 1: MEETINGS (host or attendee) — absolute timestamps ──
  RETURN QUERY
  SELECT 'meeting'::text,
         mb.id,
         COALESCE('Meeting: ' || NULLIF(mb.attendee_name, ''), 'Meeting')::text,
         mb.start_time,
         mb.end_time
  FROM public.meeting_bookings mb
  WHERE (mb.host_profile_id = p_profile_id OR mb.attendee_profile_id = p_profile_id)
    AND mb.status IS DISTINCT FROM 'cancelled'
    AND mb.start_time < p_end
    AND mb.end_time   > p_start;

  -- ── Source 2: EVENT SESSIONS the person speaks at (link table) ──
  RETURN QUERY
  SELECT 'event'::text,
         es.id,
         ('Speaking: ' || COALESCE(ev.name, 'event') || COALESCE(' — ' || es.title, ''))::text,
         es.start_at,
         es.end_at
  FROM public.event_session_speakers sp
  JOIN public.event_sessions es ON es.id = sp.session_id
  LEFT JOIN public.events ev     ON ev.id = es.event_id
  WHERE sp.profile_id = p_profile_id
    AND es.status IS DISTINCT FROM 'cancelled'
    AND es.start_at < p_end
    AND es.end_at   > p_start;

  -- ── Source 3: EVENT HUMAN ROLES on a timed event (whole-event window) ──
  RETURN QUERY
  SELECT 'event'::text,
         ev.id,
         ('Event role' || COALESCE(' (' || hr.role_type || ')', '') || ': ' || COALESCE(ev.name, 'event'))::text,
         ev.start_date,
         ev.end_date
  FROM public.event_human_roles hr
  JOIN public.events ev ON ev.id = hr.event_id
  WHERE hr.user_id = p_profile_id
    AND hr.assignment_status IN ('invited', 'accepted')
    AND ev.start_date IS NOT NULL
    AND ev.end_date   IS NOT NULL
    AND ev.start_date < p_end
    AND ev.end_date   > p_start;

  -- ── Source 4: TEACHING — recurring weekly grid in timetables JSONB ──
  -- Map the universal user key (profiles.id) to staff.id(s), then resolve each
  -- recurring slot to an absolute IST instant and overlap-test it.
  FOR v_staff_id IN
    SELECT s.id FROM public.staff s
    WHERE s.profile_id = p_profile_id AND s.is_active IS NOT FALSE
  LOOP
    v_date     := (p_start AT TIME ZONE v_tz)::date;
    v_end_date := (p_end   AT TIME ZONE v_tz)::date;
    -- cap the day-walk (windows are same-day in practice; this just bounds a
    -- pathological multi-day range).
    WHILE v_date <= v_end_date AND v_date <= (p_start AT TIME ZONE v_tz)::date + 7 LOOP
      v_dow := EXTRACT(dow FROM v_date)::int;   -- 0=Sun .. 6=Sat
      v_dayname := CASE v_dow
        WHEN 0 THEN 'SUNDAY'    WHEN 1 THEN 'MONDAY'  WHEN 2 THEN 'TUESDAY'
        WHEN 3 THEN 'WEDNESDAY' WHEN 4 THEN 'THURSDAY' WHEN 5 THEN 'FRIDAY'
        WHEN 6 THEN 'SATURDAY' END;

      FOR v_tt IN
        SELECT t.id, t.timetable_data, t.periods, t.timetable_name
        FROM public.timetables t
        WHERE t.is_active = true
          AND v_date BETWEEN t.start_date AND t.end_date
          AND t.timetable_data ? v_dayname
      LOOP
        FOR v_key, v_cell IN
          SELECT key, value FROM jsonb_each(v_tt.timetable_data -> v_dayname)
        LOOP
          -- skip break cells
          CONTINUE WHEN COALESCE((v_cell->>'is_break_slot')::boolean, false);
          -- does this staff teach this cell? (member of staff_ids OR primary)
          IF (v_cell->'staff_ids') @> to_jsonb(v_staff_id::text)
             OR (v_cell->>'primary_staff_id') = v_staff_id::text THEN
            SELECT (pe->>'start_time')::time, (pe->>'end_time')::time, pe->>'period_name'
              INTO v_pstart, v_pend, v_pname
            FROM jsonb_array_elements(v_tt.periods) pe
            WHERE COALESCE(pe->>'period_id', pe->>'id') = v_key
              AND COALESCE((pe->>'is_break')::boolean, false) = false
            LIMIT 1;

            IF v_pstart IS NOT NULL AND v_pend IS NOT NULL THEN
              v_slot_start := (v_date + v_pstart) AT TIME ZONE v_tz;
              v_slot_end   := (v_date + v_pend)   AT TIME ZONE v_tz;
              IF v_slot_start < p_end AND v_slot_end > p_start THEN
                label := 'Teaching: ' || COALESCE(NULLIF(v_pname, ''), v_tt.timetable_name, 'class');
                -- the same faculty/slot can appear in >1 active (near-duplicate)
                -- timetable; report one "busy" block, not N copies.
                v_dedupe_key := v_slot_start::text || '|' || v_slot_end::text || '|' || label;
                IF NOT (v_dedupe_key = ANY(v_seen)) THEN
                  v_seen    := array_append(v_seen, v_dedupe_key);
                  source    := 'teaching';
                  ref_id    := v_tt.id;
                  starts_at := v_slot_start;
                  ends_at   := v_slot_end;
                  RETURN NEXT;
                END IF;
              END IF;
            END IF;
          END IF;
        END LOOP;
      END LOOP;

      v_date := v_date + 1;
    END LOOP;
  END LOOP;

  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_precompute_percentile_cache()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- 2026-07-17: midrank tie-handling. Ties at a score now share the MIDPOINT
-- rank of their group (below + 0.5*equal) instead of everyone-tied-gets-below-only,
-- which collapsed 198 faculty (all TES=0) onto percentile 0 / bottom_quartile.
DECLARE
  v_start timestamptz := NOW();
  v_cluster uuid[];
  v_faculty_written int := 0;
  v_student_written int := 0;
BEGIN
  SELECT ARRAY(SELECT institution_id FROM public.mv_cluster_leaderboard_colleges) INTO v_cluster;
  IF array_length(v_cluster, 1) IS NULL OR array_length(v_cluster, 1) = 0 THEN
    RETURN jsonb_build_object('started_at', v_start, 'finished_at', NOW(), 'faculty_written', 0, 'student_written', 0, 'error', 'cluster_empty');
  END IF;
  WITH faculty_base AS (
    SELECT DISTINCT s.profile_id AS user_id, (public.fn_compute_tes_for_user(s.profile_id)->>'score')::numeric AS score
    FROM public.staff s JOIN public.profiles p ON p.id = s.profile_id
    WHERE p.role = 'faculty' AND p.institution_id = ANY(v_cluster) AND s.profile_id IS NOT NULL
  ),
  faculty_filtered AS (SELECT * FROM faculty_base WHERE score IS NOT NULL),
  faculty_stats AS (SELECT COUNT(*) AS total FROM faculty_filtered),
  faculty_ranked AS (
    SELECT ff.user_id, ff.score, fs.total AS peer_count,
      (SELECT COUNT(*) FROM faculty_filtered x WHERE x.score < ff.score AND x.user_id <> ff.user_id) AS below_count,
      (SELECT COUNT(*) FROM faculty_filtered x WHERE x.score = ff.score AND x.user_id <> ff.user_id) AS equal_count
    FROM faculty_filtered ff, faculty_stats fs WHERE fs.total >= 5
  )
  INSERT INTO public.doctrines_percentile_cache (user_id, role, percentile, quartile_label, data_source, computed_at)
  SELECT fr.user_id, 'faculty',
    ROUND(((fr.below_count::numeric + 0.5 * fr.equal_count::numeric) * 100.0) / GREATEST(fr.peer_count - 1, 1))::int,
    CASE
      WHEN ROUND(((fr.below_count::numeric + 0.5 * fr.equal_count::numeric) * 100.0) / GREATEST(fr.peer_count - 1, 1)) >= 75 THEN 'top_quartile'
      WHEN ROUND(((fr.below_count::numeric + 0.5 * fr.equal_count::numeric) * 100.0) / GREATEST(fr.peer_count - 1, 1)) >= 50 THEN 'upper_middle'
      WHEN ROUND(((fr.below_count::numeric + 0.5 * fr.equal_count::numeric) * 100.0) / GREATEST(fr.peer_count - 1, 1)) >= 25 THEN 'lower_middle'
      ELSE 'bottom_quartile'
    END,
    'cache', NOW()
  FROM faculty_ranked fr
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, percentile = EXCLUDED.percentile, quartile_label = EXCLUDED.quartile_label, data_source = EXCLUDED.data_source, computed_at = EXCLUDED.computed_at;
  GET DIAGNOSTICS v_faculty_written = ROW_COUNT;

  WITH student_base AS (
    SELECT p.id AS user_id, (public.fn_compute_crs_for_user(p.id)->>'score')::numeric AS score
    FROM public.profiles p
    WHERE p.role = 'student' AND p.learner_id IS NOT NULL AND p.institution_id = ANY(v_cluster)
  ),
  student_filtered AS (SELECT * FROM student_base WHERE score IS NOT NULL),
  student_stats AS (SELECT COUNT(*) AS total FROM student_filtered),
  student_ranked AS (
    SELECT sf.user_id, sf.score, ss.total AS peer_count,
      (SELECT COUNT(*) FROM student_filtered x WHERE x.score < sf.score AND x.user_id <> sf.user_id) AS below_count,
      (SELECT COUNT(*) FROM student_filtered x WHERE x.score = sf.score AND x.user_id <> sf.user_id) AS equal_count
    FROM student_filtered sf, student_stats ss WHERE ss.total >= 10
  )
  INSERT INTO public.doctrines_percentile_cache (user_id, role, percentile, quartile_label, data_source, computed_at)
  SELECT sr.user_id, 'student',
    ROUND(((sr.below_count::numeric + 0.5 * sr.equal_count::numeric) * 100.0) / GREATEST(sr.peer_count - 1, 1))::int,
    CASE
      WHEN ROUND(((sr.below_count::numeric + 0.5 * sr.equal_count::numeric) * 100.0) / GREATEST(sr.peer_count - 1, 1)) >= 75 THEN 'top_quartile'
      WHEN ROUND(((sr.below_count::numeric + 0.5 * sr.equal_count::numeric) * 100.0) / GREATEST(sr.peer_count - 1, 1)) >= 50 THEN 'upper_middle'
      WHEN ROUND(((sr.below_count::numeric + 0.5 * sr.equal_count::numeric) * 100.0) / GREATEST(sr.peer_count - 1, 1)) >= 25 THEN 'lower_middle'
      ELSE 'bottom_quartile'
    END,
    'cache', NOW()
  FROM student_ranked sr
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, percentile = EXCLUDED.percentile, quartile_label = EXCLUDED.quartile_label, data_source = EXCLUDED.data_source, computed_at = EXCLUDED.computed_at;
  GET DIAGNOSTICS v_student_written = ROW_COUNT;

  -- 2026-07-17: purge rows not refreshed this run (ex-faculty / left the pool).
  -- Previously the fn only upserted, so stale rows accumulated forever and were
  -- hidden only by the downstream 7-day freshness gate — a latent trap.
  DELETE FROM public.doctrines_percentile_cache WHERE computed_at < v_start;

  RETURN jsonb_build_object('started_at', v_start, 'finished_at', NOW(), 'duration_ms', EXTRACT(MILLISECONDS FROM (NOW() - v_start))::int, 'faculty_written', v_faculty_written, 'student_written', v_student_written);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_faculty_metrics() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_faculty_metrics() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_person_conflicts(uuid, timestamptz, timestamptz) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_person_conflicts(uuid, timestamptz, timestamptz) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_precompute_percentile_cache() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_precompute_percentile_cache() TO service_role;

-- Weekly cache refresh Sun + Wed 21:23 UTC (keeps rows < 4 days old; TTL is 7d).
SELECT cron.unschedule('doctrines_percentile_cache_refresh')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='doctrines_percentile_cache_refresh');
SELECT cron.schedule('doctrines_percentile_cache_refresh', '23 21 * * 0,3',
  'SELECT public.fn_precompute_percentile_cache()');
