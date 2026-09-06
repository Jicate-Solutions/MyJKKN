-- ============================================================================
-- 20260727120000_ai_pulse_staff_facilitation_signal.sql
-- AI Pulse Staff Leaderboard — FACILITATION signal (PR #2424 open question)
-- ============================================================================
-- PR #2424 (fn_ai_pulse_scored_staff, flag leaderboard_staff_board_enabled)
-- shipped the SEPARATE staff/faculty leaderboard scoring only two signals:
--   attend  → ai_pulse_live_attendance.joined_at
--   quiz    → ai_pulse_live_attendance.engagement_signals.quiz_score
-- Its author flagged an honest gap:
--   "There is no 'facilitated / championed a session' signal in the data ...
--    champion facilitation is not recorded as a scoreable row."
-- So a champion/faculty who RUNS a session earned nothing, while an attendee did.
--
-- SURVEY (prod 2026-07-27, no fabrication) — is "which staff facilitated cycle X"
-- DERIVABLE from existing rows? Every champion-*action* attribution column exists
-- in schema but is UNPOPULATED in production:
--   * ai_pulse_polls.created_by ............ table has 0 rows
--   * startup_events.created_by (6 cycles) . 0 populated
--   * ai_pulse_featured_tools.created_by ... 0 / 9 populated
--   * ai_pulse_anomaly_flags.reviewed_by ... 0 / 6 populated
--   * ai_pulse_cycle_outcomes.human_verdict_by 0 / 51 populated
--   * ai_pulse_prompt_builds.disqualified_by  0 / 7 populated
--   * ai_pulse_interventions ................ table has 0 rows
--   * ai_pulse_live_attendance.engagement_signals has NO host/facilitator key
-- EXCEPT ONE real, deliberate facilitation record:
--   * startup_events.config->'ai_pulse'->>'host_user_id'  — the "Host" the
--     Champion/admin assigns per cycle in the cycle admin console (Host field +
--     HostUserSelect; lib/services/ai-pulse/cycles-service.ts AI_PULSE_CYCLE_KEYS).
--     Populated on 5 of 9 AI Pulse cycles; 4 of the 6 SCORED cycles have a host;
--     hosts resolve to 2 distinct STAFF champion profiles (Krishnaveni A ×3,
--     Ommsharravana S ×1). This is exactly "which staff profile ran session X",
--     keyed on profiles.id.
--
-- DECISION: facilitation IS derivable → add it as a third scored component of
-- fn_ai_pulse_scored_staff, gated by a new Director-tunable config row
-- `leaderboard_staff_pts_facilitate` (default 15 — a full session run is the
-- highest-effort act: 3× attend, 1.5× quiz base; set 0 to disable, no code
-- change). Only REAL host rows count (host_user_id present AND a staff profile).
-- The board itself stays DARK (leaderboard_staff_board_enabled untouched, false).
--
-- The learner engine fn_ai_pulse_scored_learners is NOT touched.
--
-- NOTE (return-type change): fn_ai_pulse_scored_staff and
-- fn_ai_pulse_my_staff_leaderboard gain output columns, so the return type
-- changes — CREATE OR REPLACE cannot change a return type. We DROP + CREATE.
-- Postgres records no function→function dependency, so dropping the scored fn
-- does not cascade to fn_ai_pulse_leaderboard_staff (which is left untouched:
-- facilitation flows into its participation_pts / total_pts / badges by name).
-- Idempotent: DROP IF EXISTS + CREATE; config row inserted only if absent.
-- SECURITY: every (re)created SECURITY DEFINER fn re-asserts REVOKE anon,PUBLIC
-- + GRANT authenticated,service_role (the secdef-anon gate treats a re-CREATE as
-- new).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. New point-config row (Director-tunable; inserted only if absent so re-apply
--    never resurrects a value the Director has tuned).
-- ---------------------------------------------------------------------------
INSERT INTO public.ai_pulse_policies (config_key, display_name, description, value_jsonb, data_type, is_active)
SELECT k, dn, descr, v::jsonb, dt, true
FROM (VALUES
    ('leaderboard_staff_pts_facilitate', 'Staff points: facilitate',
     'Points a staff member earns for FACILITATING (hosting) a live AI Pulse session — derived from the cycle''s assigned Host (startup_events.config.ai_pulse.host_user_id). Set 0 to score attendance/quiz only.',
     '15', 'int')
) AS t(k, dn, descr, v, dt)
WHERE NOT EXISTS (
    SELECT 1 FROM public.ai_pulse_policies p WHERE p.config_key = t.k
);

-- ---------------------------------------------------------------------------
-- 2. THE STAFF ENGINE (rebuilt): attend + quiz + FACILITATE, keyed on profiles.id.
--    DROP first because the return type gains facilitate_pts + sessions_facilitated.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_ai_pulse_scored_staff(uuid, boolean);

CREATE FUNCTION public.fn_ai_pulse_scored_staff(
    p_cycle_id uuid DEFAULT NULL,
    p_all_time boolean DEFAULT true
)
RETURNS TABLE(
    profile_id          uuid,
    full_name           text,
    role                text,
    department_id       uuid,
    department_name     text,
    institution_id      uuid,
    institution_name    text,
    attend_pts          numeric,
    quiz_pts            numeric,
    facilitate_pts      numeric,
    participation_pts   numeric,
    quality_pts         numeric,
    total_pts           numeric,
    sessions_attended   integer,
    quizzes_taken       integer,
    sessions_facilitated integer,
    quiz_ace            boolean,
    streak_weeks        integer,
    badges              jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_pts_attend     numeric := COALESCE((SELECT (value_jsonb#>>'{}')::numeric FROM ai_pulse_policies WHERE config_key='leaderboard_staff_pts_attend'     AND ai_pulse_policies.is_active LIMIT 1), 5);
    v_pts_quiz       numeric := COALESCE((SELECT (value_jsonb#>>'{}')::numeric FROM ai_pulse_policies WHERE config_key='leaderboard_staff_pts_quiz'       AND ai_pulse_policies.is_active LIMIT 1), 10);
    v_pts_facilitate numeric := COALESCE((SELECT (value_jsonb#>>'{}')::numeric FROM ai_pulse_policies WHERE config_key='leaderboard_staff_pts_facilitate' AND ai_pulse_policies.is_active LIMIT 1), 15);
    v_ace_pct        numeric := COALESCE((SELECT (value_jsonb#>>'{}')::numeric FROM ai_pulse_policies WHERE config_key='leaderboard_quiz_ace_percentile'  AND ai_pulse_policies.is_active LIMIT 1), 0.9);
    v_streak_min     integer := COALESCE((SELECT (value_jsonb#>>'{}')::int     FROM ai_pulse_policies WHERE config_key='leaderboard_loyal_streak_weeks'   AND ai_pulse_policies.is_active LIMIT 1), 3);
    v_latest         uuid;
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
    -- FACILITATE: distinct sessions in scope the staff HOSTED. The host is the
    -- Champion/admin-assigned "Host" of the cycle
    -- (startup_events.config.ai_pulse.host_user_id; legacy flat fallback). Only
    -- real host rows that resolve to a staff profile are counted (JOIN staff).
    facilitate AS (
        SELECT h.pid AS profile_id,
               COUNT(DISTINCT h.cycle_id)                     AS n,
               COUNT(DISTINCT h.cycle_id) * v_pts_facilitate  AS pts
        FROM (
            SELECT s.cycle_id,
                   COALESCE(e.config->'ai_pulse'->>'host_user_id',
                            e.config->>'host_user_id')::uuid AS pid
            FROM scope s
            JOIN startup_events e ON e.id = s.cycle_id
            WHERE COALESCE(e.config->'ai_pulse'->>'host_user_id',
                           e.config->>'host_user_id')
                  ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        ) h
        JOIN staff st ON st.id = h.pid
        GROUP BY h.pid
    ),
    -- STREAK: consecutive most-recent cycles with ANY attend/quiz activity
    -- (unchanged — facilitation is a scoring axis, not a streak axis).
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
    -- A staff appears if they earned on ANY axis — including facilitating a
    -- session they did not personally attend (the core fix: runners are scored).
    earners AS (
        SELECT profile_id AS pid FROM attend
        UNION SELECT profile_id FROM quiz
        UNION SELECT profile_id FROM facilitate
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
        COALESCE(fc.pts, 0)                                                   AS facilitate_pts,
        -- participation = the "doing" bases (attend + quiz base + facilitate)
        COALESCE(at.pts, 0) + COALESCE(qz.base_pts, 0) + COALESCE(fc.pts, 0)  AS participation_pts,
        -- quality = the "doing well" bonus
        COALESCE(qz.quality_pts, 0)                                           AS quality_pts,
        -- total = participation + quality
        COALESCE(at.pts, 0) + COALESCE(qz.base_pts, 0) + COALESCE(fc.pts, 0)
            + COALESCE(qz.quality_pts, 0)                                     AS total_pts,
        COALESCE(at.n, 0)::int                                               AS sessions_attended,
        COALESCE(qz.n, 0)::int                                               AS quizzes_taken,
        COALESCE(fc.n, 0)::int                                               AS sessions_facilitated,
        COALESCE(qz.is_ace, false)                                           AS quiz_ace,
        COALESCE(sk.streak_weeks, 0)                                         AS streak_weeks,
        (
            CASE WHEN COALESCE(qz.n,0) >= 1        THEN jsonb_build_array('first_quiz')   ELSE '[]'::jsonb END
         || CASE WHEN COALESCE(qz.is_ace,false)    THEN jsonb_build_array('quiz_ace')     ELSE '[]'::jsonb END
         || CASE WHEN COALESCE(fc.n,0) >= 1        THEN jsonb_build_array('session_host') ELSE '[]'::jsonb END
         || CASE WHEN COALESCE(sk.streak_weeks,0) >= v_streak_min THEN jsonb_build_array('loyal_streak') ELSE '[]'::jsonb END
        )                                                                    AS badges
    FROM earners e
    JOIN staff st ON st.id = e.pid
    LEFT JOIN attend     at ON at.profile_id = e.pid
    LEFT JOIN quiz       qz ON qz.profile_id = e.pid
    LEFT JOIN facilitate fc ON fc.profile_id = e.pid
    LEFT JOIN streaks    sk ON sk.pid = e.pid
    LEFT JOIN departments  d ON d.id = st.department_id
    LEFT JOIN institutions i ON i.id = st.institution_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_scored_staff(uuid, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_scored_staff(uuid, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. The caller's own staff card — rebuilt to surface facilitate_pts +
--    sessions_facilitated so a host's total visibly adds up. DROP + CREATE
--    because the return type gains two columns.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_ai_pulse_my_staff_leaderboard(uuid, boolean);

CREATE FUNCTION public.fn_ai_pulse_my_staff_leaderboard(
    p_cycle_id uuid DEFAULT NULL,
    p_all_time boolean DEFAULT true
)
RETURNS TABLE(
    profile_id uuid, rank integer, total_staff integer,
    total_pts numeric, participation_pts numeric, quality_pts numeric,
    attend_pts numeric, quiz_pts numeric, facilitate_pts numeric,
    sessions_attended integer, quizzes_taken integer, sessions_facilitated integer,
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
           r.attend_pts, r.quiz_pts, r.facilitate_pts,
           r.sessions_attended, r.quizzes_taken, r.sessions_facilitated,
           r.streak_weeks, r.badges
    FROM ranked r
    WHERE r.profile_id = v_pid;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_my_staff_leaderboard(uuid, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_my_staff_leaderboard(uuid, boolean) TO authenticated, service_role;

-- fn_ai_pulse_leaderboard_staff (the board) is intentionally NOT recreated:
-- facilitation flows into its participation_pts / total_pts / badges by name.
