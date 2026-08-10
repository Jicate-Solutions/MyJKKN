-- ================================================================================
-- The unmarked-session history had nowhere to be read.
-- Add a DATE-RANGED sibling to fn_aqs_attendance_unmarked_periods_today.
--
-- Created: 2026-08-10
-- FILE ONLY / NOT APPLIED. Applying is Director-gated.
--
-- --------------------------------------------------------------------------------
-- WHY THIS EXISTS
-- --------------------------------------------------------------------------------
-- On 2026-08-10, 43,775 `dashboard:anomaly` notification rows carrying
-- "Attendance not marked today" were expired deliberately, on an explicit Director
-- ruling, after he was shown and accepted that the underlying history would
-- afterwards be readable NOWHERE in the product except /notifications/admin.
-- Nothing in this file reverses that: it does not un-expire, re-create or backfill
-- a single notification row. It builds the view that was missing instead.
--
-- The gap is narrow and total. `fn_aqs_attendance_unmarked_periods_today` hardcodes
-- CURRENT_DATE in both its scheduling test and its clearing test, and the
-- notification's action URL carries no date, so there was no way to ask "which
-- sessions went unmarked last week / last month". Measured on production
-- 2026-08-10: 5,258 distinct timetable/day sessions since 2026-04-21 are affected.
--
-- --------------------------------------------------------------------------------
-- THE GRAIN IS COPIED, NOT RE-DERIVED
-- --------------------------------------------------------------------------------
-- 20260816030000_unmarked_periods_regrain_to_timetable.sql re-grained the today
-- function from SECTION to TIMETABLE, and explains at length why every part of that
-- grain is load-bearing. This function reuses it verbatim so the two screens cannot
-- disagree:
--
--   counting key   COUNT(DISTINCT timetables.id)          -- never section_id
--   scheduling key selected_days ? TRIM(UPPER(TO_CHAR(d,'DAY')))
--   template rule  NOT COALESCE(is_template, false)
--   clearing key   student_attendance.timetable_id = t.id -- NOT NULL, so total
--
-- The clearing key in particular is not a style choice. `sa.section_id = t.section_id`
-- is NULL for a semester-level timetable, NOT EXISTS therefore never stops being
-- true, and the row reads unmarked forever — including after somebody marks it. Over
-- a single day that is a stuck to-do; over a four-month history it would be 35% of
-- the platform's attendance permanently mis-reported. Do not reintroduce it here.
--
-- PROVEN AGAINST PRODUCTION, read-only, 2026-08-10 (Monday):
--   live fn_aqs_attendance_unmarked_periods_today, cluster scope  -> count 69
--   this file's predicate evaluated over the same estate for the
--   same CURRENT_DATE                                             -> 69
--   its 10 sampled ids resolve 10/10 in `timetables`, 0 in `sections`
-- The two agree exactly for CURRENT_DATE, which is the check that matters: the
-- range view and the dashboard badge are read on the same screen on the same day.
--
-- --------------------------------------------------------------------------------
-- THE ONE DELIBERATE DIFFERENCE: THE TIMETABLE'S OWN VALIDITY WINDOW
-- --------------------------------------------------------------------------------
-- This function adds `start_date <= d AND end_date >= d`, which the today function
-- does not carry. That is not a grain change — the counting unit is still one
-- timetable on one date — and it is not optional for a historical query.
--
-- `timetables.start_date` / `end_date` are populated on 195 of 198 active rows. A
-- timetable that begins in August was not teaching in April, so scoring it against
-- April dates invents sessions that never existed. MEASURED on production for
-- 2026-07-01..2026-07-31, cluster scope, read-only:
--
--   without the validity window : 2,045 unmarked timetable-day sessions
--   with    the validity window : 1,933
--   phantom sessions avoided    :   112  (in ONE month)
--
-- Those 112 are not noise in a view whose entire purpose is to show what really
-- went unmarked. Without the predicate the number inflates by ~5.5% per month of
-- history and every extra row names a session that was not scheduled.
--
-- WHY IT DOES NOT BREAK THE SAME-DAY AGREEMENT ABOVE, and where it eventually will.
-- Measured on production 2026-08-10: of the 176 active non-template timetables
-- scheduled today, ZERO sit outside their own validity window, and across the whole
-- active estate 0 rows have a future `start_date` and 0 have a passed `end_date`.
-- So today the predicate removes nothing and 69 = 69 exactly. It only ever bites on
-- dates where the estate differed from today's, which is precisely the historical
-- case it exists for — on 37 of the last 45 days it would have changed the
-- scheduled set.
--
-- It follows that the two functions WILL diverge, by a row or two, on the first day
-- after a timetable's `end_date` passes: the earliest `end_date` on the active
-- estate is 2026-08-14. On 2026-08-15 the today function will report a session for
-- a timetable that stopped teaching on the 14th and this one will not. Stated here
-- rather than left to be discovered, because the honest reading is that the today
-- function is the one that is wrong — it is missing a predicate, not this file
-- carrying a spare. Correcting it means editing
-- 20260816030000_unmarked_periods_regrain_to_timetable.sql and re-proving that
-- migration's numbers, which is a separate change with its own Director gate; this
-- PR deliberately does not touch it.
--
-- --------------------------------------------------------------------------------
-- WHAT "UNMARKED" MEANS FOR A PAST DATE
-- --------------------------------------------------------------------------------
-- STILL unmarked, as of now — not "was unmarked at 6pm that evening". A session
-- marked late, or backfilled next week, disappears from this view. That is
-- deliberate and it is the useful question ("what is still missing?"), but it means
-- this view is NOT a reconstruction of the expired notification rows, which were
-- point-in-time snapshots. It will legitimately return fewer sessions than were
-- notified. Anyone reconciling the two numbers should expect that gap.
--
-- --------------------------------------------------------------------------------
-- COST
-- --------------------------------------------------------------------------------
-- The date range is capped at 366 days and the returned session list at 2,000 rows,
-- so a mistyped range cannot ask for an unbounded scan. `student_attendance` still
-- lacks the composite index on (timetable_id, attendance_date) that both sibling
-- functions already note; it matters more here, because a range fan-out probes it
-- once per timetable per day rather than once per timetable. Adding it belongs in
-- the dedicated attendance index PR those notes already point at — CREATE INDEX
-- CONCURRENTLY cannot run inside this migration's transaction anyway.
-- ================================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_aqs_attendance_unmarked_periods_range(
    p_user_id        UUID,
    p_from           DATE,
    p_to             DATE,
    p_institution_id UUID DEFAULT NULL,
    p_limit          INT  DEFAULT 500
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
-- `public` alone, per the mandated template in CLAUDE.md. The sibling today
-- function writes `public, pg_catalog`; naming pg_catalog explicitly and LAST is
-- strictly weaker, because an unlisted pg_catalog is searched FIRST and cannot be
-- shadowed by a public object of the same name.
SET search_path = public
AS $function$
DECLARE
    v_is_super_admin  BOOLEAN;
    v_institution_id  UUID;
    v_department_id   UUID;
    v_role            TEXT;
    v_cluster_scoped  BOOLEAN := false;
    v_trusted_context BOOLEAN := false;
    v_from            DATE;
    v_to              DATE;
    v_limit           INT;
    v_count           INT := 0;
    v_day_count       INT := 0;
    v_days            JSONB := '[]'::JSONB;
    v_sessions        JSONB := '[]'::JSONB;
    v_empty           JSONB;
BEGIN
    v_empty := jsonb_build_object(
        'from',      p_from,
        'to',        p_to,
        'count',     0,
        'day_count', 0,
        'truncated', false,
        'days',      '[]'::jsonb,
        'sessions',  '[]'::jsonb
    );

    -- ── IDENTITY GUARD ───────────────────────────────────────────────────────
    -- Identical in shape and reasoning to the today function. Every scope
    -- decision below derives from `profiles WHERE id = p_user_id`, p_user_id is
    -- an ARGUMENT, and this function is SECURITY DEFINER GRANTed to
    -- `authenticated` — so without this guard any signed-in caller could pass a
    -- known super-admin's UUID through PostgREST and be handed the whole
    -- cluster's history. auth.uid() is present on every request carrying a user
    -- JWT, which is how the app calls this (a cookie-backed session client).
    -- When it IS NULL the caller is service_role or an internal server context
    -- that already holds full trust.
    IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
        RETURN v_empty;
    END IF;
    v_trusted_context := (auth.uid() IS NULL);

    -- ── PERMISSION GATE ──────────────────────────────────────────────────────
    -- The two-argument form is used on purpose. The one-argument
    -- user_has_permission(text) reads auth.uid(), which is NULL on the
    -- service_role path and would therefore deny every internal caller. The
    -- two-argument form answers for a named user, and the identity guard above
    -- has already established that p_user_id IS the caller whenever a JWT is
    -- present — so it is not spoofable here.
    --
    -- Key choice: `academic.attendance.dashboard.view`, the same key that gates
    -- /academic/attendance/dashboard, which is where the today count is already
    -- read. Verified on production 2026-08-10 that it is not a dark key — 10
    -- active roles hold it (ceo, managing_director, registrar,
    -- executive_admin_officer, administrator, principal, vice_principal,
    -- school_principal, digital_coordinator, hod), plus the super-admin bypass
    -- inside the function itself. No new permission key is introduced.
    IF NOT COALESCE(public.user_has_permission(p_user_id, 'academic.attendance.dashboard.view'), false) THEN
        RETURN v_empty;
    END IF;

    -- ── ARGUMENT VALIDATION ──────────────────────────────────────────────────
    -- Defaults keep a bare call meaningful rather than empty.
    v_from := COALESCE(p_from, CURRENT_DATE);
    v_to   := COALESCE(p_to,   CURRENT_DATE);

    IF v_from > v_to THEN
        RETURN v_empty;
    END IF;

    -- Hard ceiling on the fan-out. 366 days is a full academic year including a
    -- leap day; beyond that a typo (a year transposed) would scan for minutes.
    IF (v_to - v_from) > 366 THEN
        v_from := v_to - 366;
    END IF;

    v_limit := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 2000);

    -- ── SCOPE RESOLUTION ─────────────────────────────────────────────────────
    -- Copied from the today function so the two cannot drift apart on WHO sees
    -- WHAT. Comments there carry the measured reasoning for each branch.
    SELECT p.is_super_admin, p.role, p.institution_id
    INTO v_is_super_admin, v_role, v_institution_id
    FROM public.profiles p
    WHERE p.id = p_user_id;

    -- Cluster scope comes from the role registry, never a hardcoded name list.
    -- custom_roles.institution_scope is what Role Management writes and what
    -- role_has_institution_access() reads; a literal list here would be a second,
    -- silently-drifting copy of that decision.
    SELECT COALESCE(bool_or(cr.institution_scope = 'all'), false)
    INTO v_cluster_scoped
    FROM public.custom_roles cr
    WHERE cr.role_key = v_role
      AND cr.is_active;

    -- p_institution_id override — SECURITY CLAMP. Only a genuinely cluster-scoped
    -- caller may redirect the scope; everyone else keeps their own institution
    -- whatever they pass.
    IF COALESCE(v_is_super_admin, false) OR v_cluster_scoped THEN
        v_institution_id := p_institution_id;
    ELSIF p_institution_id IS NOT NULL THEN
        NULL; -- keep v_institution_id from profiles (security clamp)
    END IF;

    IF (COALESCE(v_is_super_admin, false) OR v_cluster_scoped)
       AND p_institution_id IS NULL THEN
        v_institution_id := NULL;
    END IF;

    -- FAIL CLOSED. A NULL v_institution_id means CLUSTER-WIDE in the predicate
    -- below, not "none", so a non-cluster caller whose institution cannot be
    -- resolved must be turned away rather than dropped into every college.
    IF NOT COALESCE(v_is_super_admin, false)
       AND NOT v_cluster_scoped
       AND v_institution_id IS NULL THEN
        RETURN v_empty;
    END IF;

    -- HOD department narrowing, skipped for cluster-scoped callers so a super
    -- administrator who also holds a staff row does not have their cluster view
    -- silently collapsed to one department.
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

    -- ── THE QUERY ────────────────────────────────────────────────────────────
    WITH scoped_timetables AS (
        -- role_has_institution_access() is applied HERE, over the ~198 active
        -- timetables, and not over the date-expanded set: it is a PL/pgSQL
        -- function and evaluating it once per timetable-day would multiply the
        -- calls by the length of the range for an answer that only ever varies
        -- per institution. It is a second, narrowing layer on top of the clamp
        -- above — it can remove rows, never add them.
        --
        -- Skipped on the trusted (service_role / internal) path, where auth.uid()
        -- is NULL: the function reads auth.uid() internally and would deny
        -- everything, emptying the result for exactly the callers that already
        -- hold full trust.
        SELECT t.id, t.timetable_name, t.selected_days, t.start_date, t.end_date,
               t.institution_id, t.department_id, t.program_id, t.semester_id, t.section_id
        FROM public.timetables t
        WHERE t.is_active = true
          AND NOT COALESCE(t.is_template, false)
          AND (v_institution_id IS NULL OR t.institution_id = v_institution_id)
          AND (v_department_id  IS NULL OR t.department_id  = v_department_id)
          AND (v_trusted_context OR public.role_has_institution_access(t.institution_id))
    ),
    range_days AS (
        SELECT gs::DATE AS session_date,
               -- TO_CHAR pads to nine characters; TRIM matches the
               -- selected_days values. Byte-for-byte the construct the today
               -- function uses, so the two resolve the same weekday name.
               TRIM(UPPER(TO_CHAR(gs, 'DAY'))) AS dow
        FROM generate_series(v_from::TIMESTAMP, v_to::TIMESTAMP, INTERVAL '1 day') gs
    ),
    unmarked AS (
        SELECT st.id AS timetable_id,
               st.timetable_name,
               st.institution_id, st.department_id, st.program_id,
               st.semester_id, st.section_id,
               rd.session_date,
               rd.dow
        FROM scoped_timetables st
        JOIN range_days rd
          ON st.selected_days ? rd.dow
        WHERE (st.start_date IS NULL OR st.start_date <= rd.session_date)
          AND (st.end_date   IS NULL OR st.end_date   >= rd.session_date)
          -- Same clearing key as the today function. timetable_id is NOT NULL on
          -- student_attendance, so this existence test is TOTAL and a marked
          -- session always disappears. Carries no institution predicate,
          -- deliberately: `sa.timetable_id = st.id` already pins exactly one
          -- institution-scoped timetable, and testing a second, denormalised
          -- column has been observed on production to strand a marked row as
          -- permanently unmarked.
          AND NOT EXISTS (
              SELECT 1
              FROM public.student_attendance sa
              WHERE sa.timetable_id    = st.id
                AND sa.attendance_date = rd.session_date
          )
    )
    SELECT
        (SELECT COUNT(*)::INT FROM unmarked),
        (SELECT COUNT(DISTINCT session_date)::INT FROM unmarked),
        COALESCE((
            SELECT jsonb_agg(x ORDER BY x->>'session_date' DESC)
            FROM (
                SELECT jsonb_build_object(
                           'session_date', u.session_date,
                           'count',        COUNT(*)::INT
                       ) AS x
                FROM unmarked u
                GROUP BY u.session_date
            ) d
        ), '[]'::jsonb),
        COALESCE((
            SELECT jsonb_agg(s ORDER BY s->>'session_date' DESC, s->>'timetable_name')
            FROM (
                SELECT jsonb_build_object(
                           'session_date',     u.session_date,
                           'day_of_week',      u.dow,
                           'timetable_id',     u.timetable_id,
                           'timetable_name',   u.timetable_name,
                           'institution_id',   u.institution_id,
                           'institution_name', i.name,
                           'department_id',    u.department_id,
                           'department_name',  dep.department_name,
                           'program_name',     pr.program_name,
                           'semester_name',    sem.semester_name,
                           -- NULL for a semester-level timetable, which is the
                           -- whole population this view exists to make visible.
                           'section_name',     sec.section_name
                       ) AS s
                FROM unmarked u
                LEFT JOIN public.institutions i   ON i.id   = u.institution_id
                LEFT JOIN public.departments dep  ON dep.id = u.department_id
                LEFT JOIN public.programs pr      ON pr.id  = u.program_id
                LEFT JOIN public.semesters sem    ON sem.id = u.semester_id
                LEFT JOIN public.sections sec     ON sec.id = u.section_id
                ORDER BY u.session_date DESC, u.timetable_name
                LIMIT v_limit
            ) q
        ), '[]'::jsonb)
    INTO v_count, v_day_count, v_days, v_sessions;

    RETURN jsonb_build_object(
        'from',      v_from,
        'to',        v_to,
        'count',     COALESCE(v_count, 0),
        'day_count', COALESCE(v_day_count, 0),
        -- The caller must be able to tell "500 sessions" from "the first 500 of
        -- 1,933". A list that silently stops is how a history screen quietly
        -- starts under-reporting.
        'truncated', COALESCE(v_count, 0) > v_limit,
        'days',      v_days,
        'sessions',  v_sessions
    );
