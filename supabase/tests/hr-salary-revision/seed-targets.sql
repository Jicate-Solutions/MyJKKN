-- Raise targets rehearsal (20271007180207): extra people and the fixture
-- helpers. Loaded by run-targets.sh AFTER seed.sql, as the SQL console (no
-- JWT), only for probe-targets.sql; the stacked #4140/#4190 probe runs without it.
--
--   F8 (A1) and F9 (A1): two more faculty members (F9 is measured only).
--   PA also holds the faculty role, so the principal rule is what keeps
--   PA's held part listed, not the lack of a faculty role.
--   F6 is put on the Director list, and the decider row names D (#4190), so a
--   Director-list member's raise can be decided.
--   HA also holds the faculty role (two roles with targets, once the probe
--   gives 'hod' targets too). F10 (A1) is approved late and never applied.
-- Ids: users 0000000100NN, staff 0000000200NN, courses 0000000c00NN.

INSERT INTO public.profiles (id, full_name, role, is_super_admin, institution_id) VALUES
  ('00000000-0000-0000-0000-000000010019', 'Member F8', 'faculty', false, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-000000010020', 'Member F9', 'faculty', false, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-000000010021', 'Member F10', 'faculty', false, '00000000-0000-0000-0000-0000000000a1'),
  -- Round 4: a teacher whose role key is not 'faculty'.
  ('00000000-0000-0000-0000-000000010022', 'Member F11', 'assistant_professor', false, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-000000010023', 'Member F12', 'lecturer', false, '00000000-0000-0000-0000-0000000000a1');
INSERT INTO public.user_roles (user_id, role_id)
SELECT p.id, cr.id FROM public.profiles p JOIN public.custom_roles cr ON cr.role_key = p.role
 WHERE p.id IN ('00000000-0000-0000-0000-000000010019', '00000000-0000-0000-0000-000000010020', '00000000-0000-0000-0000-000000010021');
INSERT INTO public.user_roles (user_id, role_id)
SELECT u, id FROM public.custom_roles, unnest(ARRAY['00000000-0000-0000-0000-000000010003', '00000000-0000-0000-0000-000000010005']::uuid[]) u
 WHERE role_key = 'faculty';

INSERT INTO public.staff (id, profile_id, institution_id, department_id, category_id,
                          first_name, last_name, staff_id, designation, date_of_joining) VALUES
  ('00000000-0000-0000-0000-000000020019', '00000000-0000-0000-0000-000000010019', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000d0a1', '00000000-0000-0000-0000-000000000c01', 'Member', 'F8', 'F19', 'Assistant Professor', '2023-06-01'),
  ('00000000-0000-0000-0000-000000020020', '00000000-0000-0000-0000-000000010020', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000d0a1', '00000000-0000-0000-0000-000000000c01', 'Member', 'F9', 'F20', 'Assistant Professor', '2023-06-01'),
  ('00000000-0000-0000-0000-000000020021', '00000000-0000-0000-0000-000000010021', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000d0a1', '00000000-0000-0000-0000-000000000c01', 'Member', 'F10', 'F21', 'Assistant Professor', '2023-06-01'),
  ('00000000-0000-0000-0000-000000020022', '00000000-0000-0000-0000-000000010022', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000d0a1', '00000000-0000-0000-0000-000000000c01', 'Member', 'F11', 'F22', 'Assistant Professor', '2023-06-01'),
  ('00000000-0000-0000-0000-000000020023', '00000000-0000-0000-0000-000000010023', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000d0a1', '00000000-0000-0000-0000-000000000c01', 'Member', 'F12', 'F23', 'Lecturer', '2023-06-01');
INSERT INTO public.hr_staff_salaries (staff_id, hr_organization_id, monthly_gross, effective_from)
VALUES ('00000000-0000-0000-0000-000000020019', '00000000-0000-0000-0000-000000000ea1', 30000, '2026-04-01'),
       ('00000000-0000-0000-0000-000000020020', '00000000-0000-0000-0000-000000000ea1', 30000, '2026-04-01'),
       ('00000000-0000-0000-0000-000000020021', '00000000-0000-0000-0000-000000000ea1', 30000, '2026-04-01'),
       ('00000000-0000-0000-0000-000000020022', '00000000-0000-0000-0000-000000000ea1', 30000, '2026-04-01'),
       ('00000000-0000-0000-0000-000000020023', '00000000-0000-0000-0000-000000000ea1', 30000, '2026-04-01');

UPDATE public.platform_policies
   SET value = jsonb_build_array('00000000-0000-0000-0000-000000010001', '00000000-0000-0000-0000-000000010016')
 WHERE policy_key = 'platform.the_director_profile_ids' AND scope_type = 'global' AND scope_id IS NULL;
INSERT INTO public.platform_policies (policy_key, scope_type, scope_id, value, data_type, is_active)
VALUES ('hr.salary_revision.list_member_raise_decider_profile_id', 'global', NULL,
        to_jsonb('00000000-0000-0000-0000-000000010001'::text), 'string', true)
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO UPDATE SET value = EXCLUDED.value, is_active = true;

INSERT INTO public.leave_types (id, name) VALUES ('00000000-0000-0000-0000-0000000001e1', 'Holiday');

-- ── Fixture helpers (SECURITY INVOKER; run as the console) ─────────────────
-- Round 4: runs a statement and reports a cancel (a statement_timeout) as
-- 57014 instead of ending the probe.
CREATE FUNCTION t.try_timeout(q text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE q; RETURN 'ok';
EXCEPTION WHEN query_canceled THEN RETURN '57014'; WHEN OTHERS THEN RETURN SQLSTATE; END $$;

CREATE FUNCTION t.days_in(p_month date) RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT EXTRACT(DAY FROM (date_trunc('month', p_month) + interval '1 month' - interval '1 day'))::int
$$;
CREATE FUNCTION t.all_days(p_month date) RETURNS int[] LANGUAGE sql IMMUTABLE AS $$
  SELECT array_agg(g) FROM generate_series(1, t.days_in(p_month)) g
$$;

-- A timetable with ONE period ('Period 1', ends 10:00, slot id p1) every day of
-- the week, for one person and one course, between two dates.
CREATE FUNCTION t.tt(p_staff uuid, p_inst uuid, p_course uuid, p_from date, p_to date) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE v_id uuid := gen_random_uuid(); v_day text; v_data jsonb := '{}'::jsonb;
BEGIN
  FOREACH v_day IN ARRAY ARRAY['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'] LOOP
    v_data := v_data || jsonb_build_object(v_day, jsonb_build_object('p1',
                jsonb_build_object('course_id', p_course, 'primary_staff_id', p_staff)));
  END LOOP;
  INSERT INTO public.timetables (id, institution_id, timetable_name, start_date, end_date, selected_days, timetable_data, periods)
  VALUES (v_id, p_inst, 'T ' || p_staff, p_from, p_to,
          '["MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY","SUNDAY"]'::jsonb, v_data,
          '[{"id":"p1","period_name":"Period 1","start_time":"09:00","end_time":"10:00"}]'::jsonb);
  RETURN v_id;
END $$;

-- The approved lesson spine for a course: one AI-drafted lesson the person
-- reviewed and published, and (p_draft) one draft of theirs still waiting.
CREATE FUNCTION t.spine(p_course uuid, p_profile uuid, p_draft boolean) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.curriculum_lesson (institution_id, course_id, title, status, source, created_by, approved_by, approved_at)
  VALUES ('00000000-0000-0000-0000-0000000000a1', p_course, 'Lesson 1', 'published', 'bos_ai', p_profile, p_profile, now());
  INSERT INTO public.curriculum_lesson (institution_id, course_id, title, status, created_by)
  SELECT '00000000-0000-0000-0000-0000000000a1', p_course, 'Lesson 2', 'draft', p_profile WHERE p_draft;
$$;

-- One month of teaching. Each array lists days of the month:
--   p_on_time   attendance marked by the person at 09:30 the same day
--   p_late      marked by the person two days later
--   p_other     marked by somebody else
--   p_null      marked with no marker recorded
--   p_linked    a lesson linked by the person (the period's attendance entry)
--   p_posted    material posted by the person (the first one posted twice)
--   p_pulse     a live pulse opened by the person
CREATE FUNCTION t.teach(p_tt uuid, p_profile uuid, p_course uuid, p_month date,
                        p_on_time int[], p_late int[], p_other int[], p_null int[],
                        p_linked int[], p_posted int[], p_pulse int[]) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_inst uuid := (SELECT institution_id FROM public.timetables WHERE id = p_tt);
  v_lesson uuid;
  v_i int; v_d date; v_ts timestamptz; v_marker text;
BEGIN
  SELECT id INTO v_lesson FROM public.curriculum_lesson WHERE course_id = p_course ORDER BY status DESC LIMIT 1;
  IF v_lesson IS NULL THEN
    INSERT INTO public.curriculum_lesson (institution_id, course_id, title, status, created_by)
    VALUES (v_inst, p_course, 'Old lesson', 'archived', p_profile) RETURNING id INTO v_lesson;
  END IF;
  FOR v_i IN SELECT DISTINCT x FROM unnest(COALESCE(p_on_time, '{}') || COALESCE(p_late, '{}')
                                           || COALESCE(p_other, '{}') || COALESCE(p_null, '{}')) x
              WHERE x BETWEEN 1 AND t.days_in(p_month) LOOP
    v_d := p_month + (v_i - 1);
    v_ts := (v_d + time '09:30') AT TIME ZONE 'Asia/Kolkata';
    v_marker := p_profile::text;
    IF v_i = ANY (COALESCE(p_late, '{}')) THEN v_ts := v_ts + interval '2 days'; END IF;
    IF v_i = ANY (COALESCE(p_other, '{}')) THEN v_marker := '00000000-0000-0000-0000-0000000000ff'; END IF;
    -- The server's first-mark record, as the trigger writes it for a signed-in
    -- marker (fixtures run as the console, so they write it themselves first;
    -- the trigger then finds it and leaves it).
    INSERT INTO public.attendance_first_marks (timetable_id, attendance_date, period_name, ordinal, institution_id, marker_profile_id, first_marked_at)
    VALUES (p_tt, v_d, 'Period 1', 1, v_inst,
            CASE WHEN v_i = ANY (COALESCE(p_null, '{}')) THEN NULL ELSE v_marker::uuid END, v_ts)
    ON CONFLICT DO NOTHING;
    INSERT INTO public.student_attendance (attendance_date, marked_by, institution_id, timetable_id, section_id, attendance_data)
    VALUES (v_d, COALESCE(v_marker, p_profile::text)::uuid, v_inst, p_tt, '00000000-0000-0000-0000-00000000005e',
            jsonb_build_object('a1', jsonb_build_object(
              'period_name', 'Period 1', 'course_id', p_course,
              'students', jsonb_build_array(jsonb_build_object('student_id', gen_random_uuid(), 'status', 'Present', 'marked_at', v_ts)),
              'marked_by_details', CASE WHEN v_i = ANY (COALESCE(p_null, '{}'))
                                        THEN jsonb_build_object('marked_at', v_ts)
                                        ELSE jsonb_build_object('marker_id', v_marker, 'marked_at', v_ts) END)));
  END LOOP;
  FOR v_i IN SELECT x FROM unnest(COALESCE(p_linked, '{}')) x WHERE x BETWEEN 1 AND t.days_in(p_month) LOOP
    INSERT INTO public.class_session_lesson (timetable_id, attendance_date, period_id, course_id, lesson_id, linked_by)
    VALUES (p_tt, p_month + (v_i - 1), 'a1', p_course, v_lesson, p_profile);
  END LOOP;
  FOR v_i IN SELECT x FROM unnest(COALESCE(p_posted, '{}')) x WHERE x BETWEEN 1 AND t.days_in(p_month) LOOP
    INSERT INTO public.session_resource (institution_id, timetable_id, attendance_date, period_id, course_id, title, url, posted_by)
    VALUES (v_inst, p_tt, p_month + (v_i - 1), 'a1', p_course, 'Notes', 'https://example.test/n', p_profile);
    IF v_i = p_posted[1] THEN
      INSERT INTO public.session_resource (institution_id, timetable_id, attendance_date, period_id, course_id, title, url, posted_by)
      VALUES (v_inst, p_tt, p_month + (v_i - 1), 'a1', p_course, 'Notes again', 'https://example.test/n2', p_profile);
    END IF;
  END LOOP;
  FOR v_i IN SELECT x FROM unnest(COALESCE(p_pulse, '{}')) x WHERE x BETWEEN 1 AND t.days_in(p_month) LOOP
    -- Opened during that day's class (10:00 India time).
    INSERT INTO public.scf_live_pulse (institution_id, timetable_id, attendance_date, period_id, created_by, issued_at, created_at)
    VALUES (v_inst, p_tt, p_month + (v_i - 1), 'a1', p_profile,
            ((p_month + (v_i - 1)) + time '10:00') AT TIME ZONE 'Asia/Kolkata',
            ((p_month + (v_i - 1)) + time '10:00') AT TIME ZONE 'Asia/Kolkata');
  END LOOP;
END $$;

-- A month with every target met: marked on time every day, every period
-- linked, material on every other day, a pulse every day.
CREATE FUNCTION t.good_month(p_tt uuid, p_profile uuid, p_course uuid, p_month date) RETURNS void LANGUAGE sql AS $$
  SELECT t.teach(p_tt, p_profile, p_course, p_month, t.all_days(p_month), NULL, NULL, NULL,
                 t.all_days(p_month),
                 (SELECT array_agg(g) FROM generate_series(1, t.days_in(p_month), 2) g),
                 t.all_days(p_month));
$$;
-- A month taught but marked by somebody else every day: T1 missed.
CREATE FUNCTION t.bad_month(p_tt uuid, p_profile uuid, p_course uuid, p_month date) RETURNS void LANGUAGE sql AS $$
  SELECT t.teach(p_tt, p_profile, p_course, p_month, NULL, NULL, t.all_days(p_month), NULL, NULL, NULL, NULL);
$$;

GRANT USAGE ON SCHEMA t TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA t TO anon, authenticated, service_role;
