-- ============================================================================
-- 20260805130000_ai_pulse_hide_admins_from_staff_board.sql
-- AI Pulse Senior Learners board — hide administrator accounts COMPLETELY
-- Director decision #1, specs/ai-pulse-starter-and-board-decisions-2026-07-30.md
-- ============================================================================
-- WHY
--   The Senior Learners board went live on 2026-07-30 with the two platform
--   administrators sitting at ranks #1 and #2, scored under the practice
--   institution "JKKN Testing Institution", and carrying `session_host` badges —
--   i.e. points earned partly for RUNNING the sessions. The first real teaching
--   team member sat at #3. Director ruling: "the people who run the sessions
--   must not also appear to be winning them."
--
-- "COMPLETELY" IS LOAD-BEARING
--   The Director explicitly REJECTED the softer option of keeping a private
--   self-view for administrators. An administrator gets NO rank row on the
--   public board AND NO personal score card. Both readers are changed here.
--
-- MEASURED ON PROD (ref kvizhngldtiuufknvehv) BEFORE THIS CHANGE
--   fn_ai_pulse_leaderboard_staff(NULL, true, 500) -> 175 rows.
--   Rows whose profile is an administrator: EXACTLY 2, and the two criteria
--   agree exactly (2 by `role = 'super_admin'`, 2 by `profiles.is_super_admin`,
--   intersection 2, union 2). Board after this change: 173 rows, #3 becomes #1.
--
-- TWO DIFFERENT QUESTIONS, TWO DIFFERENT TESTS — do not conflate them:
--   * "is the CALLER an administrator?"      -> is_super_admin()  (reads auth.uid())
--   * "is THIS ROW's person an administrator?" -> that row's profiles.is_super_admin
--   is_super_admin() answers ONLY the first. Using it to filter other people's
--   rows would hide either everyone or no one.
--
-- BOTH criteria are excluded (`role = 'super_admin'` OR `profiles.is_super_admin`)
--   because either one alone means "this person administers the platform", and
--   the ruling is to hide administrators completely. They coincide today; the
--   OR keeps the surface correct if one of them drifts.
--
-- RANK IS COMPUTED AFTER THE EXCLUSION, not before. Filtering a pre-computed
--   rank sequence would leave holes where the administrators were (#3, #4, #5 …
--   with no #1, #2) — that is a bug, not a hidden row.
--
-- DELIBERATELY UNCHANGED
--   * Point values, badges, streak logic — `fn_ai_pulse_scored_staff` is NOT
--     touched. Both functions below still read it verbatim.
--   * The department board and the learner board.
--   * NO institution filter. The Director chose to hide ADMINISTRATORS, not the
--     "JKKN Testing Institution" rows. A real person scored under the practice
--     institution still appears.
--
-- BASED ON THE LIVE DEFINITIONS, not on a repo file: both bodies below were
--   fetched with pg_get_functiondef() immediately before authoring. Every line
--   unrelated to the exclusion is preserved byte-for-byte.
--     fn_ai_pulse_leaderboard_staff    md5 21ba3da4f736e42a1e60b57dafef0e0b
--     fn_ai_pulse_my_staff_leaderboard md5 92644eb82cefefa91955c091ecab0a90
--
-- NOT APPLIED to any database by this file — Director-gated apply.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Public board — administrators are removed, then ranked.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_leaderboard_staff(
    p_cycle_id uuid DEFAULT NULL::uuid,
    p_all_time boolean DEFAULT true,
    p_limit integer DEFAULT 100
)
RETURNS TABLE(
    rank integer, profile_id uuid, staff_name text, role text,
    department_name text, institution_name text,
    total_pts numeric, participation_pts numeric, quality_pts numeric,
    sessions_attended integer, quizzes_taken integer,
    streak_weeks integer, badges jsonb
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    -- Decision #1: platform administrators are dropped BEFORE ranking, so the
    -- surviving sequence starts at 1 with no holes. NOT EXISTS (rather than a
    -- JOIN) so the filter can neither drop a row for a missing profile nor
    -- duplicate one.
    WITH eligible AS (
        SELECT s.*
        FROM fn_ai_pulse_scored_staff(p_cycle_id, p_all_time) s
        WHERE COALESCE(s.role, '') <> 'super_admin'
          AND NOT EXISTS (
              SELECT 1 FROM profiles pr
              WHERE pr.id = s.profile_id
                AND COALESCE(pr.is_super_admin, false)
          )
    )
    SELECT
        RANK() OVER (ORDER BY e.total_pts DESC, e.quality_pts DESC)::int,
        e.profile_id,
        COALESCE(NULLIF(btrim(e.full_name), ''), 'Staff'),
        e.role,
        e.department_name,
        e.institution_name,
        e.total_pts, e.participation_pts, e.quality_pts,
        e.sessions_attended, e.quizzes_taken,
        e.streak_weeks, e.badges
    FROM eligible e
    ORDER BY e.total_pts DESC, e.quality_pts DESC
    LIMIT GREATEST(p_limit, 1);
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_leaderboard_staff(uuid, boolean, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_leaderboard_staff(uuid, boolean, integer) TO authenticated;

COMMENT ON FUNCTION public.fn_ai_pulse_leaderboard_staff(uuid, boolean, integer) IS
'AI Pulse Senior Learners board. Director decision #1 (2026-07-30): platform
administrators are excluded entirely and rank is computed after the exclusion,
so the organisers of a session never appear to be winning it. Scoring itself is
unchanged — fn_ai_pulse_scored_staff is read verbatim.';

-- ---------------------------------------------------------------------------
-- 2. Personal card — an administrator gets NO row at all.
-- ---------------------------------------------------------------------------
-- Return shape is IDENTICAL to the live definition (14 columns, same order and
-- types) so the existing reader keeps working:
--   lib/services/ai-pulse/leaderboard-service.ts::useMySeniorLeaderboardCard
--   takes data[0] and returns null when absent; the consumer
--   app/(routes)/ai-pulse/leaderboard/_components/leaderboard-tabs.tsx
--   ::SeniorStandingCard does `if (!data) return null` — zero rows renders
--   nothing, no crash, no "undefined". No UI change is required.
-- `total_staff` is now counted over the FILTERED set (173, not 175) so the card
--   never reads "#1 of 175" against a board that shows 173.
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_my_staff_leaderboard(
    p_cycle_id uuid DEFAULT NULL::uuid,
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
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE v_pid uuid := auth.uid();
BEGIN
    IF v_pid IS NULL THEN RETURN; END IF;

    -- Decision #1, the half the Director insisted on: no private self-view for
    -- administrators either. COALESCE because a NULL guard falls silently OPEN.
    -- This is a question about the CALLER, so is_super_admin() is the right test
    -- here (and only here).
    IF COALESCE(is_super_admin(), false) THEN RETURN; END IF;

    RETURN QUERY
    WITH eligible AS (
        SELECT s.*
        FROM fn_ai_pulse_scored_staff(p_cycle_id, p_all_time) s
        WHERE COALESCE(s.role, '') <> 'super_admin'
          AND NOT EXISTS (
              SELECT 1 FROM profiles pr
              WHERE pr.id = s.profile_id
                AND COALESCE(pr.is_super_admin, false)
          )
    ),
    ranked AS (
        SELECT e.*,
               RANK() OVER (ORDER BY e.total_pts DESC, e.quality_pts DESC)::int AS rnk,
               COUNT(*) OVER ()::int AS n
        FROM eligible e
    )
    SELECT r.profile_id, r.rnk, r.n,
           r.total_pts, r.participation_pts, r.quality_pts,
           r.attend_pts, r.quiz_pts, r.facilitate_pts,
           r.sessions_attended, r.quizzes_taken, r.sessions_facilitated,
           r.streak_weeks, r.badges
    FROM ranked r
    WHERE r.profile_id = v_pid;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_my_staff_leaderboard(uuid, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_my_staff_leaderboard(uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.fn_ai_pulse_my_staff_leaderboard(uuid, boolean) IS
'A Senior Learner''s own AI Pulse standing card. Director decision #1
(2026-07-30): a platform administrator receives NO row — hidden completely, not
merely delisted. Rank and total_staff are computed over the same administrator-
filtered set the public board uses, so the two cannot disagree ON THAT DIMENSION
(both read 173, never 175). They can still differ on p_limit: the board is
truncated by its caller''s limit while total_staff counts the whole filtered set
— pre-existing behaviour, unchanged here.';