END;
$function$;

-- Supabase runs ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON FUNCTIONS TO anon,
-- so anon holds a direct grant SEPARATE from PUBLIC. Revoking PUBLIC alone leaves
-- the function callable by any unauthenticated client holding the public anon key,
-- which is embedded in every browser bundle. Both must be named.
REVOKE EXECUTE ON FUNCTION public.fn_aqs_attendance_unmarked_periods_range(UUID, DATE, DATE, UUID, INT) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_aqs_attendance_unmarked_periods_range(UUID, DATE, DATE, UUID, INT) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_aqs_attendance_unmarked_periods_range(UUID, DATE, DATE, UUID, INT) IS
    'Date-ranged sibling of fn_aqs_attendance_unmarked_periods_today. Returns the teaching sessions '
    '(timetables) scheduled on each date between p_from and p_to that still have no student_attendance '
    'row for that date. Same TIMETABLE grain as the today function — counted per timetable.id, cleared '
    'on student_attendance.timetable_id — so semester-level timetables (NULL section) are included and '
    'templates excluded; verified to return the same count as the today function for CURRENT_DATE. '
    'Additionally honours the timetable''s own start_date/end_date validity window, which the today '
    'function does not, because scoring a timetable against dates before it began invents sessions. '
    '"Unmarked" means STILL unmarked now, not a point-in-time snapshot: a late-marked session '
    'disappears. Range capped at 366 days, session list at 2,000 rows (see the truncated flag). '
    'Gated on academic.attendance.dashboard.view plus role_has_institution_access; p_institution_id is '
    'honoured only for cluster-scoped callers and a HOD is narrowed to their department.';

COMMIT;
