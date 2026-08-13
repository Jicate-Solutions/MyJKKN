-- ================================================================================
-- Semester-level timetables were invisible in the unmarked-attendance count.
-- Re-grain the two attention-bar attendance state queries from SECTION to TIMETABLE.
--
-- Created: 2026-08-08
-- Supersedes the two attendance functions first defined in
--   supabase/migrations/attention_bar_state_query_functions_v1.sql
-- Bodies below were captured VERBATIM from production `pg_get_functiondef`
--   (project kvizhngldtiuufknvehv, 2026-08-08) and edited only where marked.
--
-- FILE ONLY / NOT APPLIED. Applying is Director-gated.
--
-- --------------------------------------------------------------------------------
-- THE BUG
-- --------------------------------------------------------------------------------
-- Both functions carried `AND t.section_id IS NOT NULL`. `timetables.section_id`
-- is nullable and 60 of 195 active timetables leave it NULL — those are the
-- semester-level timetables (one timetable for a whole semester rather than one
-- per section). Every one of them was excluded from the "unmarked attendance
-- today" count and from the HOD compliance number. Measured on production
-- 2026-08-08 (a Saturday): 29 real teaching sessions missing, among them
-- II M.Com, II MBA, II B.Sc (Mathematics), II M.Sc Zoology and III B.A History.
--
-- These are not idle records. Semester-level timetables carry 3,946 attendance
-- rows across 195 distinct timetables and 246 distinct days, from 2025-09-04 to
-- today — about 35% of every attendance row on the platform. All 3,946 store a
-- non-NULL `student_attendance.section_id` while their timetable's `section_id`
-- is NULL, which is exactly why the old section-to-section key could never match
-- a single one of them.
--
-- --------------------------------------------------------------------------------
-- WHY DELETING THAT ONE PREDICATE IS NOT THE FIX — IT IS HARMFUL
-- --------------------------------------------------------------------------------
-- Measured, not argued. Removing `section_id IS NOT NULL` on its own:
--
--   1. MOVES THE NUMBER BY ZERO. The aggregate is COUNT(DISTINCT t.section_id),
--      and COUNT(DISTINCT) discards NULLs by definition. Production, same day:
--      old count 85, naive-fix count 85 — while the underlying row set grew from
--      85 to 128. Forty-three extra rows, all silently dropped by the aggregate.
--
--   2. EMITS NULL ELEMENTS into `sample_period_ids` via
--      ARRAY(SELECT DISTINCT t2.section_id ...).
--
--   3. CREATES A TO-DO NOBODY CAN EVER CLEAR. The clearing test was
--      `NOT EXISTS (... sa.section_id = t.section_id)`. With `t.section_id` NULL
--      that comparison is NULL, never TRUE, so NOT EXISTS is ALWAYS TRUE and the
--      row reads UNMARKED FOREVER — even seconds after somebody marks it.
--      Not hypothetical: on 2026-08-08 two semester-level timetables had already
--      been marked, and the naive fix reports both as still unmarked.
--
-- --------------------------------------------------------------------------------
-- THE FIX: one grain, shared by the counting key and the clearing key
-- --------------------------------------------------------------------------------
--   COUNT(DISTINCT t.section_id)   -> COUNT(DISTINCT t.id)
--   SELECT DISTINCT t2.section_id  -> SELECT DISTINCT t2.id
--   `section_id IS NOT NULL`       -> `NOT COALESCE(is_template, false)`
--   `sa.section_id = t.section_id` -> `sa.timetable_id = t.id`
--
-- `student_attendance.timetable_id` is NOT NULL (verified live: 11,120 rows,
-- 0 nulls), so the existence key is TOTAL — there is no NULL-comparison hole for
-- mechanism 3 to reopen. Because the counting key and the clearing key are now
-- the same column, they agree by construction: whatever is counted can be cleared.
--
-- The template filter is NOT optional. 19 of the 60 active semester-level rows are
-- templates and 12 of them list today. Dropping `section_id IS NOT NULL` without
-- adding `NOT is_template` injects a dozen teaching sessions that do not exist.
-- It also corrects a pre-existing defect: the old count already included 1 template.
--
-- MEASURED IMPACT (production, 2026-08-08, super-admin scope). Re-measure before
-- relying on these — roughly nine sessions write this database concurrently:
--   old 85 -> new 114, and the arithmetic closes exactly:
--     -1  template that should never have been counted (pre-existing defect)
--     +29 semester-level timetables that were invisible
--     +1  section-level timetable that the tighter existence key correctly no
--         longer clears (a SIBLING timetable in the same section was clearing it)
--
--   Those figures were already stale 40 minutes later the same morning: re-read
--   at 10:20 IST it was old 81 -> new 110. The DIFFERENCE held exactly (+29
--   semester-level, -1 template, +1 sibling) and so did every relationship —
--   which is why the test suite asserts relationships and never a literal count.
--
-- --------------------------------------------------------------------------------
-- RETURN SHAPE IS UNCHANGED
-- --------------------------------------------------------------------------------
-- The JSON keys stay `count` / `sample_period_ids` and `total_faculty` /
-- `compliant_count` / `non_compliant_count` / `non_compliant_user_ids`, because
-- `quick_action_rules.when_clause` addresses them by name. Only the MEANING of the
-- id arrays changes: they now hold timetable UUIDs rather than section UUIDs.
-- Verified by grep across the repository: no TypeScript reads either array, and
-- verified against production that no quick_action_rules row interpolates either
-- (0 rows) — a rule deep-linking off one would otherwise start emitting dead links.
-- ================================================================================

