-- ============================================================================
-- The Availability Spine — Limb 2: PEOPLE
-- File: 20260629120000_person_availability_brain.sql | Date: 2026-06-29
--
-- Limb 1 put ROOMS on one booking spine (resource_reservations via
-- ReservationService). Limb 2 puts PEOPLE on the same idea: ONE function that
-- answers "is this person free during [start, end)?" by reading whichever tables
-- hold that person's time. A person has no single diary — their time is spread
-- across three places that today cannot see each other:
--
--   1. TEACHING   — timetables.timetable_data (a recurring weekly grid, keyed by
--                   WEEKDAY then period_id; clock-times live in timetables.periods;
--                   valid over [start_date, end_date]). staff_ids are staff.id;
--                   the bridge to the universal user key is staff.profile_id.
--   2. MEETINGS   — meeting_bookings (absolute timestamps; host or attendee).
--   3. EVENT WORK — speaking at an event session (event_session_speakers ->
--                   event_sessions.start_at/end_at) OR a timed role on an event
--                   (event_human_roles -> events.start_date/end_date).
--
-- This is the brain the vision asks for: a shared QUESTION (function), not a new
-- mega-table. Any module (induction speaker picker, events, meetings) calls it.
--
-- POLICY (v1): the brain REPORTS conflicts; callers decide. A teaching overlap is
-- often legitimately resolvable (a substitute is arranged), so v1 surfaces a
-- visible warning rather than hard-refusing an assignment — strictly safer than a
-- block and trivially upgradeable to a refuse later. (Rooms, a physical thing,
-- stay a hard-stop in Limb 1; a person's hour is advisory in Limb 2.)
--
-- TIMEZONE: teaching clock-times ("14:00:00") are local IST; they are rebuilt as
-- absolute instants via AT TIME ZONE 'Asia/Kolkata' before any overlap compare,
-- so they line up with the UTC timestamptz of meetings and event sessions.
--
-- SECURITY: SECURITY DEFINER, anon-locked. Reading a person's schedule is gated —
-- only super/admin or a caller with access to that person's institution gets rows;
-- everyone else gets an empty set (graceful: they cannot see that calendar anyway).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_person_conflicts(
  p_profile_id uuid,
  p_start      timestamptz,
  p_end        timestamptz
)
RETURNS TABLE (
  source     text,         -- 'teaching' | 'meeting' | 'event'
  ref_id     uuid,         -- timetable id / meeting id / session or event id
  label      text,         -- human-readable conflict label
  starts_at  timestamptz,
  ends_at    timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
            WHERE pe->>'period_id' = v_key
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
$$;

REVOKE EXECUTE ON FUNCTION public.fn_person_conflicts(uuid, timestamptz, timestamptz) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_person_conflicts(uuid, timestamptz, timestamptz) TO authenticated;

-- ── Batch wrapper — check many people in one round-trip (the speaker picker checks
-- every selected person at once). Reuses the single brain via LATERAL (DRY); the
-- per-person scope guard inside fn_person_conflicts still applies to each id. ──
CREATE OR REPLACE FUNCTION public.fn_people_conflicts(
  p_profile_ids uuid[],
  p_start       timestamptz,
  p_end         timestamptz
)
RETURNS TABLE (
  profile_id uuid,
  source     text,
  ref_id     uuid,
  label      text,
  starts_at  timestamptz,
  ends_at    timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pid, c.source, c.ref_id, c.label, c.starts_at, c.ends_at
  FROM unnest(COALESCE(p_profile_ids, ARRAY[]::uuid[])) AS pid
  CROSS JOIN LATERAL public.fn_person_conflicts(pid, p_start, p_end) c
$$;

REVOKE EXECUTE ON FUNCTION public.fn_people_conflicts(uuid[], timestamptz, timestamptz) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_people_conflicts(uuid[], timestamptz, timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';
