-- Calendar Phase 3: events + institutional meetings aggregation           2026-06-23
-- Adds 4 read-only UNION branches to fn_calendar_items: events, lc_events,
-- startup_events (kind='event', feed 'events') and bos_meetings (kind='meeting',
-- feed 'meetings'). Public/institutional → institution-scoped only (no people-
-- leave gate). NULL-institution event rows (lc/startup) treated as all-JKKN.
-- ADDITIVE: the 5 existing branches (Phase 1 holidays + Phase 2 leave) unchanged.
-- GOTCHA: bos_meetings' institution column is `institutions_id` (with an 's'),
--   NOT institution_id. plpgsql validates column refs at RUNTIME, so a wrong
--   name compiles fine but errors on every call — verified by CALLING the fn.
-- NOTE: supabase/setup/02_functions.sql mirror deferred (concurrent dirty).

CREATE OR REPLACE FUNCTION public.fn_calendar_items(
  p_institution_ids uuid[] DEFAULT NULL,
  p_start date DEFAULT NULL,
  p_end date DEFAULT NULL,
  p_feeds text[] DEFAULT NULL,
  p_kinds text[] DEFAULT NULL
)
RETURNS TABLE (
  item_id text, source_module text, source_id uuid, kind text, title text,
  description text, start_at timestamptz, end_at timestamptz, all_day boolean,
  institution_id uuid, institution_name text, category text, color_code text,
  blocks_attendance boolean, visibility text, person_name text, meta jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_accessible uuid[];
  v_effective  uuid[];
  v_can_people_leave boolean;
BEGIN
  SELECT COALESCE(array_agg(gua.institution_id), ARRAY[]::uuid[])
    INTO v_accessible
    FROM public.get_user_accessible_institutions(auth.uid()) gua;

  IF p_institution_ids IS NULL OR array_length(p_institution_ids, 1) IS NULL THEN
    v_effective := v_accessible;
  ELSE
    SELECT COALESCE(array_agg(x), ARRAY[]::uuid[])
      INTO v_effective
      FROM unnest(p_institution_ids) x
     WHERE x = ANY(v_accessible);
  END IF;

  v_can_people_leave := public.user_has_permission('calendar.people_leave.view');

  RETURN QUERY
  -- Source 1: global-owned entries (Phase 1) --------------------------------
  SELECT
    ('global:' || ce.id::text), 'global'::text, ce.id, ce.kind::text,
    ce.title::text, ce.description::text, ce.start_at, ce.end_at, ce.all_day,
    NULL::uuid, NULL::text, COALESCE(cc.name, ce.kind)::text,
    COALESCE(ce.color_code, cc.color_code, '#6b7280')::text, ce.blocks_attendance,
    ce.visibility::text, NULL::text,
    jsonb_build_object('scope_institution_ids', ce.scope_institution_ids)
  FROM public.calendar_entries ce
  LEFT JOIN public.calendar_categories cc ON cc.id = ce.category_id
  WHERE ce.is_active = true
    AND (p_kinds IS NULL OR ce.kind = ANY(p_kinds))
    AND (p_feeds IS NULL OR 'global_entries' = ANY(p_feeds))
    AND (p_start IS NULL OR ce.end_at::date   >= p_start)
    AND (p_end   IS NULL OR ce.start_at::date <= p_end)
    AND public.fn_calendar_feed_enabled('global_entries', NULL)
    AND (ce.scope_institution_ids IS NULL OR ce.scope_institution_ids && v_effective)

  UNION ALL
  -- Source 2: academic institution_leaves (Phase 1) ------------------------
  SELECT
    ('academic:' || il.id::text), 'academic'::text, il.id, 'holiday'::text,
    il.leave_name::text, il.description::text, il.start_date::timestamptz,
    (il.end_date::timestamptz + interval '1 day' - interval '1 second'), true,
    il.institution_id, i.name::text,
    COALESCE(lt.leave_type_name, 'Institution Leave')::text,
    COALESCE(lt.color_code, '#0ea5e9')::text, true, 'public'::text, NULL::text,
    jsonb_build_object('scope_level', il.scope_level, 'leave_type_id', il.leave_type_id)
  FROM public.institution_leaves il
  JOIN public.institutions i ON i.id = il.institution_id
  LEFT JOIN public.leave_types lt ON lt.id = il.leave_type_id
  WHERE il.status = 'approved'
    AND il.institution_id = ANY(v_effective)
    AND (p_kinds IS NULL OR 'holiday' = ANY(p_kinds))
    AND (p_feeds IS NULL OR 'academic_holidays' = ANY(p_feeds))
    AND (p_start IS NULL OR il.end_date   >= p_start)
    AND (p_end   IS NULL OR il.start_date <= p_end)
    AND public.fn_calendar_feed_enabled('academic_holidays', il.institution_id)

  UNION ALL
  -- Source 3: HR public holidays (Phase 1) ---------------------------------
  SELECT
    ('hr:' || hph.id::text), 'hr'::text, hph.id, 'holiday'::text,
    hph.name::text, hph.notes::text, hph.holiday_date::timestamptz,
    (hph.holiday_date::timestamptz + interval '1 day' - interval '1 second'), true,
    ho.institution_id, i2.name::text, 'Public Holiday'::text, '#f59e0b'::text, true,
    'public'::text, NULL::text, jsonb_build_object('is_optional', hph.is_optional)
  FROM public.hr_public_holidays hph
  JOIN public.hr_organizations ho ON ho.id = hph.hr_organization_id
  JOIN public.institutions i2 ON i2.id = ho.institution_id
  WHERE ho.institution_id = ANY(v_effective)
    AND hph.superseded_by IS NULL
    AND (p_kinds IS NULL OR 'holiday' = ANY(p_kinds))
    AND (p_feeds IS NULL OR 'hr_public_holidays' = ANY(p_feeds))
    AND (p_start IS NULL OR hph.holiday_date >= p_start)
    AND (p_end   IS NULL OR hph.holiday_date <= p_end)
    AND public.fn_calendar_feed_enabled('hr_public_holidays', ho.institution_id)

  UNION ALL
  -- Source 4: HR staff leave (Phase 2, gated) ------------------------------
  SELECT
    ('hr_leave:' || hla.id::text), 'hr_leave'::text, hla.id, 'leave'::text,
    'On Leave'::text, NULL::text, hla.start_date::timestamptz,
    (hla.end_date::timestamptz + interval '1 day' - interval '1 second'), true,
    ho2.institution_id, i3.name::text, 'Staff Leave'::text, '#ef4444'::text, false,
    'restricted'::text, (s.first_name || ' ' || s.last_name)::text,
    jsonb_build_object('duration_type', hla.duration_type)
  FROM public.hr_leave_applications hla
  JOIN public.hr_organizations ho2 ON ho2.id = hla.hr_organization_id
  JOIN public.institutions i3 ON i3.id = ho2.institution_id
  JOIN public.staff s ON s.id = hla.employee_id
  WHERE v_can_people_leave
    AND hla.status = 'approved' AND hla.superseded_by IS NULL
    AND ho2.institution_id = ANY(v_effective)
    AND (p_kinds IS NULL OR 'leave' = ANY(p_kinds))
    AND (p_feeds IS NULL OR 'staff_leave' = ANY(p_feeds))
    AND (p_start IS NULL OR hla.end_date   >= p_start)
    AND (p_end   IS NULL OR hla.start_date <= p_end)
    AND public.fn_calendar_feed_enabled('staff_leave', ho2.institution_id)

  UNION ALL
  -- Source 5: academic student leave (Phase 2, gated) ----------------------
  SELECT
    ('academic_leave:' || loa.id::text), 'academic_leave'::text, loa.id, 'leave'::text,
    'On Leave'::text, NULL::text, loa.start_date::timestamptz,
    (loa.end_date::timestamptz + interval '1 day' - interval '1 second'), true,
    loa.institution_id, i4.name::text, 'Student Leave'::text, '#ec4899'::text, false,
    'restricted'::text, (lp.first_name || ' ' || lp.last_name)::text,
    jsonb_build_object('period_type', loa.period_type)
  FROM public.leave_onduty_applications loa
  JOIN public.institutions i4 ON i4.id = loa.institution_id
  JOIN public.learners_profiles lp ON lp.id = loa.learner_id
  WHERE v_can_people_leave
    AND loa.status = 'approved' AND loa.category = 'leave'
    AND loa.institution_id = ANY(v_effective)
    AND (p_kinds IS NULL OR 'leave' = ANY(p_kinds))
    AND (p_feeds IS NULL OR 'student_leave' = ANY(p_feeds))
    AND (p_start IS NULL OR loa.end_date   >= p_start)
    AND (p_end   IS NULL OR loa.start_date <= p_end)
    AND public.fn_calendar_feed_enabled('student_leave', loa.institution_id)

  UNION ALL
  -- Source 6 (NEW): general events -----------------------------------------
  SELECT
    ('events:' || e.id::text), 'events'::text, e.id, 'event'::text,
    e.name::text, NULL::text,
    COALESCE(e.start_date, e.event_date::timestamptz),
    COALESCE(e.end_date, e.start_date, e.event_date::timestamptz),
    false, e.institution_id, i5.name::text, 'Event'::text, '#22c55e'::text, false,
    COALESCE(e.visibility, 'public')::text, NULL::text,
    jsonb_build_object('status', e.status)
  FROM public.events e
  JOIN public.institutions i5 ON i5.id = e.institution_id
  WHERE COALESCE(e.is_active, true) = true
    AND e.status NOT IN ('draft','cancelled')
    AND e.institution_id = ANY(v_effective)
    AND COALESCE(e.start_date, e.event_date::timestamptz) IS NOT NULL
    AND (p_kinds IS NULL OR 'event' = ANY(p_kinds))
    AND (p_feeds IS NULL OR 'events' = ANY(p_feeds))
    AND (p_start IS NULL OR COALESCE(e.end_date, e.start_date, e.event_date::timestamptz)::date >= p_start)
    AND (p_end   IS NULL OR COALESCE(e.start_date, e.event_date::timestamptz)::date <= p_end)
    AND public.fn_calendar_feed_enabled('events', e.institution_id)

  UNION ALL
  -- Source 7 (NEW): Learners Council events --------------------------------
  SELECT
    ('lc_event:' || le.id::text), 'lc_event'::text, le.id, 'event'::text,
    le.title::text, NULL::text, le.starts_at, le.ends_at, false,
    le.institution_id, i6.name::text, 'Council Event'::text, '#14b8a6'::text, false,
    'public'::text, NULL::text, jsonb_build_object('status', le.status)
  FROM public.lc_events le
  LEFT JOIN public.institutions i6 ON i6.id = le.institution_id
  WHERE le.status IN ('pending_review','approved','published','in_progress','completed')
    AND (le.institution_id IS NULL OR le.institution_id = ANY(v_effective))
    AND (p_kinds IS NULL OR 'event' = ANY(p_kinds))
    AND (p_feeds IS NULL OR 'events' = ANY(p_feeds))
    AND (p_start IS NULL OR le.ends_at::date   >= p_start)
    AND (p_end   IS NULL OR le.starts_at::date <= p_end)
    AND public.fn_calendar_feed_enabled('events', le.institution_id)

  UNION ALL
  -- Source 8 (NEW): Startup Studio events ----------------------------------
  SELECT
    ('startup_event:' || se.id::text), 'startup_event'::text, se.id, 'event'::text,
    se.name::text, NULL::text, se.start_date, COALESCE(se.end_date, se.start_date), false,
    se.host_institution_id, i7.name::text, 'Startup Event'::text, '#f97316'::text, false,
    'public'::text, NULL::text, jsonb_build_object('status', se.status)
  FROM public.startup_events se
  LEFT JOIN public.institutions i7 ON i7.id = se.host_institution_id
  WHERE se.status <> 'draft'
    AND se.start_date IS NOT NULL
    AND (se.host_institution_id IS NULL OR se.host_institution_id = ANY(v_effective))
    AND (p_kinds IS NULL OR 'event' = ANY(p_kinds))
    AND (p_feeds IS NULL OR 'events' = ANY(p_feeds))
    AND (p_start IS NULL OR COALESCE(se.end_date, se.start_date)::date >= p_start)
    AND (p_end   IS NULL OR se.start_date::date <= p_end)
    AND public.fn_calendar_feed_enabled('events', se.host_institution_id)

  UNION ALL
  -- Source 9 (NEW): BOS board meetings (all-day on scheduled_date) -----------
  -- NOTE: bos_meetings.institutions_id (with 's') is the institution FK column.
  SELECT
    ('bos_meeting:' || bm.id::text), 'bos_meeting'::text, bm.id, 'meeting'::text,
    COALESCE(bm.meeting_title, bm.meeting_type || ' Meeting', 'Board Meeting')::text,
    NULL::text, bm.scheduled_date::timestamptz,
    (bm.scheduled_date::timestamptz + interval '1 day' - interval '1 second'), true,
    bm.institutions_id, i8.name::text, 'Board Meeting'::text, '#8b5cf6'::text, false,
    'public'::text, NULL::text,
    jsonb_build_object('scheduled_time', bm.scheduled_time, 'meeting_number', bm.meeting_number, 'status', bm.status)
  FROM public.bos_meetings bm
  JOIN public.institutions i8 ON i8.id = bm.institutions_id
  WHERE bm.status <> 'draft'
    AND bm.scheduled_date IS NOT NULL
    AND bm.institutions_id = ANY(v_effective)
    AND (p_kinds IS NULL OR 'meeting' = ANY(p_kinds))
    AND (p_feeds IS NULL OR 'meetings' = ANY(p_feeds))
    AND (p_start IS NULL OR bm.scheduled_date >= p_start)
    AND (p_end   IS NULL OR bm.scheduled_date <= p_end)
    AND public.fn_calendar_feed_enabled('meetings', bm.institutions_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_calendar_items(uuid[], date, date, text[], text[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_calendar_items(uuid[], date, date, text[], text[]) TO authenticated;
