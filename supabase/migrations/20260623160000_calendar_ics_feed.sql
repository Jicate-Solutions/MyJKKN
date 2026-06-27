-- Calendar Phase 5: per-user ICS feed (one-way MyJKKN -> Google)          2026-06-23
-- 1) calendar_feed_tokens table (opt-in, rotate/revoke/audit).
-- 2) Refactor: fn_calendar_items_for_user(p_user_id,...) = the real 10-source
--    logic; fn_calendar_items(...) = thin auth.uid() wrapper (single source of truth).
-- 3) Token gen/revoke RPCs (authenticated).
-- 4) fn_calendar_ics(token,...) = public token-gated feed; EXCLUDES person-leave
--    (p_kinds without 'leave'); the ONE fn granted to anon (token is the auth).
-- (File numbered 160000: 140000 was taken by a concurrent workstream's migration.)

CREATE TABLE IF NOT EXISTS public.calendar_feed_tokens (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES public.profiles(id),
  token            text NOT NULL UNIQUE,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  revoked_at       timestamptz,
  last_accessed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_calendar_feed_tokens_user_active
  ON public.calendar_feed_tokens (user_id) WHERE is_active;

ALTER TABLE public.calendar_feed_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.calendar_feed_tokens FROM anon;
DROP POLICY IF EXISTS calendar_feed_tokens_own ON public.calendar_feed_tokens;
CREATE POLICY calendar_feed_tokens_own ON public.calendar_feed_tokens
  FOR ALL USING (is_super_admin() OR user_id = auth.uid())
  WITH CHECK (is_super_admin() OR user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.fn_calendar_items_for_user(
  p_user_id uuid,
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
    FROM public.get_user_accessible_institutions(p_user_id) gua;

  IF p_institution_ids IS NULL OR array_length(p_institution_ids, 1) IS NULL THEN
    v_effective := v_accessible;
  ELSE
    SELECT COALESCE(array_agg(x), ARRAY[]::uuid[])
      INTO v_effective
      FROM unnest(p_institution_ids) x
     WHERE x = ANY(v_accessible);
  END IF;

  v_can_people_leave := public.user_has_permission(p_user_id, 'calendar.people_leave.view');

  RETURN QUERY
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
    AND public.fn_calendar_feed_enabled('meetings', bm.institutions_id)

  UNION ALL
  SELECT
    ('reservation:' || rr.id::text), 'reservation'::text, rr.id, 'reservation'::text,
    (COALESCE(r.name, 'Resource') || COALESCE(': ' || rr.purpose, ''))::text,
    NULL::text, rr.start_time, rr.end_time, false,
    r.institution_id, i9.name::text, 'Reservation'::text, '#6366f1'::text, false,
    'public'::text, NULL::text,
    jsonb_build_object('status', rr.status, 'resource_id', rr.resource_id)
  FROM public.resource_reservations rr
  JOIN public.resources r ON r.id = rr.resource_id
  JOIN public.institutions i9 ON i9.id = r.institution_id
  WHERE rr.status IN ('approved','completed')
    AND r.institution_id = ANY(v_effective)
    AND (p_kinds IS NULL OR 'reservation' = ANY(p_kinds))
    AND (p_feeds IS NULL OR 'reservations' = ANY(p_feeds))
    AND (p_start IS NULL OR rr.end_time::date   >= p_start)
    AND (p_end   IS NULL OR rr.start_time::date <= p_end)
    AND public.fn_calendar_feed_enabled('reservations', r.institution_id);
END;
$$;

-- thin wrapper (preserves the public signature; scopes to the logged-in user)
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
BEGIN
  RETURN QUERY SELECT * FROM public.fn_calendar_items_for_user(
    auth.uid(), p_institution_ids, p_start, p_end, p_feeds, p_kinds);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_calendar_generate_feed_token()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); v_token text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.calendar_feed_tokens SET is_active = false, revoked_at = now()
    WHERE user_id = v_uid AND is_active;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  INSERT INTO public.calendar_feed_tokens (user_id, token) VALUES (v_uid, v_token);
  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_calendar_revoke_feed_token()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.calendar_feed_tokens SET is_active = false, revoked_at = now()
    WHERE user_id = v_uid AND is_active;
END;
$$;

-- public token-gated ICS feed (excludes person-leave via p_kinds)
CREATE OR REPLACE FUNCTION public.fn_calendar_ics(p_token text, p_start date, p_end date)
RETURNS TABLE (
  item_id text, source_module text, source_id uuid, kind text, title text,
  description text, start_at timestamptz, end_at timestamptz, all_day boolean,
  institution_id uuid, institution_name text, category text, color_code text,
  blocks_attendance boolean, visibility text, person_name text, meta jsonb
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_uid uuid;
BEGIN
  SELECT user_id INTO v_uid FROM public.calendar_feed_tokens
    WHERE token = p_token AND is_active = true;
  IF v_uid IS NULL THEN RETURN; END IF;
  UPDATE public.calendar_feed_tokens SET last_accessed_at = now() WHERE token = p_token;
  RETURN QUERY SELECT * FROM public.fn_calendar_items_for_user(
    v_uid, NULL, p_start, p_end, NULL, ARRAY['holiday','event','meeting','reservation']);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_calendar_items_for_user(uuid, uuid[], date, date, text[], text[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_calendar_items_for_user(uuid, uuid[], date, date, text[], text[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_calendar_items(uuid[], date, date, text[], text[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_calendar_items(uuid[], date, date, text[], text[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_calendar_generate_feed_token() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_calendar_generate_feed_token() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_calendar_revoke_feed_token() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_calendar_revoke_feed_token() TO authenticated;
-- fn_calendar_ics is intentionally anon-callable (the token is the credential):
GRANT  EXECUTE ON FUNCTION public.fn_calendar_ics(text, date, date) TO anon, authenticated;
