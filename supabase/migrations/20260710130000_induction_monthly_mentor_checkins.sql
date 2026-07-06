-- Migration: 20260710130000_induction_monthly_mentor_checkins.sql
-- P2c-2 — Year-round mentoring: one admin action creates a monthly Senior Peer
-- Mentor ↔ fresher check-in for each month from just after induction through the
-- freshers' first-academic-year end. Each check-in is a normal event_sessions row
-- on the induction event, so it flows through the mentor's EXISTING lane
-- (fn_induction_my_volunteer_sessions lists every session of the event) and the
-- existing attendance/feedback tools — already group-scoped and already gated by
-- the training gate (P2b) and the year-end lifecycle gate (P2c-1). No new mentor
-- surface; the only new thing is the admin "schedule monthly check-ins" action.

-- ── 1. Tag check-in sessions so they're distinguishable from induction talks ──
-- NULL = a regular induction/event session (unchanged); 'mentor_checkin' = a
-- Senior Peer Mentor monthly check-in. Nullable + no default → existing rows and
-- all other event types are untouched.
ALTER TABLE public.event_sessions
  ADD COLUMN IF NOT EXISTS kind text;

COMMENT ON COLUMN public.event_sessions.kind IS
  'NULL = regular session. ''mentor_checkin'' = a Senior Peer Mentor monthly check-in (P2c-2).';

-- ── 2. Generate the year's monthly check-ins (idempotent, admin-gated) ───────
CREATE OR REPLACE FUNCTION public.fn_induction_generate_monthly_checkins(p_event_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_end        date;
  v_last_ind   timestamptz;
  v_month      timestamptz;
  v_end_month  timestamptz;
  v_order      integer;
  v_n          integer := 0;
BEGIN
  IF NOT public.fn_induction_can_manage_training(p_event_id) THEN
    RAISE EXCEPTION 'fn_induction_generate_monthly_checkins: not authorized';
  END IF;

  -- The freshers' first-academic-year end (resolved from the event's admission_year).
  SELECT ay.end_date INTO v_end
  FROM public.induction_programs ip
  JOIN public.academic_years ay
    ON ay.institution_id = ip.institution_id
   AND EXTRACT(YEAR FROM ay.start_date) = ip.admission_year
  WHERE ip.event_id = p_event_id
  ORDER BY ay.start_date DESC
  LIMIT 1;
  IF v_end IS NULL THEN
    RAISE EXCEPTION 'fn_induction_generate_monthly_checkins: could not resolve the induction''s academic year (set the college''s academic years / admission year)';
  END IF;

  -- Start the month AFTER the last induction-week session (fall back to the
  -- current month if there are none yet), so check-ins begin post-induction.
  SELECT max(s.end_at) INTO v_last_ind
  FROM public.event_sessions s
  WHERE s.event_id = p_event_id AND s.kind IS DISTINCT FROM 'mentor_checkin';

  v_month := date_trunc('month', GREATEST(COALESCE(v_last_ind, now()), now())) + interval '1 month';
  v_end_month := date_trunc('month', v_end::timestamptz);

  SELECT COALESCE(max(session_order), 0) INTO v_order
  FROM public.event_sessions WHERE event_id = p_event_id;

  WHILE v_month <= v_end_month LOOP
    -- Idempotent: skip a month that already has a check-in.
    IF NOT EXISTS (
      SELECT 1 FROM public.event_sessions s
      WHERE s.event_id = p_event_id AND s.kind = 'mentor_checkin'
        AND date_trunc('month', s.start_at) = v_month
    ) THEN
      v_order := v_order + 1;
      INSERT INTO public.event_sessions
        (event_id, title, start_at, end_at, kind, day_number, session_order, status, created_by, resource_links)
      VALUES (
        p_event_id,
        'Monthly Check-in — ' || to_char(v_month, 'FMMonth YYYY'),
        v_month + interval '14 days' + interval '10 hours',   -- 15th, 10:00
        v_month + interval '14 days' + interval '11 hours',   -- 15th, 11:00 (end_at > start_at)
        'mentor_checkin',
        NULL,
        v_order,
        'scheduled',
        auth.uid(),
        '[]'::jsonb
      );
      v_n := v_n + 1;
    END IF;
    v_month := v_month + interval '1 month';
  END LOOP;

  RETURN v_n;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_generate_monthly_checkins(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_generate_monthly_checkins(uuid) TO authenticated;

-- ── 3. Count check-ins already scheduled (for the admin button label) ────────
CREATE OR REPLACE FUNCTION public.fn_induction_count_monthly_checkins(p_event_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int FROM public.event_sessions
  WHERE event_id = p_event_id AND kind = 'mentor_checkin';
$$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_count_monthly_checkins(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_count_monthly_checkins(uuid) TO authenticated;
