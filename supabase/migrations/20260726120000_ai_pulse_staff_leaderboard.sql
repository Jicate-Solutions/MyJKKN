-- ============================================================================
-- 20260726120000_ai_pulse_staff_leaderboard.sql
-- AI Pulse Staff / Faculty Leaderboard  (decision #18)
-- ============================================================================
-- A SEPARATE, profile-keyed leaderboard for staff / faculty / champions — NOT
-- rows on the learner board. Decision #18 (Director interview):
--   "Staff/faculty/champions = SEPARATE staff board (NOT on the student board;
--    students-only main board + a parallel staff board so keen faculty can join
--    without outranking students)."
--
-- WHY A SEPARATE ENGINE: the learner engine `fn_ai_pulse_scored_learners`
-- (migration 20260724120000) is keyed on learners_profiles.id, reached via
-- profiles.learner_id. Staff / faculty have NO learners_profiles row
-- (profiles.learner_id IS NULL), so that engine can never score them. This adds
-- a parallel engine keyed on profiles.id.
--
-- SUBSTRATE — builds ZERO new data tables. A 60-second prod survey (2026-07-26)
-- found exactly TWO real AI Pulse signals for staff profiles (learner_id IS NULL,
-- role <> 'student'):
--   * attend → ai_pulse_live_attendance (profile_id, joined_at)        244 rows / 159 staff
--   * quiz   → ai_pulse_live_attendance (profile_id, engagement_signals.quiz_score 0-100)
--                                                                       173 rows / 113 staff
-- The other learner axes DO NOT exist for staff and are therefore NOT scored:
--   * build   → ai_pulse_prompt_builds is learner_id-only (no profile_id)  → 0 staff
--   * starter → ai_pulse_domain_starter_events copies by staff            → 0 staff
--   * publish → event_submissions with IG proof by staff                  → 0 staff
-- This is the smallest HONEST version. The open design question (weight of
-- "showing up" vs "doing the quiz well", and whether champions/facilitators
-- should earn a facilitation signal that does not yet exist as data) is left to
-- the Director — see the leaderboard tab copy + PR body.
--
-- SCORING (mirrors the learner engine so the two boards feel like one system):
--   participation  = attend_base + quiz_base            (doing it)
--   quality        = quiz_relative_bonus                (doing it well)
--   total          = participation + quality ; ties -> higher quality wins
--   Quiz is scored RELATIVE to that session's takers via percent_rank over ALL
--   takers of the event (staff + learners), so "quality" means exactly the same
--   thing on both boards and a hard week never punishes points (decision #9).
--
-- All point values live in ai_pulse_policies config rows (Director-tunable, no
-- code change) per the config-table pattern. The board is DARK by default:
-- gated behind `leaderboard_staff_board_enabled` (false).
--
-- SECURITY: every RPC is SECURITY DEFINER and explicitly locked with
-- REVOKE EXECUTE ... FROM anon, PUBLIC + GRANT ... TO authenticated, because
-- Supabase default-grants anon EXECUTE on every new function. The board is
-- PUBLIC to all *authenticated* users (matching the learner board) — never anon.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Point-config rows (Director-tunable; inserted only if absent so re-apply
--    is idempotent and never resurrects a value the Director has tuned).
--    Reuses the shared `leaderboard_quiz_ace_percentile` and
--    `leaderboard_loyal_streak_weeks` rows from the learner migration.
-- ---------------------------------------------------------------------------
INSERT INTO public.ai_pulse_policies (config_key, display_name, description, value_jsonb, data_type, is_active)
SELECT k, dn, descr, v::jsonb, dt, true
FROM (VALUES
    ('leaderboard_staff_board_enabled', 'Staff leaderboard enabled', 'Master switch for the SEPARATE AI Pulse staff/faculty leaderboard tab (DARK by default; flip true to go live). Independent of the learner board switch.', 'false', 'bool'),
    ('leaderboard_staff_pts_attend',    'Staff points: attend',      'Points a staff member earns for attending a live AI Pulse session (joined_at present).',                                                              '5',     'int'),
    ('leaderboard_staff_pts_quiz',      'Staff points: quiz',        'Base points a staff member earns for taking a post-session quiz (plus a relative-quality bonus).',                                                    '10',    'int')
) AS t(k, dn, descr, v, dt)
WHERE NOT EXISTS (
    SELECT 1 FROM public.ai_pulse_policies p WHERE p.config_key = t.k
);

-- ---------------------------------------------------------------------------
-- 2. THE STAFF ENGINE: per-staff scored rows, keyed on profiles.id. Every staff
--    board derives from this so the score math is defined exactly once.
--      p_all_time = true  -> score across ALL cycles
--      p_all_time = false -> score a single cycle (p_cycle_id, or the latest)
--    "staff" = a profile with NO learners_profiles link (learner_id IS NULL)
--    and role <> 'student' (excludes the ~269 unlinked/anomalous student
--    profiles so the staff board stays a genuine staff/faculty board).
--    Returns only staff who earned > 0 in scope.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_scored_staff(
    p_cycle_id uuid DEFAULT NULL,
    p_all_time boolean DEFAULT true
)
RETURNS TABLE(
    profile_id        uuid,
    full_name         text,
    role              text,
    department_id     uuid,
    department_name   text,
    institution_id    uuid,
    institution_name  text,
    attend_pts        numeric,
    quiz_pts          numeric,
    participation_pts numeric,
    quality_pts       numeric,
    total_pts         numeric,
    sessions_attended integer,
    quizzes_taken     integer,
    quiz_ace          boolean,
    streak_weeks      integer,
    badges            jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_pts_attend numeric := COALESCE((SELECT (value_jsonb#>>'{}')::numeric FROM ai_pulse_policies WHERE config_key='leaderboard_staff_pts_attend'   AND ai_pulse_policies.is_active LIMIT 1), 5);
    v_pts_quiz   numeric := COALESCE((SELECT (value_jsonb#>>'{}')::numeric FROM ai_pulse_policies WHERE config_key='leaderboard_staff_pts_quiz'     AND ai_pulse_policies.is_active LIMIT 1), 10);
    v_ace_pct    numeric := COALESCE((SELECT (value_jsonb#>>'{}')::numeric FROM ai_pulse_policies WHERE config_key='leaderboard_quiz_ace_percentile' AND ai_pulse_policies.is_active LIMIT 1), 0.9);
    v_streak_min integer := COALESCE((SELECT (value_jsonb#>>'{}')::int     FROM ai_pulse_policies WHERE config_key='leaderboard_loyal_streak_weeks'  AND ai_pulse_policies.is_active LIMIT 1), 3);
    v_latest     uuid;
BEGIN
    IF NOT p_all_time THEN
        v_latest := COALESCE(p_cycle_id, (SELECT c.cycle_id FROM fn_ai_pulse_cycle_ids() c WHERE c.rn = 1));
    END IF;

    RETURN QUERY
    WITH scope AS (
        SELECT c.cycle_id, c.rn
        FROM fn_ai_pulse_cycle_ids() c
        WHERE p_all_time OR c.cycle_id = v_latest
    ),
    staff AS (
        SELECT p.id, p.full_name, p.role, p.department_id, p.institution_id
        FROM profiles p
        WHERE p.learner_id IS NULL
          AND COALESCE(p.role, '') <> 'student'
    ),
    -- ATTEND: distinct live sessions in scope the staff actually joined.
    attend AS (
        SELECT a.profile_id,
               COUNT(DISTINCT a.event_id)                AS n,
               COUNT(DISTINCT a.event_id) * v_pts_attend AS pts
        FROM ai_pulse_live_attendance a
        JOIN scope s  ON s.cycle_id = a.event_id
        JOIN staff st ON st.id = a.profile_id
        WHERE a.joined_at IS NOT NULL
        GROUP BY a.profile_id
    ),
    -- QUIZ: percentile computed over ALL takers of the event (staff + learners),
    -- then restricted to staff — identical quality semantics to the learner board.
    quiz_rows AS (
        SELECT a.profile_id,
               (PERCENT_RANK() OVER (PARTITION BY a.event_id
                                    ORDER BY (a.engagement_signals->>'quiz_score')::numeric))::numeric AS pctile
        FROM ai_pulse_live_attendance a
        JOIN scope s ON s.cycle_id = a.event_id
        WHERE a.engagement_signals ? 'quiz_score'
          AND (a.engagement_signals->>'quiz_score') ~ '^[0-9.]+$'
    ),
    quiz AS (
        SELECT q.profile_id,
               COUNT(*)                          AS n,
               SUM(v_pts_quiz)                    AS base_pts,
               SUM(ROUND(v_pts_quiz * q.pctile))  AS quality_pts,
               bool_or(q.pctile >= v_ace_pct)     AS is_ace
        FROM quiz_rows q
        JOIN staff st ON st.id = q.profile_id
        GROUP BY q.profile_id
    ),
    -- STREAK: consecutive most-recent cycles (across ALL cycles) in which the
    -- staff had ANY activity (attended OR took a quiz). Mirrors learner streak.
    all_activity AS (
        SELECT a.profile_id AS pid, a.event_id AS cid
        FROM ai_pulse_live_attendance a
        JOIN staff st ON st.id = a.profile_id
        WHERE a.joined_at IS NOT NULL
           OR (a.engagement_signals ? 'quiz_score'
               AND (a.engagement_signals->>'quiz_score') ~ '^[0-9.]+$')
    ),
    oc AS (SELECT c.cycle_id, c.rn FROM fn_ai_pulse_cycle_ids() c),
    active_staff AS (SELECT DISTINCT aa.pid FROM all_activity aa),
    first_gap AS (
        SELECT al.pid, MIN(oc.rn) AS gap_rn
        FROM active_staff al
        CROSS JOIN oc
        LEFT JOIN all_activity aa ON aa.pid = al.pid AND aa.cid = oc.cycle_id
        WHERE aa.cid IS NULL
        GROUP BY al.pid
    ),
    streaks AS (
        SELECT al.pid,
               COALESCE(fg.gap_rn - 1, (SELECT COUNT(*) FROM oc))::int AS streak_weeks
        FROM active_staff al
        LEFT JOIN first_gap fg ON fg.pid = al.pid
    ),
    earners AS (
        SELECT profile_id AS pid FROM attend
        UNION SELECT profile_id FROM quiz
    )
    SELECT
        st.id,
        st.full_name::text,
        st.role::text,
        st.department_id,
        d.department_name::text,
        st.institution_id,
        i.name::text,
        COALESCE(at.pts, 0)                                                   AS attend_pts,
        COALESCE(qz.base_pts, 0) + COALESCE(qz.quality_pts, 0)                AS quiz_pts,
        -- participation = the "doing" bases
        COALESCE(at.pts, 0) + COALESCE(qz.base_pts, 0)                        AS participation_pts,
        -- quality = the "doing well" bonus
        COALESCE(qz.quality_pts, 0)                                           AS quality_pts,
        -- total = participation + quality
        COALESCE(at.pts, 0) + COALESCE(qz.base_pts, 0) + COALESCE(qz.quality_pts, 0) AS total_pts,
        COALESCE(at.n, 0)::int                                               AS sessions_attended,
        COALESCE(qz.n, 0)::int                                               AS quizzes_taken,
        COALESCE(qz.is_ace, false)                                           AS quiz_ace,
        COALESCE(sk.streak_weeks, 0)                                         AS streak_weeks,
        (
            CASE WHEN COALESCE(qz.n,0) >= 1        THEN jsonb_build_array('first_quiz')   ELSE '[]'::jsonb END
         || CASE WHEN COALESCE(qz.is_ace,false)    THEN jsonb_build_array('quiz_ace')     ELSE '[]'::jsonb END
         || CASE WHEN COALESCE(sk.streak_weeks,0) >= v_streak_min THEN jsonb_build_array('loyal_streak') ELSE '[]'::jsonb END
        )                                                                    AS badges
    FROM earners e
    JOIN staff st ON st.id = e.pid
    LEFT JOIN attend   at ON at.profile_id = e.pid
    LEFT JOIN quiz     qz ON qz.profile_id = e.pid
    LEFT JOIN streaks  sk ON sk.pid = e.pid
    LEFT JOIN departments  d ON d.id = st.department_id
    LEFT JOIN institutions i ON i.id = st.institution_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_scored_staff(uuid, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_scored_staff(uuid, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Staff individual board (weekly or all-time), public to authenticated.
--    Ties broken by higher quality (decision #11).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_leaderboard_staff(
    p_cycle_id uuid DEFAULT NULL,
    p_all_time boolean DEFAULT true,
    p_limit    integer DEFAULT 100
)
RETURNS TABLE(
    rank integer, profile_id uuid, staff_name text, role text,
    department_name text, institution_name text,
    total_pts numeric, participation_pts numeric, quality_pts numeric,
    sessions_attended integer, quizzes_taken integer,
    streak_weeks integer, badges jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        RANK() OVER (ORDER BY s.total_pts DESC, s.quality_pts DESC)::int,
        s.profile_id,
        COALESCE(NULLIF(btrim(s.full_name), ''), 'Staff'),
        s.role,
        s.department_name,
        s.institution_name,
        s.total_pts, s.participation_pts, s.quality_pts,
        s.sessions_attended, s.quizzes_taken,
        s.streak_weeks, s.badges
    FROM fn_ai_pulse_scored_staff(p_cycle_id, p_all_time) s
    ORDER BY s.total_pts DESC, s.quality_pts DESC
    LIMIT GREATEST(p_limit, 1);
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_leaderboard_staff(uuid, boolean, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_leaderboard_staff(uuid, boolean, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. The caller's own staff card: their rank + points + badges + streak.
--    Keyed on auth.uid() = profiles.id. Learners (learner_id set) get no row.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_my_staff_leaderboard(
    p_cycle_id uuid DEFAULT NULL,
    p_all_time boolean DEFAULT true
)
RETURNS TABLE(
    profile_id uuid, rank integer, total_staff integer,
    total_pts numeric, participation_pts numeric, quality_pts numeric,
    attend_pts numeric, quiz_pts numeric,
    sessions_attended integer, quizzes_taken integer,
    streak_weeks integer, badges jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE v_pid uuid := auth.uid();
BEGIN
    IF v_pid IS NULL THEN RETURN; END IF;

    RETURN QUERY
    WITH ranked AS (
        SELECT s.*,
               RANK() OVER (ORDER BY s.total_pts DESC, s.quality_pts DESC)::int AS rnk,
               COUNT(*) OVER ()::int AS n
        FROM fn_ai_pulse_scored_staff(p_cycle_id, p_all_time) s
    )
    SELECT r.profile_id, r.rnk, r.n,
           r.total_pts, r.participation_pts, r.quality_pts,
           r.attend_pts, r.quiz_pts,
           r.sessions_attended, r.quizzes_taken,
           r.streak_weeks, r.badges
    FROM ranked r
    WHERE r.profile_id = v_pid;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_my_staff_leaderboard(uuid, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_my_staff_leaderboard(uuid, boolean) TO authenticated, service_role;
