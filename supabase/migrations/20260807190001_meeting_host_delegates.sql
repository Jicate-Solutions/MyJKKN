-- Updated: 2026-07-30 - Meeting host delegates (a PA who runs the principal's diary)
--
-- WHY
-- Director, 2026-07-30: Mrs. SARANYA DEVI PM is "PA to Principal" at Dental and
-- needs access to Dr Dhanasekar's calendar to manage his meetings. She had been
-- given the `principal` ROLE to achieve this, which was wrong twice over:
--   (a) it made the platform think Dental had two principals, and
--   (b) the auto-meeting engine pulls EVERY active principal into the review
--       meeting and refuses to book when any participant has no Google Calendar
--       connection (decision #4). She has none, so her role was silently
--       blocking every Dental meeting from ever being scheduled.
-- Her role is now `staff`. This migration gives PAs the access they actually
-- need, without impersonating a principal.
--
-- A production sweep on 2026-07-30 confirmed no delegate/assistant/on-behalf
-- mechanism already exists for meetings (the only near-matches are the BoS
-- member-secretary type and an unrelated AI "confused deputy" security sweep).
--
-- SCOPE — deliberately narrow. A delegate sees their host's meetings on
-- /calendar. It is NOT an institution-wide widening and it does NOT grant the
-- principal's permissions anywhere else in the platform.

CREATE TABLE IF NOT EXISTS public.meeting_host_delegates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_profile_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  delegate_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_active           boolean NOT NULL DEFAULT true,
  created_by          uuid REFERENCES public.profiles(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mhd_not_self CHECK (host_profile_id <> delegate_profile_id),
  CONSTRAINT mhd_unique_pair UNIQUE (host_profile_id, delegate_profile_id)
);

-- The resolver looks up "is p_user_id a delegate of this booking's host", so the
-- delegate side is the hot path.
CREATE INDEX IF NOT EXISTS idx_mhd_delegate_active
  ON public.meeting_host_delegates (delegate_profile_id, host_profile_id)
  WHERE is_active;

ALTER TABLE public.meeting_host_delegates ENABLE ROW LEVEL SECURITY;

-- Supabase grants anon on every new relation by default; revoke explicitly.
REVOKE ALL ON public.meeting_host_delegates FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_host_delegates TO authenticated;
GRANT ALL ON public.meeting_host_delegates TO service_role;

-- COALESCE(..., false): a SECDEF guard returning NULL would otherwise make the
-- whole policy NULL and fall through.
DROP POLICY IF EXISTS mhd_select ON public.meeting_host_delegates;
CREATE POLICY mhd_select ON public.meeting_host_delegates FOR SELECT
  USING (COALESCE(is_super_admin(), false) OR COALESCE(is_admin(), false)
         OR host_profile_id = auth.uid() OR delegate_profile_id = auth.uid());

DROP POLICY IF EXISTS mhd_insert ON public.meeting_host_delegates;
CREATE POLICY mhd_insert ON public.meeting_host_delegates FOR INSERT
  WITH CHECK (COALESCE(is_super_admin(), false) OR COALESCE(is_admin(), false)
              OR host_profile_id = auth.uid());

DROP POLICY IF EXISTS mhd_update ON public.meeting_host_delegates;
CREATE POLICY mhd_update ON public.meeting_host_delegates FOR UPDATE
  USING (COALESCE(is_super_admin(), false) OR COALESCE(is_admin(), false)
         OR host_profile_id = auth.uid())
  WITH CHECK (COALESCE(is_super_admin(), false) OR COALESCE(is_admin(), false)
              OR host_profile_id = auth.uid());

DROP POLICY IF EXISTS mhd_delete ON public.meeting_host_delegates;
CREATE POLICY mhd_delete ON public.meeting_host_delegates FOR DELETE
  USING (COALESCE(is_super_admin(), false) OR COALESCE(is_admin(), false)
         OR host_profile_id = auth.uid());

COMMENT ON TABLE public.meeting_host_delegates IS
  'A host may name delegates (e.g. a PA) who can see that host''s meetings on /calendar. Scoped per host; not an institution-wide widening.';

-- ---------------------------------------------------------------------------
-- Calendar resolver — a delegate sees their host's meetings
-- ---------------------------------------------------------------------------
-- Regenerated from the LIVE production definition (pg_get_functiondef, md5
-- b0b0bbed75f856f332278733fc1d96cc) on 2026-07-30 with ONE clause added and
-- asserted — not copied from the repo file, which is how a live gate got
-- silently reverted in this codebase before.
--
-- SECURITY: CREATE OR REPLACE preserves the existing ACL and this migration adds
-- no GRANT for the resolver. It takes a caller-supplied p_user_id and is
-- SECURITY DEFINER, so granting it to a signed-in role is an IDOR (#2528).
CREATE OR REPLACE FUNCTION public.fn_calendar_items_for_user(p_user_id uuid, p_institution_ids uuid[] DEFAULT NULL::uuid[], p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date, p_feeds text[] DEFAULT NULL::text[], p_kinds text[] DEFAULT NULL::text[], p_exclude_google_synced boolean DEFAULT false)
 RETURNS TABLE(item_id text, source_module text, source_id uuid, kind text, title text, description text, start_at timestamp with time zone, end_at timestamp with time zone, all_day boolean, institution_id uuid, institution_name text, category text, color_code text, blocks_attendance boolean, visibility text, person_name text, meta jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    AND public.fn_calendar_feed_enabled('reservations', r.institution_id)

  -- ---------------------------------------------------------------------
  -- NEW 2026-07-28: Meetings-module bookings (the scheduling / booking-page
  -- engine behind public.meeting_bookings).
  --
  -- VISIBILITY (Director decision 2026-07-28 #2)
  --   Always:  the people IN the meeting  (host_profile_id / attendee_profile_id)
  --   Plus:    a CONFIGURABLE widening, read at runtime from platform_policies
  --            key 'calendar.meeting_booking_visibility' (seeded 'private'):
  --              'private'      -> participants only                      [DEFAULT]
  --              'principal'    -> participants + the principal of the
  --                                booking's institution
  --              'institution'  -> participants + everyone who can already
  --                                access that institution
  --   A booking with institution_id IS NULL can never be widened: there is no
  --   institution from which to resolve a principal, so it stays participants-only.
  --   (23 of the 26 live bookings on 2026-07-28 have a NULL institution_id, and
  --   all 9 non-cancelled ones do — so today the widening is a no-op on real data.)
  --   The institution guard below is unconditional, so a widened viewer still
  --   has to hold access to that institution.
  --
  -- STATUS
  --   status CHECK = confirmed | cancelled | completed | no_show.
  --   'cancelled' and 'no_show' are both excluded: neither belongs on a
  --   forward-looking calendar. 'completed' is kept so past meetings stay visible.
  --
  -- GOOGLE DE-DUPLICATION (Director decision 2026-07-28 #3)
  --   lib/services/meetings/calendar-sync-service.ts already pushes a booking
  --   into the host's Google Calendar at booking time and stores the resulting
  --   google_event_id. If our ICS feed ALSO emitted that booking, Google would
  --   show it twice. p_exclude_google_synced (passed true by fn_calendar_ics,
  --   false everywhere else) drops already-synced bookings from the ICS/Google
  --   path only — they still render on the in-app /calendar page, where they
  --   are not a duplicate.
  -- ---------------------------------------------------------------------
  UNION ALL
  SELECT
    ('meeting_booking:' || mb.id::text), 'meeting_booking'::text, mb.id, 'meeting'::text,
    (
      CASE
        WHEN mb.host_profile_id = p_user_id
          THEN COALESCE(NULLIF(btrim(mb.attendee_name), ''), NULLIF(btrim(mb.attendee_email), ''), 'Guest')
        WHEN mb.attendee_profile_id = p_user_id
          THEN COALESCE(NULLIF(btrim(hp.full_name), ''), NULLIF(btrim(hp.email), ''), 'Host')
        ELSE COALESCE(NULLIF(btrim(mb.attendee_name), ''), NULLIF(btrim(mb.attendee_email), ''), 'Guest')
             || ' with ' || COALESCE(NULLIF(btrim(hp.full_name), ''), NULLIF(btrim(hp.email), ''), 'Host')
      END
      || ' — ' || COALESCE(NULLIF(btrim(mt.title), ''), 'Meeting')
    )::text,
    (
      'Meeting type: ' || COALESCE(NULLIF(btrim(mt.title), ''), 'Meeting')
      || E'\nHost: ' || COALESCE(NULLIF(btrim(hp.full_name), ''), NULLIF(btrim(hp.email), ''), 'Unknown')
      || E'\nAttendee: ' || COALESCE(NULLIF(btrim(mb.attendee_name), ''), 'Guest')
      -- attendee_email is shown only to the two people in the meeting, never to a
      -- widened viewer (principal / institution).
      || CASE WHEN mb.host_profile_id = p_user_id OR mb.attendee_profile_id = p_user_id
              THEN COALESCE(' <' || NULLIF(btrim(mb.attendee_email), '') || '>', '')
              ELSE '' END
      || COALESCE(E'\nJoin: '  || NULLIF(btrim(mb.video_url), ''),      '')
      || COALESCE(E'\nWhere: ' || NULLIF(btrim(mt.location_text), ''),  '')
      || COALESCE(E'\n\n'      || NULLIF(btrim(mt.description), ''),    '')
    )::text,
    mb.start_time, mb.end_time, false,
    mb.institution_id, i10.name::text, 'Meeting'::text, '#d946ef'::text, false,
    'restricted'::text,
    COALESCE(NULLIF(btrim(mb.attendee_name), ''), NULLIF(btrim(mb.attendee_email), ''))::text,
    jsonb_build_object(
      'status', mb.status,
      'source', mb.source,
      'video_url', mb.video_url,
      'meeting_type_id', mb.meeting_type_id,
      'meeting_type_title', mt.title,
      'host_name', hp.full_name,
      'is_host', (mb.host_profile_id = p_user_id),
      'is_participant', (mb.host_profile_id = p_user_id OR mb.attendee_profile_id = p_user_id),
      'google_synced', (mb.google_event_id IS NOT NULL)
    )
  FROM public.meeting_bookings mb
  LEFT JOIN public.meeting_types mt ON mt.id = mb.meeting_type_id
  LEFT JOIN public.profiles      hp ON hp.id = mb.host_profile_id
  LEFT JOIN public.institutions  i10 ON i10.id = mb.institution_id
  WHERE mb.status <> 'no_show'
    AND (
      -- the people IN the meeting
      mb.host_profile_id = p_user_id
      OR mb.attendee_profile_id = p_user_id
      -- ... plus anyone the host has named as their delegate (a PA running the
      -- principal's diary). Scoped to that ONE host and only while the
      -- delegation is active — it is not an institution-wide widening.
      OR EXISTS (
           SELECT 1 FROM public.meeting_host_delegates d
            WHERE d.delegate_profile_id = p_user_id
              AND d.host_profile_id     = mb.host_profile_id
              AND d.is_active
         )
      -- ... plus the configured widening (default 'private' = nobody else)
      OR (
        mb.institution_id IS NOT NULL
        AND CASE lower(COALESCE(
                   public.fn_get_policy_text('calendar.meeting_booking_visibility',
                                             'private', mb.institution_id),
                   'private'))
              WHEN 'institution' THEN true
              WHEN 'principal'   THEN EXISTS (
                     SELECT 1 FROM public.profiles pr
                      WHERE pr.id = p_user_id
                        AND pr.role = 'principal'
                        AND pr.institution_id = mb.institution_id
                        AND COALESCE(pr.is_active, true) = true)
              ELSE false
            END
      )
    )
    AND (mb.institution_id IS NULL OR mb.institution_id = ANY(v_effective))
    AND (COALESCE(p_exclude_google_synced, false) = false OR mb.google_event_id IS NULL)
    AND (p_kinds IS NULL OR 'meeting' = ANY(p_kinds))
    AND (p_feeds IS NULL OR 'meetings' = ANY(p_feeds))
    AND (p_start IS NULL OR mb.end_time::date   >= p_start)
    AND (p_end   IS NULL OR mb.start_time::date <= p_end)
    AND public.fn_calendar_feed_enabled('meetings', mb.institution_id);
END;
$function$;

-- Re-assert the resolver ACL (belt and braces; also satisfies the CI secdef gate).
REVOKE EXECUTE ON FUNCTION public.fn_calendar_items_for_user(
  uuid, uuid[], date, date, text[], text[], boolean) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_calendar_items_for_user(
  uuid, uuid[], date, date, text[], text[], boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- Seed the delegation the Director asked for
-- ---------------------------------------------------------------------------
INSERT INTO public.meeting_host_delegates (host_profile_id, delegate_profile_id, created_by)
SELECT h.id, d.id, (SELECT id FROM public.profiles WHERE email = 'aiperio@jkkn.ac.in')
  FROM public.profiles h, public.profiles d
 WHERE h.email = 'dentalprincipal@jkkn.ac.in'
   AND d.email = 'saranyadevi.pm@jkkn.ac.in'
ON CONFLICT (host_profile_id, delegate_profile_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Guards — fail loudly rather than ship a hole
-- ---------------------------------------------------------------------------
DO $guard$
DECLARE v_bad text := '';
BEGIN
  IF has_table_privilege('anon', 'public.meeting_host_delegates', 'SELECT') THEN
    v_bad := v_bad || E'\n  meeting_host_delegates is readable by anon';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.meeting_host_delegates'::regclass) THEN
    v_bad := v_bad || E'\n  meeting_host_delegates has RLS disabled';
  END IF;
  IF has_function_privilege('authenticated',
       'public.fn_calendar_items_for_user(uuid,uuid[],date,date,text[],text[],boolean)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.fn_calendar_items_for_user(uuid,uuid[],date,date,text[],text[],boolean)', 'EXECUTE') THEN
    v_bad := v_bad || E'\n  fn_calendar_items_for_user is reachable by authenticated/anon (IDOR)';
  END IF;
  IF v_bad <> '' THEN
    RAISE EXCEPTION 'meeting_host_delegates migration did not reach a safe state:%', v_bad;
  END IF;
END
$guard$;
