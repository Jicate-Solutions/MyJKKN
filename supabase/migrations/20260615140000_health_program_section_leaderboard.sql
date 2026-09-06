-- ============================================================================
-- Migration: 20260615140000_health_program_section_leaderboard
-- Health — Wellness Programs: COMPETITIVE section-level completion leaderboard
-- Spec driver: Director chose competitive + section-level. Guardrails required
--              because this runs in a mental-health / wellness context.
-- Depends on:  20260615120000_health_wellness_programs_substrate.sql
--              (health_program_participation, health_program_days, health_programs,
--               platform_policies, fn_get_policy_int / fn_get_policy_text)
-- ============================================================================
-- PRIVACY GUARDRAILS (baked into the RPC — non-negotiable):
--   • Ranks SECTIONS, never individuals. Returns NO student names.
--   • Never exposes who did NOT participate (only aggregate counts per section).
--   • Min section size: sections with fewer than N members are hidden entirely,
--     so a tiny section can never be de-anonymised by inference. N is the
--     director-editable policy `health.programs.leaderboard_min_section_size`.
--
-- TIER: additive (one new policy row + one new fn). Idempotent. Safe to re-apply.
-- DO NOT apply to prod from here — ships via PR, applied separately.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. POLICY ROW — minimum section size for the leaderboard (privacy floor).
--    Director-editable; read at runtime via fn_get_policy_int. Same director's-
--    view metadata shape as the other health.programs.* policies.
-- ----------------------------------------------------------------------------
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, enum_options,
   is_system, is_active, ui_widget, ui_options, ui_consequence, ui_cascade, ui_category)
VALUES
  ('health.programs.leaderboard_min_section_size', 'global', NULL, '10'::jsonb,
   'Smallest section size that may appear on the competitive section leaderboard.',
   'number', NULL, true, true,
   'number', NULL,
   'The minimum number of participating members a section must have before it appears on the leaderboard. Sections smaller than this are hidden so no individual can be identified from a tiny section''s result.',
   '[{"effect":"Which sections are shown on the section leaderboard","severity":"medium"},{"effect":"Privacy floor — raising it hides more small sections, lowering it could let a small section be de-anonymised","severity":"high"}]'::jsonb,
   'Wellness Programs')
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. fn_health_program_section_leaderboard — competitive, privacy-guarded.
--    SECURITY DEFINER (bypasses RLS to aggregate across all participants) +
--    internal permission gate. Reads the completion rule + quiz pass % + the
--    min-section-size floor from platform_policies at runtime.
--
--    Completion metric per section (justified):
--      completion_pct = (members who completed ALL published days of the program
--                        under the current completion rule)
--                       / (section members who participated in the program at all)
--                       * 100
--    Rationale: "participated at all" is the honest denominator for a competitive
--    board — a section is rewarded for how many of its *engaged* members finished
--    the whole week, not penalised for members who never opened the program (we
--    deliberately do NOT divide by section roster size, which would expose
--    non-participation and punish sections for absentees). This mirrors the
--    `completed_all` engagement metric in fn_health_program_impact.
--
--    "Completed all days" uses days_total = number of published days for the
--    program (publish_date <= today, or NULL publish_date), so the board is fair
--    mid-week: it ranks on the days that have actually been released.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_health_program_section_leaderboard(p_program_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rule          TEXT := fn_get_policy_text('health.programs.completion_rule', 'watch');
  v_pass_pct      INT  := fn_get_policy_int('health.programs.quiz_pass_pct', 60);
  v_min_size      INT  := fn_get_policy_int('health.programs.leaderboard_min_section_size', 10);
  v_days_total    INT;
  v_your_section  UUID;
  v_sections      JSONB;
BEGIN
  -- Permission gate (SECURITY DEFINER bypasses RLS, so check explicitly).
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('health.programs.view')) THEN
    RAISE EXCEPTION 'not authorized to view the section leaderboard';
  END IF;

  -- Published days only → fair ranking mid-week.
  SELECT count(*)::int INTO v_days_total
    FROM health_program_days d
    WHERE d.program_id = p_program_id
      AND (d.publish_date IS NULL OR d.publish_date <= current_date);

  -- The caller's own section (for client-side "your section" highlight).
  -- Derived from THEIR learner profile only — never reveals anyone else's.
  SELECT lp.section_id INTO v_your_section
    FROM profiles pr
    JOIN learners_profiles lp ON lp.id = pr.learner_id
    WHERE pr.id = auth.uid()
    LIMIT 1;

  WITH
  -- One row per (section member, program): did they complete every published day?
  member_completion AS (
    SELECT
      lp.section_id,
      pp.user_id,
      count(*) FILTER (
        WHERE pp.watch_completed
          AND (v_rule = 'watch'
               OR (v_rule = 'watch_and_quiz'
                   AND pp.quiz_score IS NOT NULL
                   AND pp.quiz_score >= v_pass_pct))
      ) AS days_done
    FROM health_program_participation pp
    JOIN learners_profiles lp ON lp.id = pp.learner_id
    WHERE pp.program_id = p_program_id
      AND pp.learner_id IS NOT NULL          -- section ranking is student-scoped
      AND lp.section_id IS NOT NULL
    GROUP BY lp.section_id, pp.user_id
  ),
  per_section AS (
    SELECT
      mc.section_id,
      count(*) AS members,                                    -- participating members
      count(*) FILTER (WHERE v_days_total > 0
                         AND mc.days_done >= v_days_total) AS completed_all
    FROM member_completion mc
    GROUP BY mc.section_id
    HAVING count(*) >= v_min_size                             -- PRIVACY FLOOR
  ),
  ranked AS (
    SELECT
      ps.section_id,
      s.section_name,
      ps.members,
      CASE WHEN ps.members > 0
           THEN round(100.0 * ps.completed_all / ps.members, 1)
           ELSE 0 END AS completion_pct
    FROM per_section ps
    JOIN sections s ON s.id = ps.section_id
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'section_id',     r.section_id,
        'section_label',  r.section_name,
        'members',        r.members,
        'completion_pct', r.completion_pct,
        'rank',           r.rnk
      )
      ORDER BY r.rnk
    ), '[]'::jsonb)
  INTO v_sections
  FROM (
    SELECT
      ranked.*,
      dense_rank() OVER (ORDER BY completion_pct DESC) AS rnk
    FROM ranked
  ) r;

  RETURN jsonb_build_object(
    'program_id',       p_program_id,
    'min_section_size', v_min_size,
    'days_total',       v_days_total,
    'completion_rule',  v_rule,
    'your_section_id',  v_your_section,   -- so the page can highlight, no names
    'sections',         v_sections
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_health_program_section_leaderboard(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_health_program_section_leaderboard(UUID) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. Reload PostgREST schema cache so the new RPC is visible to REST.
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
