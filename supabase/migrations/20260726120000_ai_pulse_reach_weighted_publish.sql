-- ============================================================================
-- 20260726120000_ai_pulse_reach_weighted_publish.sql
-- AI Pulse Leaderboard — reach-weighted PUBLISH points (documented follow-up)
-- ============================================================================
-- Implements the fast-follow noted at the tail of
-- 20260724120000_ai_pulse_leaderboard.sql:
--   "reach-weighted publish points — v1 gives a flat award per verified IG
--    publication ...; reach weighting can read ig_post_metrics later."
--
-- v1 awards a FLAT v_pts_publish per verified Instagram publication in a cycle.
-- This migration lets a verified publish's points SCALE WITH REACH, gated behind
-- a NEW dark config flag so today's behaviour is preserved exactly until a
-- Director flips it on.
--
-- HOW THE JOIN WORKS (verified against production, 2026-07-26):
--   The publication submit route (app/api/ai-pulse/submit/publication/route.ts)
--   verifies the learner's IG URL against ig_posts at submit time and stores the
--   CANONICAL ig_posts.permalink verbatim into event_submissions.proof_urls[].
--   ig_posts.permalink is UNIQUE (708/708 in prod). The metrics poller writes a
--   time series into ig_post_metrics (ig_post_metrics.post_id = ig_posts.id;
--   373k+ snapshot rows over 707 posts). So a verified publish joins to its reach
--   by an EXACT permalink match, taking the LATEST snapshot's reach.
--
-- SCORING MODEL (decision, documented):
--   * The flat base (v_pts_publish) is ALWAYS earned by a verified publish — reach
--     only ADDS a bonus, it never reduces the award (so a small-account learner is
--     never punished for publishing).
--   * bonus = FLOOR(latest_reach / leaderboard_publish_reach_per_point),
--     CAPPED at leaderboard_publish_reach_max_bonus. The cap is deliberate: the
--     max reach observed in prod is ~1.8M, so without a cap a single viral reel
--     would dwarf the whole board.
--   * publish points remain entirely in the PARTICIPATION lane (as in v1); the
--     participation/quality split and tie-break (higher quality wins) are
--     UNCHANGED, guaranteeing byte-identical output when the flag is OFF.
--
-- OFF-PATH GUARANTEE: when leaderboard_publish_reach_enabled is false, the reach
--   branch is not taken and per-learner publish points equal exactly
--   COUNT(verified publishes) * v_pts_publish — identical to v1.
--
-- SECURITY: fn_ai_pulse_scored_learners is CREATE OR REPLACE'd, so its anon lock
--   and grants are RE-ASSERTED below (Supabase default-grants anon EXECUTE on
--   every replaced function; the secdef-anon-revoke gate treats OR REPLACE as new).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. New point-config rows (Director-tunable; inserted only if absent).
--    DARK by default: leaderboard_publish_reach_enabled = false.
-- ---------------------------------------------------------------------------
INSERT INTO public.ai_pulse_policies (config_key, display_name, description, value_jsonb, data_type, is_active)
SELECT k, dn, descr, v::jsonb, dt, true
FROM (VALUES
    ('leaderboard_publish_reach_enabled',   'Reach-weighted publish',       'When ON, a verified Instagram publication earns a reach bonus on top of the flat publish award. DARK by default (false) — byte-identical to the flat award until flipped.', 'false', 'bool'),
    ('leaderboard_publish_reach_per_point',  'Reach per bonus point',        'Reach units required for one bonus point on a verified publish (e.g. 500 = +1 point per 500 people reached). Only used when reach-weighting is ON.',                    '500',   'int'),
    ('leaderboard_publish_reach_max_bonus',  'Max reach bonus per publish',  'Upper bound on the reach bonus a single verified publish can earn (caps viral outliers so one post cannot dominate the board). Only used when reach-weighting is ON.',       '60',    'int')
) AS t(k, dn, descr, v, dt)
WHERE NOT EXISTS (
    SELECT 1 FROM public.ai_pulse_policies p WHERE p.config_key = t.k
);

-- ---------------------------------------------------------------------------
-- 2. THE ENGINE (CREATE OR REPLACE): only the PUBLISH CTE changes; the
--    RETURNS TABLE signature is IDENTICAL to v1 so every board + the service
--    layer keep working unchanged.
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
    -- reach-weighted publish (DARK by default): flag + divisor + cap.
    v_reach_enabled boolean := COALESCE((SELECT (value_jsonb#>>'{}')::boolean FROM ai_pulse_policies WHERE config_key='leaderboard_publish_reach_enabled'   AND ai_pulse_policies.is_active LIMIT 1), false);
    v_reach_per_pt  numeric := COALESCE((SELECT (value_jsonb#>>'{}')::numeric FROM ai_pulse_policies WHERE config_key='leaderboard_publish_reach_per_point' AND ai_pulse_policies.is_active LIMIT 1), 500);
    v_reach_max     numeric := COALESCE((SELECT (value_jsonb#>>'{}')::numeric FROM ai_pulse_policies WHERE config_key='leaderboard_publish_reach_max_bonus' AND ai_pulse_policies.is_active LIMIT 1), 60);
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
    --   v1: flat COUNT(*) * v_pts_publish.
    --   Reach-weighted (only when v_reach_enabled): each verified publish earns
    --   v_pts_publish + LEAST(FLOOR(latest_reach / per_point), max_bonus). The IG
    --   permalink in proof_urls is the canonical ig_posts.permalink (stored verbatim
    --   by the submit route), so the reach lookup is an exact permalink match against
    --   the latest ig_post_metrics snapshot. Both laterals are LIMIT 1, so no row
    --   multiplication — with the flag OFF this is exactly COUNT(*) * v_pts_publish.
    pubs AS (
        SELECT p.learner_id,
               SUM(
                   CASE WHEN v_reach_enabled
                       THEN v_pts_publish
                            + LEAST(
                                FLOOR(COALESCE(pm.reach, 0)::numeric / GREATEST(v_reach_per_pt, 1)),
                                v_reach_max
                              )
                       ELSE v_pts_publish
                   END
               ) AS pts
        FROM event_submissions es
        JOIN scope s   ON s.cycle_id = es.event_id
        JOIN profiles p ON p.id = es.submitted_by
        -- the single verified IG permalink carried by this submission
        CROSS JOIN LATERAL (
            SELECT u AS permalink
            FROM unnest(es.proof_urls) u
            WHERE u ILIKE '%instagram.com%'
            LIMIT 1
        ) igu
        -- latest reach snapshot for the matched post (at most one row)
        LEFT JOIN LATERAL (
            SELECT m.reach
            FROM ig_posts ip
            JOIN ig_post_metrics m ON m.post_id = ip.id
            WHERE ip.permalink = igu.permalink
            ORDER BY m.snapshot_at DESC NULLS LAST
            LIMIT 1
        ) pm ON true
        WHERE p.learner_id IS NOT NULL
          AND es.proof_urls IS NOT NULL
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

-- Re-assert the anon lock + grants (CREATE OR REPLACE resets Supabase defaults).
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_scored_learners(uuid, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_scored_learners(uuid, boolean) TO authenticated, service_role;
