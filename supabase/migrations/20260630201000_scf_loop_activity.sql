-- =============================================================================
-- 20260630201000_scf_loop_activity.sql
-- Post-Class Feedback (SCF) self-improving loop → LOOP ACTIVITY PANEL (#4).
-- Spec: specs/post-class-feedback-attendance-gate-2026-06-15.md (loop lane)
-- =============================================================================
-- WHAT THIS ANSWERS that no existing RPC does:
--   The admin dashboard shows the FEEDBACK picture (who responded, who taught,
--   understanding averages). It does NOT show the LOOP'S OWN vital signs — how much
--   raw signal came in, how many AI suggestions the loop produced, and whether those
--   suggestions actually moved understanding (the measured lift). fn_scf_loop_activity
--   returns that one-window snapshot so a super_admin / leadership can see, at a
--   glance, that the loop is alive and learning (or idling).
--
-- ONE WINDOW, TWO DATE KEYS (documented, deliberate):
--   * Feedback + live-pulse counts are keyed on attendance_date (the class date).
--   * Suggestion counts + measured-outcome counts are keyed on generated_at::date —
--     i.e. "suggestions the loop PRODUCED during this window, and of those, how many
--     have since been measured + their average lift". Keeping suggestions on one key
--     (generation) avoids conflating a generation event with a later measurement
--     event. Because measurement lags generation by >= 1 next session, a recent
--     window can legitimately show generated > measured — that gap is honest, not a
--     bug, and the card's empty/sparse states say so.
--
-- AVG LIFT IS IMPROVEMENT-ONLY (matches 20260630170000): a 'success' suggestion's
--   baseline already sits at the ceiling (>= 4.5), so its lift is ~<= 0 and would
--   drag the average into a false negative. Only kind='improvement' rows carry a
--   meaningful lift, so the average is taken over those alone.
--
-- LOW-UNDERSTANDING FLAG = a single learner response with understood <= 2 (the same
--   "flagged" threshold the learner's own receipt uses, MyImpactRow.flagged). This is
--   a per-RESPONSE flag count, distinct from the admin "low_sessions" (session avg < 3,
--   k>=3) — they answer different questions and are both intentionally surfaced.
--
-- ANONYMITY INVARIANT (inherited from the SCF substrate): returns ONLY aggregates +
--   AI-generated coaching summaries (which are advice ABOUT a course, already shown to
--   faculty by ai-suggestion-dialog). NEVER a per-student understood / checklist /
--   free_text. The recent-suggestions list carries the suggestion's own `summary`
--   (improvement) / `whatWorked` (success) text — not any learner's words.
--
-- SCOPE GATE: identical to fn_scf_admin_trend — super_admin sees ALL institutions;
--   institution leadership (administrator/institution_admin/dean/hod/principal/
--   coordinator) sees only their own institution_id; everyone else is rejected.
--   SECURITY DEFINER + STABLE, anon-locked.
--
-- RETURNS jsonb (a single snapshot object) rather than RETURNS TABLE: the payload is
--   one object with a nested `recent_suggestions` array, so a scalar jsonb return is
--   the clean contract (and sidesteps the RETURNS TABLE OUT-param mismatch traps).
-- ADDITIVE + SAFE: one new function. Touches no tables, no RLS, no existing RPC.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_scf_loop_activity(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst uuid; v_super boolean; v_allowed boolean;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_loop_activity: not authenticated'; END IF;
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (p.role = ANY (ARRAY['super_admin','administrator','institution_admin','dean','hod','principal','coordinator']) OR p.is_super_admin = true)
    INTO v_inst, v_super, v_allowed
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_loop_activity: not authorized';
  END IF;

  WITH fb AS (
    SELECT f.source, f.understood
    FROM public.session_feedback f
    WHERE (v_super OR f.institution_id = v_inst)
      AND f.attendance_date BETWEEN p_from AND p_to
  ),
  fb_agg AS (
    SELECT
      count(*)::bigint                                       AS total_feedback,
      count(*) FILTER (WHERE source = 'async')::bigint       AS async_feedback,
      count(*) FILTER (WHERE source = 'live_poll')::bigint   AS live_poll_feedback,
      count(*) FILTER (WHERE understood <= 2)::bigint        AS low_understanding_flags
    FROM fb
  ),
  pulse_agg AS (
    SELECT count(*)::bigint AS live_pulses
    FROM public.scf_live_pulse lp
    WHERE (v_super OR lp.institution_id = v_inst)
      AND lp.attendance_date BETWEEN p_from AND p_to
  ),
  sug AS (
    SELECT s.id, s.kind, s.course_code, s.suggestion, s.outcome_lift, s.outcome_responses, s.generated_at
    FROM public.scf_ai_suggestions s
    WHERE (v_super OR s.institution_id = v_inst)
      AND s.domain = 'session_feedback'
      AND (s.generated_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN p_from AND p_to  -- IST local date, matches attendance keys
  ),
  sug_agg AS (
    SELECT
      count(*) FILTER (WHERE kind = 'improvement')::bigint                                  AS improvement_suggestions,
      count(*) FILTER (WHERE kind = 'success')::bigint                                      AS success_suggestions,
      count(*) FILTER (WHERE kind = 'improvement' AND outcome_lift IS NOT NULL)::bigint     AS measured_outcomes,
      round(avg(outcome_lift) FILTER (WHERE kind = 'improvement' AND outcome_lift IS NOT NULL), 2) AS avg_outcome_lift
    FROM sug
  ),
  recent AS (
    SELECT COALESCE(jsonb_agg(item ORDER BY gen_at DESC), '[]'::jsonb) AS items
    FROM (
      SELECT s.generated_at AS gen_at,
             jsonb_build_object(
               'id', s.id,
               'course_code', s.course_code,
               'kind', s.kind,
               -- improvement rows store `summary`; success rows store `whatWorked`.
               'summary', left(COALESCE(s.suggestion->>'summary', s.suggestion->>'whatWorked', ''), 240),
               'outcome_lift', s.outcome_lift,
               'outcome_responses', s.outcome_responses,
               'generated_at', s.generated_at
             ) AS item
      FROM sug s
      ORDER BY s.generated_at DESC
      LIMIT 8
    ) t
  )
  SELECT jsonb_build_object(
    'window_from',            p_from,
    'window_to',              p_to,
    'total_feedback',         fb_agg.total_feedback,
    'async_feedback',         fb_agg.async_feedback,
    'live_poll_feedback',     fb_agg.live_poll_feedback,
    'live_pulses',            pulse_agg.live_pulses,
    'low_understanding_flags', fb_agg.low_understanding_flags,
    'improvement_suggestions', sug_agg.improvement_suggestions,
    'success_suggestions',    sug_agg.success_suggestions,
    'measured_outcomes',      sug_agg.measured_outcomes,
    'avg_outcome_lift',       sug_agg.avg_outcome_lift,
    'recent_suggestions',     recent.items
  )
  INTO v_result
  FROM fb_agg, pulse_agg, sug_agg, recent;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.fn_scf_loop_activity(date,date) IS
  'SCF loop activity panel: one-window snapshot of the self-improving loop''s vital '
  'signs — feedback by source (async/live_poll), live-pulse count, low-understanding '
  'flag count (understood<=2), AI suggestion counts by kind (improvement/success), '
  'measured-outcome count + avg lift (improvement rows only), and the 8 most recent '
  'suggestions (course, kind, one-line summary, lift). Feedback/pulse keyed on '
  'attendance_date; suggestions on generated_at. Aggregates + AI coaching text only, '
  'never per-student content. super_admin sees all; institution leadership sees own '
  'institution. Returns a single jsonb object. STABLE, SECURITY DEFINER, anon-locked.';

-- MANDATORY anon lock (CLAUDE.md: Supabase grants anon EXECUTE on new functions by default).
REVOKE EXECUTE ON FUNCTION public.fn_scf_loop_activity(date,date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_loop_activity(date,date) TO authenticated;

-- PostgREST must see the new function immediately.
NOTIFY pgrst, 'reload schema';
