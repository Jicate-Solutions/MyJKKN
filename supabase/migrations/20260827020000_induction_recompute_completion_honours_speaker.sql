-- ============================================================================
-- Fresher Induction — recompute_completion honours the resource-person gate
-- File: 20260827020000_induction_recompute_completion_honours_speaker.sql
-- Date: 2026-08-27
--
-- BUG (measured live 2026-08-18 as savithiranm2024mech@jkkn.ac.in, a resource
-- person on session "Registration" of Fresher Induction 2026 - Engineering):
-- saving attendance failed with
--     ERROR P0001: fn_induction_recompute_completion: not authorized
--     CONTEXT: SQL statement "SELECT public.fn_induction_recompute_completion(v_event)"
--              PL/pgSQL function fn_induction_mark_attendance(uuid,jsonb)
--
-- 20260702150000 opened the resource-person path through four gates
-- (fn_induction_list_sessions, fn_induction_session_roster,
--  fn_induction_mark_attendance, fn_induction_session_feedback_roster) and the
-- supporting RLS — all verified live — but missed the FIFTH gate, which is not
-- called by the UI at all: mark_attendance ends with the completion rollup, and
-- that callee re-authorizes from scratch. The speaker was allowed to write the
-- attendance rows and then denied the rollup, so the whole transaction aborted.
-- The attendance button was reachable and every save failed.
--
-- FIX: OR in the same event-speaker test the caller already passed. The rollup
-- takes NO caller-supplied data — it only recomputes induction_completion from
-- rows that already exist — so a resource person of THIS event triggering it
-- cannot write anything they were not already authorized to write. Every other
-- branch of the gate is unchanged.
--
-- Body below is the LIVE definition (pg_get_functiondef) with ONLY the marked
-- line added.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_induction_recompute_completion(p_event_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_inst UUID; v_thr INTEGER; v_fbpct INTEGER; v_n INTEGER;
BEGIN
  SELECT institution_id, completion_attendance_pct, completion_feedback_pct
    INTO v_inst, v_thr, v_fbpct
  FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_recompute_completion: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)
          OR public.fn_induction_is_event_speaker(p_event_id)) THEN  -- ADDED: resource person of this event
    RAISE EXCEPTION 'fn_induction_recompute_completion: not authorized';
  END IF;

  -- One CTE feeds attendance AND feedback from the fresher's applicable (batch)
  -- sessions. Two LEFT JOINs fan out rows, so every numerator uses
  -- count(DISTINCT session) to stay correct.
  WITH att AS (
    SELECT e.learner_id, e.institution_id,
           count(DISTINCT s.id) AS total,
           count(DISTINCT s.id) FILTER (WHERE a.status IN ('present','od')) AS attended,
           count(DISTINCT s.id) FILTER (WHERE f.id IS NOT NULL) AS rated
    FROM public.induction_enrollment e
    LEFT JOIN public.event_sessions s
      ON s.event_id = e.event_id AND (s.batch_id IS NULL OR s.batch_id = e.batch_id)
    LEFT JOIN public.event_session_attendance a
      ON a.session_id = s.id AND a.learner_id = e.learner_id
    LEFT JOIN public.event_session_feedback f
      ON f.session_id = s.id AND f.learner_id = e.learner_id
    WHERE e.event_id = p_event_id
    GROUP BY e.learner_id, e.institution_id
  )
  INSERT INTO public.induction_completion
    (event_id, learner_id, institution_id, sessions_total, sessions_attended,
     attendance_pct, participation_complete, outcome_complete, completed_at, updated_at)
  SELECT p_event_id, att.learner_id, att.institution_id, att.total, att.attended,
         CASE WHEN att.total = 0 THEN 0 ELSE round(100.0 * att.attended / att.total, 2) END,
         (att.total > 0 AND (100.0 * att.attended / att.total) >= v_thr),
         (   (att.total > 0 AND (100.0 * att.attended / att.total) >= v_thr)
          OR (att.total > 0 AND (100.0 * att.rated    / att.total) >= v_fbpct) ),
         CASE WHEN (   (att.total > 0 AND (100.0 * att.attended / att.total) >= v_thr)
                    OR (att.total > 0 AND (100.0 * att.rated    / att.total) >= v_fbpct) )
              THEN now() ELSE NULL END,
         now()
  FROM att
  ON CONFLICT (event_id, learner_id) DO UPDATE SET
    sessions_total = EXCLUDED.sessions_total,
    sessions_attended = EXCLUDED.sessions_attended,
    attendance_pct = EXCLUDED.attendance_pct,
    participation_complete = EXCLUDED.participation_complete,
    -- attendance OR feedback (EXCLUDED.outcome_complete) OR the fresher's live referral count
    outcome_complete = (EXCLUDED.outcome_complete OR induction_completion.referrals_submitted >= 1),
    completed_at = CASE
      WHEN (EXCLUDED.outcome_complete OR induction_completion.referrals_submitted >= 1)
        THEN COALESCE(induction_completion.completed_at, now())
      ELSE NULL END,
    updated_at = now();

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $function$;

NOTIFY pgrst, 'reload schema';
