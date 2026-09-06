-- ============================================================================
-- 20260724120000_ai_pulse_leaderboard.sql
-- AI Pulse Leaderboard + Gamification  (F3 / F4 / B5)
-- ============================================================================
-- Turns the AI Pulse prompt-engineering loop into a leaderboard that rewards
-- participation + quality equally, drives broad department adoption, and shows
-- everyone where they stand. Design LOCKED via a 20-decision Director interview
-- (memory: project_aipulse_leaderboard_gamification).
--
-- SUBSTRATE — this migration builds ZERO new data tables. Every scoring axis
-- reads data that already exists in production:
--   * build   → ai_pulse_prompt_builds        (learner_id, grade jsonb {score,has_role,has_context,has_task,has_format}, disqualified)
--   * quiz    → ai_pulse_live_attendance       (profile_id, event_id, engagement_signals.quiz_score 0-100)
--   * starter → ai_pulse_domain_starter_events (profile_id, action='copy', starter_id → domain_starters.cycle_id)
--   * publish → event_submissions              (submitted_by, event_id, proof_urls[] containing an instagram.com link)
--   * dims    → learners_profiles              (department_id, institution_id, lifecycle_status='active')
-- The unifying entity is learners_profiles.id (lp), reached from the three
-- different foreign keys via the profiles.learner_id bridge:
--   auth.uid() = profiles.id ; profiles.learner_id = learners_profiles.id
--
-- SCORING (one engine, four boards derive from it, so the math can never
-- diverge between boards):
--   participation  = build_base + quiz_base + starter + publish   (doing it)
--   quality        = build_grade_bonus + quiz_relative_bonus      (doing it well)
--   total          = participation + quality  ; ties → higher quality wins
--   Only builds that pass the 4-part gate (role+context+task+format) and are
--   NOT champion-disqualified earn (decision #7 + #16). Quiz is scored RELATIVE
--   to that cycle's takers (percent_rank), so a hard week never punishes points.
--
-- All point values live in ai_pulse_policies config rows (Director-tunable, no
-- code change) per the config-table pattern.
--
-- SECURITY: every RPC here is SECURITY DEFINER and is explicitly locked with
-- REVOKE EXECUTE ... FROM anon, PUBLIC + GRANT EXECUTE ... TO authenticated,
-- because Supabase default-grants anon EXECUTE on every new function. The board
-- is intentionally PUBLIC to all *authenticated* learners (decision #6) — never
-- to anon.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Point-config rows (Director-tunable; inserted only if absent)
-- ---------------------------------------------------------------------------
INSERT INTO public.ai_pulse_policies (config_key, display_name, description, value_jsonb, data_type, is_active)
SELECT k, dn, descr, v::jsonb, dt, true
FROM (VALUES
    ('leaderboard_enabled',              'Leaderboard enabled',        'Master switch for the AI Pulse leaderboard surface (DARK by default; flip true to go live).', 'false', 'bool'),
    ('leaderboard_pts_publish',          'Points: publish',            'Points for a verified Instagram/GitHub publication in a cycle (worth the most).',            '30',    'int'),
    ('leaderboard_pts_build',            'Points: prompt build',       'Base points for a quality-gated graded prompt build (must pass the 4-part check).',           '10',    'int'),
    ('leaderboard_pts_quiz',             'Points: quiz',               'Base points for taking the post-session quiz.',                                               '10',    'int'),
    ('leaderboard_pts_starter',          'Points: starter use',        'Points for copying a weekly domain starter.',                                                 '5',     'int'),
    ('leaderboard_gold_score_threshold', 'Gold Prompt threshold',      'A build whose grade score reaches this earns the Gold Prompt badge.',                          '80',    'int'),
    ('leaderboard_quiz_ace_percentile',  'Quiz Ace percentile',        'A quiz score in this top percentile of the week''s takers earns Quiz Ace (0.9 = top 10%).',    '0.9',   'float'),
    ('leaderboard_min_dept_active',      'Dept privacy floor',         'A department needs at least this many ACTIVE students to appear on a department board.',        '3',     'int'),
    ('leaderboard_loyal_streak_weeks',   'Loyal Streak weeks',         'Consecutive active weeks required for the Loyal Streak badge.',                                 '3',     'int')
) AS t(k, dn, descr, v, dt)
WHERE NOT EXISTS (
    SELECT 1 FROM public.ai_pulse_policies p WHERE p.config_key = t.k
);

-- ---------------------------------------------------------------------------
-- 2. Champion "report -> lose points" substrate (decision #16)
--    Minimal, behaviour-preserving: nullable columns on the existing table.
--    A disqualified build earns ZERO leaderboard points.
-- ---------------------------------------------------------------------------
ALTER TABLE public.ai_pulse_prompt_builds
    ADD COLUMN IF NOT EXISTS disqualified_at     timestamptz,
    ADD COLUMN IF NOT EXISTS disqualified_by     uuid,
    ADD COLUMN IF NOT EXISTS disqualified_reason text;

COMMENT ON COLUMN public.ai_pulse_prompt_builds.disqualified_at IS
'AI Pulse leaderboard (decision #16): when a champion confirms a reported build is bad, it is disqualified and earns zero points. NULL = in good standing.';

-- ---------------------------------------------------------------------------
-- 3. Helper: the set of AI Pulse cycles (a "cycle" is a startup_events row that
--    AI Pulse actually used), ordered most-recent-first for streak logic.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_cycle_ids()
RETURNS TABLE(cycle_id uuid, start_date timestamptz, rn integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH ids AS (
        SELECT DISTINCT cycle_id AS id FROM ai_pulse_domain_starters   WHERE cycle_id IS NOT NULL
        UNION
        SELECT DISTINCT cycle_id            FROM ai_pulse_prompt_builds WHERE cycle_id IS NOT NULL
        UNION
        SELECT DISTINCT event_id            FROM ai_pulse_live_attendance WHERE event_id IS NOT NULL
    )
    SELECT se.id,
           se.start_date,
           ROW_NUMBER() OVER (ORDER BY se.start_date DESC NULLS LAST, se.id)::int
    FROM ids
    JOIN startup_events se ON se.id = ids.id;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_cycle_ids() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_cycle_ids() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. THE ENGINE: per-learner scored rows. Every board derives from this so the
--    score math is defined exactly once.
--      p_all_time = true  -> score across ALL cycles
--      p_all_time = false -> score a single cycle (p_cycle_id, or the latest)
--    Returns only learners who earned > 0 in scope. is_active reflects the
--    learner's current lifecycle_status (dept divisor uses the full active
--    population, computed separately in the dept board).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_scored_learners(
    p_cycle_id uuid DEFAULT NULL,
    p_all_time boolean DEFAULT true
)
RETURNS TABLE(
    learner_id        uuid,
    first_name        text,
    last_name         text,
    department_id     uuid,
    department_name   text,
    institution_id    uuid,
    institution_name  text,
    build_pts         numeric,
    quiz_pts          numeric,
    starter_pts       numeric,
    publish_pts       numeric,
    participation_pts numeric,
    quality_pts       numeric,
    total_pts         numeric,
    gold_prompts      integer,
    quiz_ace          boolean,
    streak_weeks      integer,
    badges            jsonb,
    is_active         boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_pts_build    numeric := COALESCE((SELECT (value_jsonb#>>'{}')::numeric FROM ai_pulse_policies WHERE config_key='leaderboard_pts_build'            AND ai_pulse_policies.is_active LIMIT 1), 10);
    v_pts_quiz     numeric := COALESCE((SELECT (value_jsonb#>>'{}')::numeric FROM ai_pulse_policies WHERE config_key='leaderboard_pts_quiz'             AND ai_pulse_policies.is_active LIMIT 1), 10);
    v_pts_starter  numeric := COALESCE((SELECT (value_jsonb#>>'{}')::numeric FROM ai_pulse_policies WHERE config_key='leaderboard_pts_starter'          AND ai_pulse_policies.is_active LIMIT 1), 5);
    v_pts_publish  numeric := COALESCE((SELECT (value_jsonb#>>'{}')::numeric FROM ai_pulse_policies WHERE config_key='leaderboard_pts_publish'          AND ai_pulse_policies.is_active LIMIT 1), 30);
    v_gold_thresh  numeric := COALESCE((SELECT (value_jsonb#>>'{}')::numeric FROM ai_pulse_policies WHERE config_key='leaderboard_gold_score_threshold' AND ai_pulse_policies.is_active LIMIT 1), 80);
    v_ace_pct      numeric := COALESCE((SELECT (value_jsonb#>>'{}')::numeric FROM ai_pulse_policies WHERE config_key='leaderboard_quiz_ace_percentile'  AND ai_pulse_policies.is_active LIMIT 1), 0.9);
    v_streak_min   integer := COALESCE((SELECT (value_jsonb#>>'{}')::int     FROM ai_pulse_policies WHERE config_key='leaderboard_loyal_streak_weeks'   AND ai_pulse_policies.is_active LIMIT 1), 3);
    v_latest       uuid;
BEGIN
    -- Resolve the single-cycle scope (latest cycle if none given).
    IF NOT p_all_time THEN
        v_latest := COALESCE(p_cycle_id, (SELECT c.cycle_id FROM fn_ai_pulse_cycle_ids() c WHERE c.rn = 1));
    END IF;

    RETURN QUERY
    WITH scope AS (
        SELECT c.cycle_id, c.rn
        FROM fn_ai_pulse_cycle_ids() c
        WHERE p_all_time OR c.cycle_id = v_latest
    ),
    -- BUILD: quality-gated, non-disqualified graded builds.
    builds AS (
        SELECT b.learner_id,
               COUNT(*)                                                        AS n,
               COUNT(*) * v_pts_build                                          AS base_pts,
               SUM(ROUND((b.grade->>'score')::numeric / 10.0))                 AS quality_pts,
               COUNT(*) FILTER (WHERE (b.grade->>'score')::numeric >= v_gold_thresh) AS gold_n
        FROM ai_pulse_prompt_builds b
        JOIN scope s ON s.cycle_id = b.cycle_id
        WHERE b.grade_status = 'graded'
          AND b.disqualified_at IS NULL
          AND COALESCE((b.grade->>'has_role')::boolean, false)
          AND COALESCE((b.grade->>'has_context')::boolean, false)
          AND COALESCE((b.grade->>'has_task')::boolean, false)
          AND COALESCE((b.grade->>'has_format')::boolean, false)
        GROUP BY b.learner_id
    ),
    -- QUIZ: base per taker + relative bonus (percent_rank within the cycle).
    quiz_rows AS (
        SELECT pr.learner_id,
               (PERCENT_RANK() OVER (PARTITION BY a.event_id
                                    ORDER BY (a.engagement_signals->>'quiz_score')::numeric))::numeric AS pctile
        FROM ai_pulse_live_attendance a
        JOIN scope s   ON s.cycle_id = a.event_id
        JOIN profiles pr ON pr.id = a.profile_id
        WHERE pr.learner_id IS NOT NULL
          AND a.engagement_signals ? 'quiz_score'
          AND (a.engagement_signals->>'quiz_score') ~ '^[0-9.]+$'
    ),
    quiz AS (
        SELECT q.learner_id,
               SUM(v_pts_quiz)                        AS base_pts,
               SUM(ROUND(v_pts_quiz * q.pctile))      AS quality_pts,
               bool_or(q.pctile >= v_ace_pct)         AS is_ace
        FROM quiz_rows q
        GROUP BY q.learner_id
    ),
    -- STARTER: 'copy' events, scoped to the cycle via the starter's cycle_id.
    starters AS (
        SELECT p.learner_id,
               COUNT(*) * v_pts_starter AS pts
        FROM ai_pulse_domain_starter_events ev
        JOIN ai_pulse_domain_starters ds ON ds.id = ev.starter_id
        JOIN scope s   ON s.cycle_id = ds.cycle_id
        JOIN profiles p ON p.id = ev.profile_id
        WHERE ev.action = 'copy' AND p.learner_id IS NOT NULL
        GROUP BY p.learner_id
    ),
    -- PUBLISH: event_submissions in scope with a verified Instagram proof link.
    pubs AS (
        SELECT p.learner_id,
               COUNT(*) * v_pts_publish AS pts
        FROM event_submissions es
        JOIN scope s   ON s.cycle_id = es.event_id
        JOIN profiles p ON p.id = es.submitted_by
        WHERE p.learner_id IS NOT NULL
          AND es.proof_urls IS NOT NULL
          AND EXISTS (SELECT 1 FROM unnest(es.proof_urls) u WHERE u ILIKE '%instagram.com%')
        GROUP BY p.learner_id
    ),
    -- STREAK: consecutive most-recent cycles (across ALL cycles, not just scope)
    -- in which the learner had ANY activity. streak = (first inactive rn) - 1,
    -- or the total cycle count when active in every cycle.
    all_activity AS (
        SELECT b.learner_id, b.cycle_id FROM ai_pulse_prompt_builds b WHERE b.learner_id IS NOT NULL
        UNION
        SELECT pr.learner_id, a.event_id FROM ai_pulse_live_attendance a JOIN profiles pr ON pr.id = a.profile_id WHERE pr.learner_id IS NOT NULL
        UNION
        SELECT p.learner_id, ds.cycle_id FROM ai_pulse_domain_starter_events ev JOIN ai_pulse_domain_starters ds ON ds.id = ev.starter_id JOIN profiles p ON p.id = ev.profile_id WHERE ev.action = 'copy' AND p.learner_id IS NOT NULL
        UNION
        SELECT p.learner_id, es.event_id FROM event_submissions es JOIN profiles p ON p.id = es.submitted_by WHERE p.learner_id IS NOT NULL
    ),
    oc AS (SELECT c.cycle_id, c.rn FROM fn_ai_pulse_cycle_ids() c),
    active_learners AS (SELECT DISTINCT aa.learner_id FROM all_activity aa),
    first_gap AS (
        SELECT al.learner_id, MIN(oc.rn) AS gap_rn
        FROM active_learners al
        CROSS JOIN oc
        LEFT JOIN all_activity aa ON aa.learner_id = al.learner_id AND aa.cycle_id = oc.cycle_id
        WHERE aa.cycle_id IS NULL
        GROUP BY al.learner_id
    ),
    streaks AS (
        SELECT al.learner_id,
               COALESCE(fg.gap_rn - 1, (SELECT COUNT(*) FROM oc))::int AS streak_weeks
        FROM active_learners al
        LEFT JOIN first_gap fg ON fg.learner_id = al.learner_id
    ),
    -- Everyone who earned anything in scope.
    earners AS (
        SELECT learner_id FROM builds
        UNION SELECT learner_id FROM quiz
        UNION SELECT learner_id FROM starters
        UNION SELECT learner_id FROM pubs
    )
    SELECT
        lp.id,
        lp.first_name::text,
        lp.last_name::text,
        lp.department_id,
        d.department_name::text,
        lp.institution_id,
        i.name::text,
        COALESCE(bl.base_pts, 0)                                              AS build_pts,
        COALESCE(qz.base_pts, 0) + COALESCE(qz.quality_pts, 0)                AS quiz_pts,
        COALESCE(st.pts, 0)                                                   AS starter_pts,
        COALESCE(pb.pts, 0)                                                   AS publish_pts,
        -- participation = the "doing" bases
        COALESCE(bl.base_pts,0) + COALESCE(qz.base_pts,0) + COALESCE(st.pts,0) + COALESCE(pb.pts,0) AS participation_pts,
        -- quality = the "doing well" bonuses
        COALESCE(bl.quality_pts,0) + COALESCE(qz.quality_pts,0)               AS quality_pts,
        -- total = participation + quality
        COALESCE(bl.base_pts,0) + COALESCE(qz.base_pts,0) + COALESCE(st.pts,0) + COALESCE(pb.pts,0)
            + COALESCE(bl.quality_pts,0) + COALESCE(qz.quality_pts,0)         AS total_pts,
        COALESCE(bl.gold_n, 0)::int                                          AS gold_prompts,
        COALESCE(qz.is_ace, false)                                           AS quiz_ace,
        COALESCE(sk.streak_weeks, 0)                                         AS streak_weeks,
        -- badges: earned-only jsonb array
        (
            CASE WHEN COALESCE(bl.n,0) >= 1        THEN jsonb_build_array('first_prompt') ELSE '[]'::jsonb END
         || CASE WHEN COALESCE(bl.gold_n,0) >= 1   THEN jsonb_build_array('gold_prompt')  ELSE '[]'::jsonb END
         || CASE WHEN COALESCE(qz.is_ace,false)    THEN jsonb_build_array('quiz_ace')     ELSE '[]'::jsonb END
         || CASE WHEN COALESCE(sk.streak_weeks,0) >= v_streak_min THEN jsonb_build_array('loyal_streak') ELSE '[]'::jsonb END
        )                                                                    AS badges,
        (lp.lifecycle_status = 'active')                                     AS is_active
    FROM earners e
    JOIN learners_profiles lp ON lp.id = e.learner_id
    LEFT JOIN builds   bl ON bl.learner_id = e.learner_id
    LEFT JOIN quiz     qz ON qz.learner_id = e.learner_id
    LEFT JOIN starters st ON st.learner_id = e.learner_id
    LEFT JOIN pubs     pb ON pb.learner_id = e.learner_id
    LEFT JOIN streaks  sk ON sk.learner_id = e.learner_id
    LEFT JOIN departments  d ON d.id = lp.department_id
    LEFT JOIN institutions i ON i.id = lp.institution_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_scored_learners(uuid, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_scored_learners(uuid, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5a. Individual board (weekly or all-time), fully public to authenticated.
--     Ties broken by higher quality (decision #11).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_leaderboard_individual(
    p_cycle_id uuid DEFAULT NULL,
    p_all_time boolean DEFAULT true,
    p_limit    integer DEFAULT 100
)
RETURNS TABLE(
    rank integer, learner_id uuid, learner_name text,
    department_name text, institution_name text,
    total_pts numeric, participation_pts numeric, quality_pts numeric,
    streak_weeks integer, badges jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        RANK() OVER (ORDER BY s.total_pts DESC, s.quality_pts DESC)::int,
        s.learner_id,
        btrim(COALESCE(s.first_name,'') || ' ' || COALESCE(s.last_name,'')),
        s.department_name,
        s.institution_name,
        s.total_pts, s.participation_pts, s.quality_pts,
        s.streak_weeks, s.badges
    FROM fn_ai_pulse_scored_learners(p_cycle_id, p_all_time) s
    WHERE s.is_active
    ORDER BY s.total_pts DESC, s.quality_pts DESC
    LIMIT GREATEST(p_limit, 1);
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_leaderboard_individual(uuid, boolean, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_leaderboard_individual(uuid, boolean, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5b. Department board — average points per ACTIVE student (decision #4/#15).
--     Non-participation drags a dept down -> drives broad adoption.
--     p_within_college + p_institution_id: rank a single college's depts.
--     otherwise: rank every department across all of JKKN.
--     Privacy floor: a dept needs >= leaderboard_min_dept_active students.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_leaderboard_dept(
    p_cycle_id       uuid DEFAULT NULL,
    p_all_time       boolean DEFAULT true,
    p_within_college boolean DEFAULT false,
    p_institution_id uuid DEFAULT NULL,
    p_limit          integer DEFAULT 100
)
RETURNS TABLE(
    rank integer, department_id uuid, department_name text,
    institution_id uuid, institution_name text,
    active_students integer, participating_students integer,
    total_pts numeric, avg_pts_per_active numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_min_active integer := COALESCE((SELECT (value_jsonb#>>'{}')::int FROM ai_pulse_policies WHERE config_key='leaderboard_min_dept_active' AND ai_pulse_policies.is_active LIMIT 1), 3);
BEGIN
    RETURN QUERY
    WITH scored AS (
        SELECT * FROM fn_ai_pulse_scored_learners(p_cycle_id, p_all_time) WHERE is_active
    ),
    -- Divisor = ALL active students in the dept (participating or not).
    active_pop AS (
        SELECT lp.department_id, lp.institution_id, COUNT(*)::int AS active_students
        FROM learners_profiles lp
        WHERE lp.lifecycle_status = 'active' AND lp.department_id IS NOT NULL
        GROUP BY lp.department_id, lp.institution_id
    ),
    earned AS (
        SELECT sc.department_id, sc.institution_id,
               SUM(sc.total_pts)::numeric AS total_pts,
               COUNT(*)::int             AS participating_students
        FROM scored sc
        WHERE sc.department_id IS NOT NULL
        GROUP BY sc.department_id, sc.institution_id
    ),
    joined AS (
        SELECT ap.department_id, d.department_name::text AS department_name, ap.institution_id, i.name::text AS institution_name,
               ap.active_students,
               COALESCE(e.participating_students, 0) AS participating_students,
               COALESCE(e.total_pts, 0)              AS total_pts,
               ROUND(COALESCE(e.total_pts,0) / NULLIF(ap.active_students,0), 2) AS avg_pts_per_active
        FROM active_pop ap
        LEFT JOIN earned e ON e.department_id = ap.department_id AND e.institution_id = ap.institution_id
        LEFT JOIN departments  d ON d.id = ap.department_id
        LEFT JOIN institutions i ON i.id = ap.institution_id
        WHERE ap.active_students >= v_min_active
          AND (NOT p_within_college OR p_institution_id IS NULL OR ap.institution_id = p_institution_id)
    )
    SELECT
        RANK() OVER (ORDER BY j.avg_pts_per_active DESC, j.total_pts DESC)::int,
        j.department_id, j.department_name, j.institution_id, j.institution_name,
        j.active_students, j.participating_students, j.total_pts, j.avg_pts_per_active
    FROM joined j
    ORDER BY j.avg_pts_per_active DESC, j.total_pts DESC
    LIMIT GREATEST(p_limit, 1);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_leaderboard_dept(uuid, boolean, boolean, uuid, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_leaderboard_dept(uuid, boolean, boolean, uuid, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5c. The caller's own leaderboard card: their rank + points + badges + streak.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_my_leaderboard(
    p_cycle_id uuid DEFAULT NULL,
    p_all_time boolean DEFAULT true
)
RETURNS TABLE(
    learner_id uuid, rank integer, total_learners integer,
    total_pts numeric, participation_pts numeric, quality_pts numeric,
    build_pts numeric, quiz_pts numeric, starter_pts numeric, publish_pts numeric,
    streak_weeks integer, badges jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE v_learner uuid;
BEGIN
    SELECT learner_id INTO v_learner FROM profiles WHERE id = auth.uid();
    IF v_learner IS NULL THEN RETURN; END IF;

    RETURN QUERY
    WITH ranked AS (
        SELECT s.*,
               RANK() OVER (ORDER BY s.total_pts DESC, s.quality_pts DESC)::int AS rnk,
               COUNT(*) OVER ()::int AS n
        FROM fn_ai_pulse_scored_learners(p_cycle_id, p_all_time) s
        WHERE s.is_active
    )
    SELECT r.learner_id, r.rnk, r.n,
           r.total_pts, r.participation_pts, r.quality_pts,
           r.build_pts, r.quiz_pts, r.starter_pts, r.publish_pts,
           r.streak_weeks, r.badges
    FROM ranked r
    WHERE r.learner_id = v_learner;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_my_leaderboard(uuid, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_my_leaderboard(uuid, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5d. Champion action: disqualify a reported build (decision #16).
--     Permission-gated: super admin OR the lab-scoring (champion) permission.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_disqualify_prompt_build(
    p_build_id uuid,
    p_reason   text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    IF NOT (is_super_admin() OR user_has_permission('aiPulse:lab.score')) THEN
        RAISE EXCEPTION 'Not allowed: only a champion can disqualify a build.' USING ERRCODE = '42501';
    END IF;

    UPDATE ai_pulse_prompt_builds
    SET disqualified_at     = now(),
        disqualified_by     = auth.uid(),
        disqualified_reason = left(nullif(btrim(coalesce(p_reason,'')),''), 500),
        updated_at          = now()
    WHERE id = p_build_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_disqualify_prompt_build(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_disqualify_prompt_build(uuid, text) TO authenticated, service_role;

-- ============================================================================
-- NOTE (fast-follows, intentionally NOT in this migration):
--   * staff/faculty board (decision #18) — staff have no learner_id so they earn
--     only quiz/starter; a lean profile-keyed board is a follow-up.
--   * learner-facing "report this build" button — the champion disqualify RPC
--     above is the enforcement half; the learner report UI reuses the existing
--     domain-starter report pattern (fn_ai_pulse_domain_starter_report).
--   * reach-weighted publish points — v1 gives a flat award per verified IG
--     publication (the IG URL is already server-verified against ig_posts at
--     submit time); reach weighting can read ig_post_metrics later.
-- ============================================================================