-- ATOMIC ON PURPOSE. The two functions must move together: this change exists
-- partly because a pending figure and a compliance figure that disagree on the
-- same screen are worse than both being wrong. Without an explicit transaction a
-- failure between them — a missing `anon`/`authenticated`/`service_role` role in
-- some environment is enough — would leave function 1 re-grained to timetables
-- and function 2 still on sections, which is exactly that split.
BEGIN;


-- ────────────────────────────────────────────────────────────────────────────────
-- FUNCTION 1: fn_aqs_attendance_unmarked_periods_today
-- query_key: 'attendance.unmarked_periods_today'
-- ────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_aqs_attendance_unmarked_periods_today(
    p_user_id        UUID,
    p_institution_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
DECLARE
    v_is_super_admin  BOOLEAN;
    v_institution_id  UUID;
    v_department_id   UUID;
    v_role            TEXT;
    v_cluster_scoped  BOOLEAN := false;
    v_count           INT := 0;
    v_sample_ids      UUID[];
    v_today_dow       TEXT;
BEGIN
    -- IDENTITY GUARD — must come before anything reads p_user_id.
    --
    -- Every scope decision below is derived from `profiles WHERE id = p_user_id`,
    -- and p_user_id is an ARGUMENT. The function is SECURITY DEFINER and GRANTed
    -- to `authenticated`, so without this guard any signed-in caller could pass a
    -- known super-admin's UUID through PostgREST and walk straight past the clamp
    -- below — the clamp would faithfully evaluate someone else's privileges.
    --
    -- auth.uid() is present for every request that arrives with a user JWT, which
    -- is how the app calls this: lib/attention-bar/state-queries.ts builds its
    -- client with createServerSupabaseClient() (the cookie-backed session client),
    -- not the service-role one. When auth.uid() IS NULL the caller is service_role
    -- or an internal server context that already holds full trust, and p_user_id
    -- is honoured as before so those paths keep working.
    IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
        RETURN jsonb_build_object('count', 0, 'sample_period_ids', '[]'::jsonb);
    END IF;

    -- Resolve caller role + institution from profiles
    SELECT p.is_super_admin, p.role, p.institution_id
    INTO v_is_super_admin, v_role, v_institution_id
    FROM public.profiles p
    WHERE p.id = p_user_id;

    -- Is this caller's role cluster-scoped? ASK THE ROLE REGISTRY, never a
    -- hardcoded name list. Role scope is configuration in this platform —
    -- custom_roles.institution_scope is what Role Management writes and what
    -- role_has_institution_access() reads — so a literal list here would be a
    -- second, silently-drifting copy of that decision.
    --
    -- Measured on production 2026-08-08, which is exactly why the list form is
    -- wrong: custom_roles holds NO row named 'admin' at all. It holds
    -- 'administrator' and 'super_admin', both institution_scope='all'. Yet ONE
    -- live profile still carries the legacy value role='admin', WITH an
    -- institution_id and WITHOUT the is_super_admin flag — a single-tenant user
    -- that a name list mentioning 'admin' would hand the whole cluster to.
    -- Conversely the 2 real 'administrator' users are cluster-scoped and have
    -- NO institution_id, so clamping them by name would empty their screen.
    -- Reading the registry gets both cases right without naming either.
    SELECT COALESCE(bool_or(cr.institution_scope = 'all'), false)
    INTO v_cluster_scoped
    FROM public.custom_roles cr
    WHERE cr.role_key = v_role
      AND cr.is_active;

    -- p_institution_id override — SECURITY CLAMP (added 2026-08-08)
    --
    -- This function is GRANTed to `authenticated`, so any signed-in user can call
    -- it directly through PostgREST with arguments of their choosing. Before this
    -- clamp the override was unconditional: passing another college's UUID as
    -- p_institution_id simply replaced the caller's own institution and returned
    -- that college's unmarked count plus up to ten of its timetable UUIDs.
    -- The re-grain in this migration WIDENS what that exposes, from
    -- COUNT(DISTINCT section_id) to COUNT(DISTINCT timetables.id) including the
    -- semester-level rows this migration un-hides, so it is closed here rather
    -- than re-shipped.
    --
    -- Only a genuinely cluster-scoped caller may redirect the scope. Everyone
    -- else keeps the institution from their own profile, whatever they pass.
    IF COALESCE(v_is_super_admin, false) OR v_cluster_scoped THEN
        v_institution_id := p_institution_id;
    ELSIF p_institution_id IS NOT NULL THEN
        NULL; -- keep v_institution_id from profiles (security clamp)
    END IF;

    -- A cluster-scoped caller naming no institution sees all of them.
    IF (COALESCE(v_is_super_admin, false) OR v_cluster_scoped)
       AND p_institution_id IS NULL THEN
        v_institution_id := NULL;
    END IF;

    -- FAIL CLOSED. The scope predicate below reads
    -- `(v_institution_id IS NULL OR t.institution_id = v_institution_id)`, so a
    -- NULL institution means CLUSTER-WIDE, not "none". A caller who is NOT
    -- cluster-scoped and whose institution cannot be resolved — an unknown
    -- p_user_id, or a profile with a NULL institution_id — would otherwise fall
    -- through that predicate into every college's data. Return empty instead.
    IF NOT COALESCE(v_is_super_admin, false)
       AND NOT v_cluster_scoped
       AND v_institution_id IS NULL THEN
        RETURN jsonb_build_object('count', 0, 'sample_period_ids', '[]'::jsonb);
    END IF;

    -- Resolve the department for a HOD (via profile_id or institution_email).
    --
    -- Skipped for cluster-scoped callers. The predicate below reads
    -- `(v_department_id IS NULL OR t.department_id = v_department_id)`, so ANY
    -- resolved department narrows the result — and a super administrator who also
    -- happens to hold an active staff row would silently have their cluster-wide
    -- view collapsed to that one department. It under-reports rather than
    -- over-reports, so it fails safe, but it is still the wrong number.
    IF NOT (COALESCE(v_is_super_admin, false) OR v_cluster_scoped) THEN
        SELECT s.department_id
        INTO v_department_id
        FROM public.staff s
        WHERE (s.profile_id = p_user_id
           OR s.institution_email = (SELECT email FROM public.profiles WHERE id = p_user_id))
          AND s.is_active = true
        ORDER BY CASE WHEN s.profile_id = p_user_id THEN 0 ELSE 1 END
        LIMIT 1;
    END IF;

    -- Today's day-of-week in uppercase (matches timetable selected_days format)
    -- e.g. 'monday' -> 'MONDAY'
    v_today_dow := UPPER(TO_CHAR(CURRENT_DATE, 'DAY'));
    -- TO_CHAR pads with spaces; trim them
    v_today_dow := TRIM(v_today_dow);

    -- NOTE: Missing index on student_attendance(timetable_id, attendance_date).
    -- Add in a dedicated attendance index PR.

    -- Timetables scheduled today with no attendance record for today.
    --
    -- GRAIN IS THE TIMETABLE, NOT THE SECTION. Do not reintroduce
    -- `section_id IS NOT NULL`, and do not key the NOT EXISTS on `section_id`:
    -- a semester-level timetable carries a NULL section, so
    -- `sa.section_id = t.section_id` evaluates to NULL rather than TRUE and
    -- NOT EXISTS never stops being true — the row would read unmarked forever,
    -- including after it has been marked. `student_attendance.timetable_id` is
    -- NOT NULL, which is what makes it a safe existence key.
    --
    -- THE EXISTENCE TEST CARRIES NO INSTITUTION PREDICATE, DELIBERATELY. The old
    -- shape filtered timetables on `t.institution_id` but tested attendance on
    -- `sa.institution_id`, and those are different columns: an attendance row whose
    -- denormalised institution drifts from its timetable's satisfies the count side
    -- and fails the NOT EXISTS, so the row reads unmarked forever after being
    -- marked — mechanism 3 reopened through a second column. Production already has
    -- one such row (measured 2026-08-08). The predicate was also redundant:
    -- `sa.timetable_id = t.id` pins exactly one timetable and `t` is already
    -- institution-scoped above, so the clause could only ever wrongly EXCLUDE a
    -- match, never admit an extra one. Do not add it back.
    SELECT
        COUNT(DISTINCT t.id)::INT,
        ARRAY(
            SELECT DISTINCT t2.id
            FROM public.timetables t2
            WHERE t2.is_active = true
              AND NOT COALESCE(t2.is_template, false)
              AND (v_institution_id IS NULL OR t2.institution_id = v_institution_id)
              AND (v_department_id IS NULL OR t2.department_id = v_department_id)
              AND t2.selected_days ? v_today_dow
              AND NOT EXISTS (
                  SELECT 1 FROM public.student_attendance sa2
                  WHERE sa2.timetable_id    = t2.id
                    AND sa2.attendance_date = CURRENT_DATE
              )
            ORDER BY t2.id
            LIMIT 10
        )
    INTO v_count, v_sample_ids
    FROM public.timetables t
    WHERE t.is_active = true
      AND NOT COALESCE(t.is_template, false)
      AND (v_institution_id IS NULL OR t.institution_id = v_institution_id)
      AND (v_department_id IS NULL OR t.department_id = v_department_id)
      AND t.selected_days ? v_today_dow
      AND NOT EXISTS (
          SELECT 1 FROM public.student_attendance sa
          WHERE sa.timetable_id    = t.id
            AND sa.attendance_date = CURRENT_DATE
      );

    RETURN jsonb_build_object(
        'count',             COALESCE(v_count, 0),
        'sample_period_ids', COALESCE(to_jsonb(v_sample_ids), '[]'::jsonb)
    );
END;
$function$;

-- Supabase runs ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON FUNCTIONS TO anon,
-- so anon holds a direct grant separate from PUBLIC. Both must be revoked.
REVOKE EXECUTE ON FUNCTION public.fn_aqs_attendance_unmarked_periods_today(UUID, UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_aqs_attendance_unmarked_periods_today(UUID, UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_aqs_attendance_unmarked_periods_today(UUID, UUID) IS
    'AQS Layer-2 state query. Counts timetables that are active, not a template, scheduled for '
    'today via selected_days, and still have no student_attendance row for today. Counted per '
    'TIMETABLE, not per section — semester-level timetables carry a NULL section and were '
    'invisible until 2026-08-08. The existence key is student_attendance.timetable_id (NOT NULL), '
    'so the counting key and the clearing key share one grain and a marked timetable always '
    'disappears from the result. sample_period_ids holds up to 10 TIMETABLE UUIDs. '
    'Senior Learner and HOD scope: their department. super_admin: institution or all.';


-- ────────────────────────────────────────────────────────────────────────────────
-- FUNCTION 2: fn_aqs_attendance_faculty_compliance_today
-- query_key: 'attendance.faculty_compliance_today'
--
-- Carried the IDENTICAL defect. Fixed in the same change on purpose: the two
-- numbers sit on the same dashboard, so correcting one alone would leave the
-- compliance figure visibly contradicting the pending figure.
-- ────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_aqs_attendance_faculty_compliance_today(
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
DECLARE
    v_department_id        UUID;
    v_institution_id       UUID;
    v_total_timetables     INT := 0;
    v_marked_timetables    INT := 0;
    v_unmarked_timetables  INT := 0;
    v_unmarked_ids         UUID[];
    v_today_dow            TEXT;
BEGIN
    -- IDENTITY GUARD — same reasoning as the sibling function above, and needed
    -- here for the same reason: every figure below is derived from p_user_id,
    -- which is an argument, on a SECURITY DEFINER function GRANTed to
    -- `authenticated`. Without it, one signed-in caller could read another
    -- department's compliance figures plus its unmarked timetable UUIDs simply by
    -- naming that person. Fixing only the sibling would leave the same door open
    -- one function along.
    IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
        RETURN jsonb_build_object(
            'total_faculty',          0,
            'compliant_count',        0,
            'non_compliant_count',    0,
            'non_compliant_user_ids', '[]'::jsonb
        );
    END IF;

    -- Resolve the HOD's department + institution via the staff -> profiles link
    -- Priority 1: profile_id FK (durable, survives an email rename)
    -- Priority 2: institution_email match
    SELECT s.department_id, s.institution_id
    INTO v_department_id, v_institution_id
    FROM public.staff s
    WHERE (s.profile_id = p_user_id
       OR s.institution_email = (SELECT email FROM public.profiles WHERE id = p_user_id))
      AND s.is_active = true
    ORDER BY CASE WHEN s.profile_id = p_user_id THEN 0 ELSE 1 END
    LIMIT 1;

    -- Fallback: institution from profiles if there is no team-member record
    IF v_institution_id IS NULL THEN
        SELECT institution_id INTO v_institution_id
        FROM public.profiles
        WHERE id = p_user_id;
    END IF;

    -- Today's day-of-week: MONDAY, TUESDAY, etc.
    v_today_dow := TRIM(UPPER(TO_CHAR(CURRENT_DATE, 'DAY')));

    -- Compliance is measured per TIMETABLE, not per section.
    --   "Compliant"     = the timetable has at least one student_attendance row today.
    --   "Non-compliant" = it is scheduled today and has none.
    -- The local variable names say "timetables" deliberately; the returned JSON keys
    -- keep their historical names because quick_action_rules.when_clause addresses
    -- them by name.
    --
    -- NOTE: Missing composite index on student_attendance(timetable_id, attendance_date).
    -- Add in a dedicated index PR.

    WITH dept_timetables AS (
        SELECT DISTINCT t.id AS timetable_id
        FROM public.timetables t
        WHERE t.is_active = true
          AND NOT COALESCE(t.is_template, false)
          AND t.institution_id = v_institution_id
          AND (v_department_id IS NULL OR t.department_id = v_department_id)
          AND t.selected_days ? v_today_dow
    ),
    marked AS (
        SELECT DISTINCT sa.timetable_id
        FROM public.student_attendance sa
        WHERE sa.attendance_date = CURRENT_DATE
          AND sa.timetable_id IN (SELECT timetable_id FROM dept_timetables)
    )
    SELECT
        COUNT(d.timetable_id)::INT,
        COUNT(m.timetable_id)::INT,
        (COUNT(d.timetable_id) - COUNT(m.timetable_id))::INT,
        ARRAY(
            SELECT d2.timetable_id
            FROM dept_timetables d2
            LEFT JOIN marked m2 ON m2.timetable_id = d2.timetable_id
            WHERE m2.timetable_id IS NULL
            ORDER BY d2.timetable_id
            LIMIT 10
        )
    INTO v_total_timetables, v_marked_timetables, v_unmarked_timetables, v_unmarked_ids
    FROM dept_timetables d
    LEFT JOIN marked m ON m.timetable_id = d.timetable_id;

    -- Return shape preserved: total_faculty now carries the total TIMETABLE count.
    RETURN jsonb_build_object(
        'total_faculty',           COALESCE(v_total_timetables, 0),
        'compliant_count',         COALESCE(v_marked_timetables, 0),
        'non_compliant_count',     COALESCE(v_unmarked_timetables, 0),
        'non_compliant_user_ids',  COALESCE(to_jsonb(v_unmarked_ids), '[]'::jsonb)
    );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_aqs_attendance_faculty_compliance_today(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_aqs_attendance_faculty_compliance_today(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_aqs_attendance_faculty_compliance_today(UUID) IS
    'AQS Layer-2 state query. For a HOD: how many timetables in their department have attendance '
    'marked today versus how many do not. Counted per TIMETABLE, not per section, so semester-level '
    'timetables are included; templates are excluded. non_compliant_user_ids holds up to 10 '
    'TIMETABLE UUIDs (the key name is historical). Department resolved via staff.profile_id FK or '
    'institution_email fallback.';


-- ────────────────────────────────────────────────────────────────────────────────
-- REGISTRY COPY: the counting unit changed from sections to teaching sessions.
-- These rows are read at runtime, so stale wording here contradicts the number the
-- same screen renders. Wording follows the JKKN dictionary
-- (.claude/skills/jkkn-terminologies): "sessions", never the prohibited synonyms.
-- Idempotent — re-running sets the same values. Guarded because a fresh
-- environment may not have seeded the registry yet.
-- ────────────────────────────────────────────────────────────────────────────────
DO $do$
BEGIN
    IF to_regclass('public.quick_action_state_queries') IS NOT NULL THEN
        UPDATE public.quick_action_state_queries
        SET description = 'Count of teaching sessions (timetables) scheduled today that still have no '
                          'attendance marked. Counted per timetable, not per section, so semester-level '
                          'timetables — which carry no section — are included; templates are excluded. '
                          'Senior Learner and HOD scope: their department. super_admin scope: all '
                          'institutions (pass p_institution_id to narrow). sample_period_ids holds up '
                          'to 10 timetable UUIDs.'
        WHERE query_key = 'attendance.unmarked_periods_today';

        UPDATE public.quick_action_state_queries
        SET description = 'For a HOD: how many teaching sessions (timetables) in their department have '
                          'attendance marked today versus how many do not. Counted per timetable, not '
                          'per section, so semester-level timetables are included; templates are '
                          'excluded. non_compliant_user_ids holds up to 10 timetable UUIDs (the key '
                          'name is historical). Department resolved via staff.profile_id FK or '
                          'institution_email.'
        WHERE query_key = 'attendance.faculty_compliance_today';
    END IF;

    IF to_regclass('public.quick_action_rules') IS NOT NULL THEN
        -- "Mark attendance for N sections" -> "... N sessions"
        UPDATE public.quick_action_rules
        SET action_template = jsonb_set(
                action_template,
                '{label}',
                to_jsonb('Mark attendance for {state.attendance.unmarked_periods_today.count} sessions'::TEXT),
                true
            ),
            description = 'Senior Learner on /academic/attendance/dashboard with more than 0 teaching '
                          'sessions still unmarked today.'
        WHERE id = '11111111-1111-4111-8111-100000000004'::UUID
          -- jsonb_set is strict: a NULL or scalar action_template would be
          -- overwritten with NULL or raise, taking href/cta/icon with it.
          AND jsonb_typeof(action_template) = 'object';

        -- The HOD badge sits on the same screen and is fed by the sibling function.
        UPDATE public.quick_action_rules
        SET action_template = jsonb_set(
                action_template,
                '{label}',
                to_jsonb('{state.attendance.faculty_compliance_today.non_compliant_count} sessions unmarked today'::TEXT),
                true
            ),
            description = 'HOD on /academic/attendance/dashboard when any teaching session in their '
                          'department is non-compliant today.'
        WHERE id = '11111111-1111-4111-8111-100000000003'::UUID
          AND jsonb_typeof(action_template) = 'object';
    END IF;
END
$do$;

COMMIT;
