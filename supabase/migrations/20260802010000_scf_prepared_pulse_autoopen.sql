-- =============================================================================
-- 20260802010000_scf_prepared_pulse_autoopen.sql
-- Rank 3b — auto-open the session-feedback pulse for TOPIC-SET sessions.
-- Plan: specs/scf-rank3b-live-pulse-prebuild-PLAN-2026-07-24.md (6 Qs locked)
-- =============================================================================
-- The Director asked for a "prepared" pulse that (1) opens at session-start once
-- attendance is marked, (2) opens at session-end if it was never opened, (3)
-- tracks the session if it is rescheduled, and (4) tucks away when the session is
-- cancelled. Investigation of the live substrate showed the simplest mechanism
-- that satisfies all four is a DERIVED sweep — no new "prepared" rows, no parallel
-- poll mechanism (CLAUDE.md rule 26). It EXTENDS the Live Poll Engine Phase B
-- (induction_session_poll status=open, keyed by context_id = scf_live_pulse.id):
--
--   • The "prepared set" is derived every run: today's class_session_lesson rows
--     whose linked curriculum_lesson is PUBLISHED (the Director's "only sessions
--     with a lesson topic set" coverage), whose attendance is MARKED with >=1
--     Present learner (so the present-gate has someone to answer — decision D5),
--     that are NOT on a declared institution holiday, and that have NO poll yet.
--   • #1 open-at-start = open as soon as attendance is marked (marking IS the
--     start signal). #2 open-at-end-if-never-opened = the same sweep catches a
--     marked-but-never-opened session on a later run. #3 reschedule = the derived
--     set reflects the LIVE timetable each run, so a moved session self-follows.
--     #4 cancel = a holiday session is excluded (self-heals if the leave lifts).
--   • The present-gate is UNCHANGED: learners still answer via the existing
--     present-gated bridge (fn_induction_submit_poll_response -> fn_scf_submit_
--     feedback). This migration never relaxes who may answer.
--
-- The poll seeded is MINIMAL: one loop question (understood, 1..5 scale) so it is
-- answerable and feeds the SCF loop (understood-gated). A team member can still
-- enrich it via the existing ClassPollDialog. An already-existing teacher poll
-- (draft or open) is NEVER touched — the sweep only acts when no poll exists.
--
-- Dark by default: platform_policies 'scf.prepared_pulse.enabled' (false). The
-- sweep is the ONLY write path and is gated on it. There is no new read surface —
-- an auto-opened poll is an ordinary open session poll, so turning the switch off
-- simply stops new auto-opens; nothing dark leaks through a read.
--
-- SAFETY: additive. New policy row + one service_role-only SECURITY DEFINER RPC.
-- No schema change to any existing table. Idempotent + advisory-locked per anchor.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Kill switch (dark). Fail-safe: a missing/false row => the sweep is a no-op.
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_policies
  (policy_key, scope_type, value, data_type, description,
   is_system, is_active, classification, publication_state, ui_widget, ui_category)
SELECT * FROM (VALUES
  ('scf.prepared_pulse.enabled','global','false'::jsonb,'boolean',
   'Master switch for auto-opening the session-feedback pulse for topic-set sessions (a PUBLISHED learning-pathway lesson is linked to the session). When true, the */5 cron opens a minimal understanding poll for each such session once attendance is marked (>=1 Present learner) and the session is not on a declared institution holiday. Dark by default; recommendation-only, never relaxes the present-gate.',
   true, true, 'major','published','toggle','scf')
) v(policy_key, scope_type, value, data_type, description,
    is_system, is_active, classification, publication_state, ui_widget, ui_category)
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies p
  WHERE p.policy_key = v.policy_key AND p.scope_type = 'global');

-- ---------------------------------------------------------------------------
-- 2) fn_scf_prepared_pulse_sweep — the sweep. System-only (service_role): the
--    /api/cron/scf-prepared-pulse-sweep route calls it with the service key.
--    SECURITY DEFINER + owner => bypasses RLS; there is no per-user actor here.
-- ---------------------------------------------------------------------------
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
    -- (v1 scope: institution level. Department/semester/section-scoped leaves are
    -- a documented follow-up; the attendance-mark path already blocks marking on a
    -- holiday, so a marked session is rarely a holiday at all.)
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

    -- Resolve / create the session anchor (scf_live_pulse) from the attendance blob,
    -- mirroring _fn_live_poll_ensure_class_anchor's field mapping. is_open=false
    -- until the poll below flips it.
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
        false, now(), now() + interval '240 minutes', NULL)
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
      ('class_session', v_anchor, v_rec.institution_id, NULL, 'open', now(), now() + interval '240 minutes')
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
      SET is_open = true, issued_at = now(), auto_close_at = now() + interval '240 minutes', updated_at = now()
      WHERE id = v_anchor;

    v_opened := v_opened + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'enabled', true, 'date', v_today,
    'candidates', v_candidates, 'opened', v_opened, 'skipped_holiday', v_skipped_holiday);
END;
$$;

-- System-only: cron drains it with the service key. NOT authenticated/anon
-- (a session-scoped caller must never trigger a mass auto-open).
REVOKE EXECUTE ON FUNCTION public.fn_scf_prepared_pulse_sweep() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_scf_prepared_pulse_sweep() TO service_role;

-- PostgREST must see the new function immediately.
NOTIFY pgrst, 'reload schema';
