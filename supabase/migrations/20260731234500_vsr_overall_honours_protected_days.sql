-- =============================================================================
-- Verified Skills Record — the overall figure counts the same days the
-- per-course figures count
-- Created: 2026-07-31
--
-- WHY
-- ---
-- 20260731223500 taught fn_vsr_attendance_core to credit days an approved
-- tournament or on-duty permission excuses, and to report the credited count
-- back as a separate `protected` column. fn_vsr_record_core — the one builder
-- behind BOTH fn_vsr_my_record (the learner's own view) and fn_vsr_shared_record
-- (the link a learner hands an employer) — was not updated with it, which left
-- the record carrying two different attendance rules at once:
--
--   * every per-course `pct` came from fn_vsr_attendance_core and therefore
--     INCLUDED excused days, while
--   * `overall.pct` was rebuilt here as SUM(present) / SUM(total) and therefore
--     EXCLUDED them.
--
-- On a record with any protected day, the headline percentage disagreed with
-- the rows printed directly underneath it. That is the worst place in the
-- platform for an inconsistency: this document is read by someone outside the
-- college who cannot ask what the difference means.
--
-- WHAT THIS CHANGES
-- -----------------
-- Two things, both inside the attendance block of fn_vsr_record_core:
--   1. `overall.pct` now counts (SUM(present) + SUM(protected)) / SUM(total) —
--      identical arithmetic to the per-course pct, so the two can never
--      disagree again.
--   2. `protected` is carried out to the app layer, per course and overall, so
--      the record can SHOW the excused days instead of quietly folding them
--      into the numerator. A protected day stays explainable to whoever is
--      reading the record.
--
-- It does NOT change the eligibility thresholds, which live in
-- platform_policies and are not read here at all. It does NOT change which
-- days are protected — that stays the single answer in
-- fn_attendance_protected_days_core.
--
-- SECURITY — UNCHANGED, DELIBERATELY
-- ----------------------------------
-- fn_vsr_record_core stays an internal SECURITY DEFINER helper with no grants
-- (its two callers are themselves definers). The call it makes is still
-- fn_vsr_attendance_core(p_learner, v_inst), which still reaches the protected-
-- day lookup through the UNGRANTED, argument-scoped
-- fn_attendance_protected_days_core(uuid[], date, date, uuid) rather than the
-- authorizing wrapper. That split is what keeps the anon share link working:
-- fn_vsr_shared_record is granted to anon, so nothing on that path may depend
-- on auth.uid(), which is NULL all the way down a definer chain. Nothing in
-- this file touches that chain — only the JSONB assembled around it.
--
-- The body below is reproduced VERBATIM from the live definition on
-- 2026-07-31 (pg_get_functiondef, md5 248fa38c1847679f7c5be0f45dfcf73c) with
-- only the attendance block changed, so replacing it cannot silently revert
-- anything else.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_vsr_record_core(p_learner uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '15s'
AS $function$
DECLARE
  v_inst        uuid;
  v_learner_hdr jsonb;
  v_health      jsonb;
  v_attendance  jsonb;
  v_engagement  jsonb;
  v_prompt_window int;
  v_min_prompt    int;
BEGIN
  SELECT lp.institution_id,
         jsonb_build_object(
           'name', NULLIF(trim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,'')), ''),
           'register_number', lp.register_number,
           'roll_number', lp.roll_number,
           'program', pr.program_name,
           'institution', i.name,
           'institution_id', lp.institution_id
         )
    INTO v_inst, v_learner_hdr
  FROM public.learners_profiles lp
  LEFT JOIN public.programs pr ON pr.id = lp.program_id
  LEFT JOIN public.institutions i ON i.id = lp.institution_id
  WHERE lp.id = p_learner;

  IF v_inst IS NULL AND v_learner_hdr IS NULL THEN
    RETURN NULL; -- no such learner
  END IF;

  v_health := public.fn_vsr_health_core(v_inst);

  -- Attendance layer — rendered only when the college''s attendance data is
  -- healthy. Marked in-session by a Senior Learner; stamp follows health.
  --
  -- `protected` rides out alongside `present` at BOTH levels so the reader can
  -- see the credited days rather than infer them, and `overall.pct` sums the
  -- same two counts the per-course pct adds together. One rule per document.
  IF (v_health->'attendance'->>'healthy')::boolean THEN
    SELECT jsonb_build_object(
             'verified', true,
             'courses', coalesce(jsonb_agg(jsonb_build_object(
               'course_code', a.course_code,
               'course_name', a.course_name,
               'present', a.present,
               'protected', coalesce(a.protected, 0),
               'total', a.total,
               'pct', a.pct,
               'first_session', a.first_session,
               'last_session', a.last_session
             ) ORDER BY a.pct ASC NULLS LAST), '[]'::jsonb),
             'overall', jsonb_build_object(
               'present', coalesce(SUM(a.present), 0),
               'protected', coalesce(SUM(a.protected), 0),
               'total', coalesce(SUM(a.total), 0),
               'pct', ROUND(
                        100.0 * (coalesce(SUM(a.present), 0) + coalesce(SUM(a.protected), 0))
                        / NULLIF(SUM(a.total), 0), 1)
             )
           )
      INTO v_attendance
    FROM public.fn_vsr_attendance_core(p_learner, v_inst) a;
  ELSE
    v_attendance := NULL; -- section hidden, never a damning blank
  END IF;

  -- Engagement layer — counts + whole-record aggregates only.
  IF (v_health->'engagement'->>'healthy')::boolean THEN
    v_prompt_window := fn_get_policy_int('vsr.integrity.prompt_window_days', 1, v_inst);
    v_min_prompt    := fn_get_policy_int('vsr.integrity.min_prompt_checkins', 10, v_inst);

    SELECT jsonb_build_object(
             -- The stamp is EARNED by an established prompt-check-in habit
             -- (server-stamped within the window — cannot be faked after the
             -- fact). Catch-up backfills still COUNT; they just don''t earn
             -- the stamp. No stamp = absence, never accusation.
             'verified', (COUNT(*) FILTER (WHERE sf.created_at::date - sf.attendance_date <= v_prompt_window) >= v_min_prompt),
             'total_checkins', COUNT(*),
             'prompt_checkins', COUNT(*) FILTER (WHERE sf.created_at::date - sf.attendance_date <= v_prompt_window),
             'active_days', COUNT(DISTINCT sf.attendance_date),
             'courses_covered', COUNT(DISTINCT sf.course_id) FILTER (WHERE sf.course_id IS NOT NULL),
             'first_day', MIN(sf.attendance_date),
             'last_day', MAX(sf.attendance_date),
             'rating_levels_used', COUNT(DISTINCT sf.understood),
             'concerns_raised', COUNT(*) FILTER (WHERE sf.understood <= 2)
           )
      INTO v_engagement
    FROM public.session_feedback sf
    WHERE sf.student_id = p_learner;
  ELSE
    v_engagement := NULL;
  END IF;

  RETURN jsonb_build_object(
    'learner', v_learner_hdr,
    'generated_at', now(),
    'health', v_health,
    'attendance', v_attendance,
    'engagement', v_engagement,
    -- Durable-skills ratings are phase 2 (>=3 raters x >=2 activities floor);
    -- phase 1 renders a placeholder section only — never a faked score.
    'durable_skills', NULL,
    'self_claims', jsonb_build_object('label', 'Self-reported, not verified', 'items', '[]'::jsonb)
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_vsr_record_core(uuid) IS
  'Builds the Verified Skills Record JSONB for one learner. Internal: no grants — '
  'reached only through fn_vsr_my_record (self-scoped) and fn_vsr_shared_record '
  '(share token, anon-granted). Attendance counts approved on-duty/tournament days '
  'at BOTH the per-course and overall level, and reports the credited count as '
  '`protected` so it can be shown rather than folded into `present`.';

-- Re-asserted rather than assumed: CREATE OR REPLACE keeps the existing ACL,
-- but this function must never become callable directly, and stating it here
-- means the file is self-contained if it is ever replayed onto a fresh database.
REVOKE EXECUTE ON FUNCTION public.fn_vsr_record_core(uuid) FROM anon, authenticated, PUBLIC;
