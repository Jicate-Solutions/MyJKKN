-- =============================================================================
-- 2026-07-11 — PDE Agency Index distribution, scoped to a facilitator's OWN
--              students (Director decision: not same-institution).
--
-- The /pde/faculty/dashboard "Agency Index" chart was fed by a hook that
-- selected `score, measured_at` from `pde_agency_index` — neither column exists
-- (real cols: overall, level, assessment_date, created_at) — read the WHOLE
-- table with no scoping, and swallowed the error, rendering a silent all-zero
-- chart. And a `faculty`-role caller can't read pde_agency_index at all
-- (its RLS `agency_admin_read` is admin/super_admin/hod only), and that table
-- is empty anyway — the live agency now lives in pde_demonstrations (PR-A/B/C).
--
-- This RPC computes the distribution LIVE from pde_demonstrations, using the
-- same normalisation as lib/services/pde-agency-live-service.ts
-- (sum(weighted_score) / 500 * 100, clamped, 90-day window), bucketed into the
-- five agency modes the chart renders (dependent/guided/collaborative/
-- self_directed/principal, bands 20/40/60/80 — matching agency-distribution.tsx).
--
-- SCOPE = the caller's OWN taught students, resolved through the canonical
-- "who teaches this class" source: student_attendance.attendance_data[period]
-- .assigned_faculty (object OR array; faculty_id = staff.id) — the same blob
-- fn_live_poll_can_manage / the curriculum lesson RPCs authorise against. NOT
-- same-institution: pde_demonstrations_faculty_same_inst would expose every
-- learner in the institution to a facilitator who never taught them.
--
-- SECURITY: SECURITY DEFINER bypasses RLS, so the scope gate is duplicated
-- INSIDE the body (caller must be a staff member; only their taught sections'
-- learners are aggregated). anon is explicitly revoked.
--
-- PERF: everything is set-based and hoisted to arrays — NO per-row SECDEF call.
-- The attendance-blob scan is bounded to the caller's institution (8,243 rows
-- total; one institution is a small slice).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_pde_agency_distribution_for_facilitator()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_inst      uuid;
  v_staff     uuid;
  v_sections  uuid[];
  v_learners  uuid[];
  v_scored    int := 0;
  v_dist      jsonb;
  v_empty     constant jsonb := jsonb_build_object(
                 'dependent',0,'guided',0,'collaborative',0,'self_directed',0,'principal',0);
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('scope','own_students','total_scored',0,
      'distribution', v_empty, 'reason','unauthenticated');
  END IF;

  -- 1. Caller must be a staff member (facilitator). Duplicated gate — DEFINER
  --    bypasses RLS, so "who is asking" is established here, not by a policy.
  SELECT p.institution_id INTO v_inst FROM profiles p WHERE p.id = v_uid;
  SELECT s.id INTO v_staff FROM staff s WHERE s.profile_id = v_uid LIMIT 1;
  IF v_staff IS NULL THEN
    RETURN jsonb_build_object('scope','own_students','total_scored',0,
      'distribution', v_empty, 'reason','not_teaching_staff');
  END IF;

  -- 2. Sections this facilitator teaches, from the attendance blob. Normalise
  --    assigned_faculty's object-OR-array shape (~19% of periods are co-taught
  --    arrays); a bare `->>'faculty_id'` returns NULL on the array shape and
  --    would silently drop co-teachers. Bounded to the caller's institution.
  SELECT array_agg(DISTINCT sa.section_id) INTO v_sections
  FROM student_attendance sa
  CROSS JOIN LATERAL jsonb_each(
    CASE jsonb_typeof(sa.attendance_data) WHEN 'object' THEN sa.attendance_data ELSE '{}'::jsonb END
  ) AS periods(pid, pval)
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE jsonb_typeof(pval -> 'assigned_faculty')
      WHEN 'array'  THEN pval -> 'assigned_faculty'
      WHEN 'object' THEN jsonb_build_array(pval -> 'assigned_faculty')
      ELSE '[]'::jsonb END
  ) AS fac
  WHERE sa.section_id IS NOT NULL
    AND (v_inst IS NULL OR sa.institution_id = v_inst)
    AND fac ->> 'faculty_id' = v_staff::text;

  IF v_sections IS NULL OR array_length(v_sections, 1) IS NULL THEN
    RETURN jsonb_build_object('scope','own_students','total_scored',0,
      'distribution', v_empty, 'reason','no_taught_sections');
  END IF;

  -- 3. Learners (profiles.id) in those sections. pde_demonstrations.learner_id
  --    is profiles.id; the section link is learners_profiles.section_id, joined
  --    via profiles.learner_id → learners_profiles.id.
  SELECT array_agg(DISTINCT p.id) INTO v_learners
  FROM profiles p
  JOIN learners_profiles lp ON lp.id = p.learner_id
  WHERE lp.section_id = ANY(v_sections);

  IF v_learners IS NULL OR array_length(v_learners, 1) IS NULL THEN
    RETURN jsonb_build_object('scope','own_students','total_scored',0,
      'distribution', v_empty, 'reason','no_learners_in_sections');
  END IF;

  -- 4. Per-learner live agency from demonstrations, bucketed. Same math as
  --    pde-agency-live-service.recomputeFromDemonstrations (cap 500, 90d).
  WITH per_learner AS (
    SELECT d.learner_id,
           LEAST(100, GREATEST(0, round(sum(d.weighted_score) / 500.0 * 100)))::numeric AS idx
    FROM pde_demonstrations d
    WHERE d.learner_id = ANY(v_learners)
      AND d.weighted_score IS NOT NULL
      AND d.scored_at >= now() - interval '90 days'
    GROUP BY d.learner_id
  )
  SELECT count(*)::int,
         jsonb_build_object(
           'dependent',     count(*) FILTER (WHERE idx <= 20),
           'guided',        count(*) FILTER (WHERE idx > 20 AND idx <= 40),
           'collaborative', count(*) FILTER (WHERE idx > 40 AND idx <= 60),
           'self_directed', count(*) FILTER (WHERE idx > 60 AND idx <= 80),
           'principal',     count(*) FILTER (WHERE idx > 80)
         )
  INTO v_scored, v_dist
  FROM per_learner;

  RETURN jsonb_build_object(
    'scope','own_students',
    'total_scored', COALESCE(v_scored, 0),
    'distribution', COALESCE(v_dist, v_empty),
    'sections_taught', array_length(v_sections, 1),
    'reason', CASE WHEN COALESCE(v_scored,0) = 0 THEN 'no_scored_students' ELSE 'ok' END
  );
END;
$$;

-- Lock anon (Supabase default-grants EXECUTE to anon on every new function).
REVOKE EXECUTE ON FUNCTION public.fn_pde_agency_distribution_for_facilitator() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_pde_agency_distribution_for_facilitator() TO authenticated;

NOTIFY pgrst, 'reload schema';
