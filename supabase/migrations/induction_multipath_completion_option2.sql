-- =====================================================================
-- Induction Option-2 multi-path completion  (2026-07-09)
-- =====================================================================
-- Director decision (2026-07-09): induction completion is satisfied by ANY of
--   attendance ≥ threshold   OR   session-feedback ≥ threshold   OR   referral ≥ 1.
-- Referral is no longer the SOLE completion gate — that was the root cause of the
-- self-referral gaming (18 of 19 induction referrals were freshers self-referring
-- to clear the effort gate). A fresher who genuinely attended / gave feedback now
-- completes without being pushed to fabricate a referral.
--
-- Feedback bar is CONFIG-DRIVEN, mirroring completion_attendance_pct exactly
-- (both default 75%). Director set it to 75% of the fresher's sessions with full
-- knowledge of the blast radius (feedback is a per-session form; ~30 sessions/batch,
-- so 75% ≈ 23 forms; ~43 freshers complete on the live cohort).
--
-- fn_induction_recompute_completion becomes the SINGLE authority for
-- outcome_complete. fn_induction_submit_referral is left untouched: it only ever
-- runs on a fresh referral submission (count ≥ 1), so it can grant completion but
-- never demote it — and any admin quarantine is followed by a recompute, which now
-- keeps feedback/attendance-complete freshers complete.

-- 1) Config row for the feedback bar (per-program, re-tunable; parallels
--    completion_attendance_pct). Default 75%.
ALTER TABLE public.induction_programs
  ADD COLUMN IF NOT EXISTS completion_feedback_pct INTEGER NOT NULL DEFAULT 75;

-- 2) Recompute = single authority for outcome_complete (attendance OR feedback OR referral).
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
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN
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

-- 3) LIVING GATE: recompute outcome_complete whenever induction feedback is written,
--    so the feedback path stays correct going forward (not just at backfill time).
--    Covers BOTH writers — own-login 'phone' AND 'volunteer_kiosk' proxy — and any
--    future writer, in ONE guarded place. Statement-level + transition table (cheap on
--    bulk kiosk saves); guarded to induction events (no-op elsewhere); monotonic
--    (grants completion, never revokes — a quarantine still goes through the admin recompute).
CREATE OR REPLACE FUNCTION public.fn_induction_completion_on_feedback()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  WITH aff AS (
    SELECT DISTINCT nt.event_id, nt.learner_id
    FROM new_feedback nt
    WHERE nt.learner_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.induction_programs ip WHERE ip.event_id = nt.event_id)
  ),
  calc AS (
    SELECT aff.event_id, aff.learner_id, ie.institution_id,
           ip.completion_attendance_pct AS thr, ip.completion_feedback_pct AS fbpct,
           count(DISTINCT s.id) AS total,
           count(DISTINCT s.id) FILTER (WHERE a.status IN ('present','od')) AS attended,
           count(DISTINCT s.id) FILTER (WHERE f.id IS NOT NULL) AS rated
    FROM aff
    JOIN public.induction_programs ip ON ip.event_id = aff.event_id
    JOIN public.induction_enrollment ie ON ie.event_id = aff.event_id AND ie.learner_id = aff.learner_id
    LEFT JOIN public.event_sessions s ON s.event_id = aff.event_id AND (s.batch_id IS NULL OR s.batch_id = ie.batch_id)
    LEFT JOIN public.event_session_attendance a ON a.session_id = s.id AND a.learner_id = aff.learner_id
    LEFT JOIN public.event_session_feedback f ON f.session_id = s.id AND f.learner_id = aff.learner_id
    GROUP BY aff.event_id, aff.learner_id, ie.institution_id, ip.completion_attendance_pct, ip.completion_feedback_pct
  )
  INSERT INTO public.induction_completion
    (event_id, learner_id, institution_id, outcome_complete, completed_at, updated_at)
  SELECT calc.event_id, calc.learner_id, calc.institution_id,
         ( (calc.total>0 AND 100.0*calc.attended/calc.total >= calc.thr)
           OR (calc.total>0 AND 100.0*calc.rated/calc.total >= calc.fbpct) ),
         CASE WHEN ( (calc.total>0 AND 100.0*calc.attended/calc.total >= calc.thr)
                     OR (calc.total>0 AND 100.0*calc.rated/calc.total >= calc.fbpct) )
              THEN now() ELSE NULL END,
         now()
  FROM calc
  ON CONFLICT (event_id, learner_id) DO UPDATE SET
    outcome_complete = induction_completion.outcome_complete OR EXCLUDED.outcome_complete,
    completed_at = CASE
      WHEN (induction_completion.outcome_complete OR EXCLUDED.outcome_complete)
        THEN COALESCE(induction_completion.completed_at, now())
      ELSE induction_completion.completed_at END,
    updated_at = now();
  RETURN NULL;
END $function$;

-- Two triggers (one per event): a transition-table trigger cannot span INSERT OR UPDATE.
-- Feedback writes as INSERT (new rating) and as ON CONFLICT UPDATE (re-rating) — both recompute.
DROP TRIGGER IF EXISTS trg_induction_completion_on_feedback     ON public.event_session_feedback;
DROP TRIGGER IF EXISTS trg_induction_completion_on_feedback_ins ON public.event_session_feedback;
DROP TRIGGER IF EXISTS trg_induction_completion_on_feedback_upd ON public.event_session_feedback;
CREATE TRIGGER trg_induction_completion_on_feedback_ins
  AFTER INSERT ON public.event_session_feedback
  REFERENCING NEW TABLE AS new_feedback
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_induction_completion_on_feedback();
CREATE TRIGGER trg_induction_completion_on_feedback_upd
  AFTER UPDATE ON public.event_session_feedback
  REFERENCING NEW TABLE AS new_feedback
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_induction_completion_on_feedback();
