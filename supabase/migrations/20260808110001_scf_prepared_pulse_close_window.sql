-- =============================================================================
-- 20260808110001_scf_prepared_pulse_close_window.sql
-- Give an auto-opened pulse the SAME answer window as a team-member-opened one.
-- =============================================================================
-- Defect: fn_scf_prepared_pulse_sweep (20260802010000) hardcodes
-- `now() + interval '240 minutes'` for auto_close_at. The live poll opener,
-- fn_live_poll_open_class_poll, was changed by 20260731040000 (decision #37) to
-- close at 21:00 IST of the day it opens. The prepared-pulse sweep is the NEWER
-- migration but carries the OLDER convention, so the two paths disagree.
--
-- Why it matters: attendance for a 09:30 IST session is marked at ~09:30, so the
-- sweep opens the pulse then and it dies at 13:30 IST — while the identical pulse
-- opened by a team member lives until 21:00. The window is enforced:
-- _fn_live_poll_learner_can_answer gates on `auto_close_at > now()`, and
-- fn_scf_submit_feedback flips the source to 'async' past it. That directly
-- defeats the sweep's own stated purpose — "open at session-end if it was never
-- opened" — because a learner who checks after class finds the pulse closed.
--
-- Fix: compute v_close exactly as fn_live_poll_open_class_poll does (21:00 IST of
-- the current day; +2h if the sweep somehow runs after 21:00) and use it at all
-- THREE sites that set a close time — the scf_live_pulse anchor INSERT, the
-- induction_session_poll INSERT, and the scf_live_pulse anchor UPDATE. Those
-- three sites write the two columns: scf_live_pulse.auto_close_at (twice) and
-- induction_session_poll.auto_close_at (once).
--
-- SCOPE: this changes the close time and NOTHING else. The candidate query, the
-- kill switch, the present-gate, idempotency, the advisory lock and the seeded
-- question are byte-for-byte unchanged from the live definition.
--
-- NOT A GO-LIVE ENABLER. The feature is dark — platform_policies
-- 'scf.prepared_pulse.enabled' is false and this migration does not touch it.
-- It is also currently inert regardless of the flag: the sweep requires a session
-- linked to a PUBLISHED curriculum_lesson, and production has 8 published lessons
-- out of 30,340 and 8 class_session_lesson links in total (0 today). This is a
-- pre-emptive correctness fix, made while the feature is still dark.
--
-- SAFETY: CREATE OR REPLACE of one service_role-only SECURITY DEFINER function.
-- No schema change, no data change, no policy change. Grants re-asserted below.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_scf_prepared_pulse_sweep()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled          boolean;
  v_today            date;
  v_close            timestamptz;
  v_rec              record;
  v_anchor           uuid;
  v_poll_id          uuid;
  v_qid              uuid;
  v_opened           int := 0;
  v_candidates       int := 0;
  v_skipped_holiday  int := 0;
BEGIN
  -- Kill switch (gates the only write path). Fail-safe to OFF.
  SELECT (value #>> '{}')::boolean INTO v_enabled
    FROM public.platform_policies
   WHERE policy_key = 'scf.prepared_pulse.enabled' AND scope_type = 'global' AND is_active
   LIMIT 1;
  IF COALESCE(v_enabled, false) = false THEN
    RETURN jsonb_build_object('enabled', false, 'opened', 0);
  END IF;

  -- Only same-day sessions auto-open (IST wall-clock date).
  v_today := (now() AT TIME ZONE 'Asia/Kolkata')::date;

  -- Close at 21:00 IST of the day the pulse opens — IDENTICAL to
  -- fn_live_poll_open_class_poll (decision #37), so an auto-opened pulse and a
  -- team-member-opened one have the same answer window. If the sweep runs after
  -- 21:00 IST (rare), give +2h so the pulse is not born already closed.
  v_close := (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') + interval '21 hours') AT TIME ZONE 'Asia/Kolkata';
  IF v_close <= now() THEN v_close := now() + interval '2 hours'; END IF;

  FOR v_rec IN
    SELECT csl.timetable_id,
           csl.attendance_date,
           csl.period_id,
           sa.institution_id,
           sa.attendance_data -> csl.period_id AS pv
    FROM public.class_session_lesson csl
    JOIN public.curriculum_lesson l
      ON l.id = csl.lesson_id AND l.status = 'published'          -- topic set (D coverage)
    JOIN public.student_attendance sa
      ON sa.timetable_id = csl.timetable_id
     AND sa.attendance_date = csl.attendance_date
     AND sa.attendance_data ? csl.period_id                      -- attendance marked
    WHERE csl.attendance_date = v_today
      AND EXISTS (                                               -- >=1 Present (someone can answer)
        SELECT 1
        FROM jsonb_array_elements(sa.attendance_data -> csl.period_id -> 'students') st
        WHERE st ->> 'status' = 'Present'
      )
      AND NOT EXISTS (                                           -- idempotent + never clobber a teacher poll
        SELECT 1
        FROM public.scf_live_pulse a
        JOIN public.induction_session_poll p
          ON p.context_type = 'class_session' AND p.context_id = a.id
        WHERE a.timetable_id   = csl.timetable_id
          AND a.attendance_date = csl.attendance_date
          AND a.period_id       = csl.period_id
      )
  LOOP
    v_candidates := v_candidates + 1;

    -- Cancelled = a declared, approved, institution-scope holiday over the date.
    IF EXISTS (
      SELECT 1 FROM public.institution_leaves il
      WHERE il.status = 'approved'
        AND il.scope_level = 'institution'
        AND il.institution_id = v_rec.institution_id
        AND v_rec.attendance_date BETWEEN il.start_date AND il.end_date
    ) THEN
      v_skipped_holiday := v_skipped_holiday + 1;
      CONTINUE;
    END IF;

    -- Serialise per session anchor (belt-and-braces; the cron is single-worker).
    PERFORM pg_advisory_xact_lock(
      hashtext(v_rec.timetable_id::text || '|' || v_rec.attendance_date::text || '|' || v_rec.period_id));

    SELECT a.id INTO v_anchor
    FROM public.scf_live_pulse a
    WHERE a.timetable_id = v_rec.timetable_id
      AND a.attendance_date = v_rec.attendance_date
      AND a.period_id = v_rec.period_id
    ORDER BY a.issued_at DESC
    LIMIT 1;

    IF v_anchor IS NULL THEN
      INSERT INTO public.scf_live_pulse (
        institution_id, timetable_id, attendance_date, period_id,
        course_code, course_name, faculty_email, is_open, issued_at, auto_close_at, created_by)
      VALUES (
        v_rec.institution_id, v_rec.timetable_id, v_rec.attendance_date, v_rec.period_id,
        v_rec.pv ->> 'course_code',
        v_rec.pv ->> 'course_name',
        v_rec.pv -> 'assigned_faculty' ->> 'faculty_email',
        false, now(), v_close, NULL)
      RETURNING id INTO v_anchor;
    END IF;

    -- Re-check inside the lock: another run (or a team member) may have just
    -- created a poll for this anchor. Never clobber it.
    IF EXISTS (
      SELECT 1 FROM public.induction_session_poll p
      WHERE p.context_type = 'class_session' AND p.context_id = v_anchor
    ) THEN
      CONTINUE;
    END IF;

    -- Create the minimal loop poll, OPEN, with the single understood question.
    INSERT INTO public.induction_session_poll
      (context_type, context_id, institution_id, created_by, status, issued_at, auto_close_at)
    VALUES
      ('class_session', v_anchor, v_rec.institution_id, NULL, 'open', now(), v_close)
    RETURNING id INTO v_poll_id;

    INSERT INTO public.induction_session_poll_question
      (poll_id, prompt, kind, position, scale_min_label, scale_max_label, loop_role)
    VALUES
      (v_poll_id, 'How well did you follow today''s session?', 'scale', 0, 'Lost', 'Fully followed', 'understood')
    RETURNING id INTO v_qid;

    INSERT INTO public.induction_session_poll_option (question_id, label, position)
    SELECT v_qid, g::text, g - 1 FROM generate_series(1, 5) AS g;

    UPDATE public.induction_session_poll
      SET current_question_id = v_qid
      WHERE id = v_poll_id;

    -- Sync the anchor pulse so learner discovery + the honest source label treat
    -- it as live (identical to a team-member-opened poll).
    UPDATE public.scf_live_pulse
      SET is_open = true, issued_at = now(), auto_close_at = v_close, updated_at = now()
      WHERE id = v_anchor;

    v_opened := v_opened + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'enabled', true, 'date', v_today,
    'candidates', v_candidates, 'opened', v_opened, 'skipped_holiday', v_skipped_holiday);
END;
$$;

-- System-only: cron drains it with the service key. NOT authenticated/anon
-- (a session-scoped caller must never trigger a mass auto-open). Re-asserted
-- because CREATE OR REPLACE must never be the reason a grant silently widens.
REVOKE EXECUTE ON FUNCTION public.fn_scf_prepared_pulse_sweep() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_scf_prepared_pulse_sweep() TO service_role;

-- PostgREST must see the replaced function immediately.
NOTIFY pgrst, 'reload schema';
