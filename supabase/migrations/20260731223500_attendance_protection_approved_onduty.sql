-- =============================================================================
-- Attendance protection for approved on-duty days (tournament + on-duty)
-- Created: 2026-07-31
--
-- WHY
-- ---
-- The Principal's permission letter ends "With Attendance". A learner who
-- represents the college must not lose exam eligibility for the days the
-- college itself sent them away. Today they do: the attendance blob carries
-- only 'present' and 'absent' (verified on prod 2026-07-31 — 661,354 present /
-- 210,956 absent, and no third value anywhere since 2026-01-01), so an
-- approved on-duty day is counted exactly like an unexcused absence by every
-- percentage in the platform.
--
-- WHAT THIS CHANGES
-- -----------------
-- Which days COUNT. It does NOT touch the eligibility thresholds — the
-- >=75 / 65-75 / <65 bands stay exactly where they are, in platform_policies
-- (POLICY_KEYS.EXAM_ELIGIBILITY_*) with the 75/65 fallbacks in
-- lib/services/exam-audit/compute.ts. The pass line is untouched by design.
--
-- HOW (auditable + reversible by construction)
-- --------------------------------------------
-- Protection is applied at READ time and is never written into
-- public.student_attendance. The historical record stays byte-for-byte as the
-- Senior Learner marked it: a day the learner did not attend still reads
-- 'absent' forever. The percentage simply credits it back while an approved
-- permission covers it.
--
-- That gives three properties the Director asked for:
--   * auditable  — fn_attendance_protected_days names the source of every
--                  protected day (which permission, which tournament), so a
--                  protected day can always be explained to an examiner.
--   * reversible — cancel or reject the permission and the credit disappears
--                  on the next read. There is no backfill to undo and no
--                  rewritten history to restore.
--   * backdated  — D17. A window that has already passed is protected the
--                  moment it is approved, because nothing was ever frozen in.
--
-- DIRECTOR DECISIONS IMPLEMENTED
-- ------------------------------
-- D15/D16  Every day in the approved start_date..end_date range is protected,
--          not just the competition days. The letter requests the tournament
--          AND the daily practice window, and the Principal approves the whole
--          range, so the approved range is the authority.
-- D17      Backdating allowed — see above.
-- D19      Roster changes. Protection is read from
--          v_health_tournament_participation, which explodes the CURRENT
--          roster, so a learner removed from the squad stops being protected
--          and their removal leaves every other member's approval untouched.
--          KNOWN LIMIT, stated rather than faked: removal also drops the
--          protection for days BEFORE the removal, because the squad change
--          log (health_tournament_permission_changes) records before_count /
--          after_count only — it never records WHICH learner left, so a
--          per-learner removal date cannot be derived from it. Preserving
--          already-served days needs a per-learner roster log that does not
--          exist yet; that is a separate change to the health module, which
--          this migration deliberately does not touch.
--
-- WHY IT READS THE VIEW RATHER THAN RE-DERIVING "APPROVED"
-- --------------------------------------------------------
-- v_health_tournament_participation already encodes cancelled_at IS NULL AND
-- overall_status = 'approved'. Consuming it means any later change to what
-- "approved" means per college flows here for free, and there is exactly one
-- definition of an approved squad in the platform instead of two.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. fn_attendance_protected_days — the ONE answer to "was this learner's day
--    excused, and by what?". Every percentage that honours protection calls
--    this and nothing else, so the two surfaces below can never drift apart.
--
--    Sources, unioned:
--      * tournament — approved squad participation, day by day across the
--        approved range (D15/D16).
--      * onduty     — an approved full-day on-duty application from the
--        existing academic leave/on-duty module, for the applicant and for
--        every member of a team application. Partial-day on-duty
--        (forenoon / afternoon / periodwise) is deliberately NOT protected
--        here: the blob's period keys cannot be mapped to a half-day with
--        confidence, and over-crediting a percentage that decides exam
--        eligibility is the more expensive mistake.
--
--    Rows are NOT deduplicated — a day covered by both sources returns twice
--    on purpose so the caller can show every reason. Callers that count days
--    MUST dedupe on (learner_id, protected_date); both callers below do.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_attendance_protected_days(
  p_institution_ids uuid[],
  p_from date,
  p_to date
)
RETURNS TABLE(
  learner_id     uuid,
  protected_date date,
  source_kind    text,
  source_id      uuid,
  source_label   text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '10s'
AS $function$
DECLARE v_ids uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_attendance_protected_days: not authenticated';
  END IF;
  IF p_institution_ids IS NULL OR array_length(p_institution_ids, 1) IS NULL THEN
    RETURN;
  END IF;
  -- Both bounds are mandatory: an unbounded generate_series over an approval
  -- range is a trivially cheap way to make this function expensive.
  IF p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'fn_attendance_protected_days: p_from and p_to are required';
  END IF;

  -- Keep only institutions the caller may see; NULL ids dropped, because
  -- role_has_institution_access(NULL) = TRUE would leak. COALESCE on the
  -- super-admin guard: a NULL there must not fall through to the wide branch.
  IF COALESCE(public.is_super_admin(), false) THEN
    SELECT array_agg(x) INTO v_ids FROM unnest(p_institution_ids) AS x WHERE x IS NOT NULL;
  ELSE
    SELECT array_agg(x) INTO v_ids FROM unnest(p_institution_ids) AS x
    WHERE x IS NOT NULL AND public.role_has_institution_access(x);
  END IF;
  IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT v.learner_id,
         d::date AS protected_date,
         'tournament'::text AS source_kind,
         v.permission_id AS source_id,
         (v.tournament_name || ' — ' || v.sport)::text AS source_label
  FROM public.v_health_tournament_participation v
  CROSS JOIN LATERAL generate_series(
         GREATEST(v.start_date, p_from),
         LEAST(v.end_date, p_to),
         interval '1 day') AS d
  WHERE v.institution_id = ANY(v_ids)
    AND v.start_date <= p_to
    AND v.end_date   >= p_from

  UNION ALL

  SELECT m.member_id,
         d::date AS protected_date,
         'onduty'::text AS source_kind,
         a.id AS source_id,
         ('On duty — ' || a.sub_category)::text AS source_label
  FROM public.leave_onduty_applications a
  CROSS JOIN LATERAL (
         SELECT a.learner_id AS member_id
         UNION
         SELECT tm.learner_id FROM public.leave_onduty_team_members tm
         WHERE tm.application_id = a.id
       ) AS m
  CROSS JOIN LATERAL generate_series(
         GREATEST(a.start_date, p_from),
         LEAST(a.end_date, p_to),
         interval '1 day') AS d
  WHERE a.institution_id = ANY(v_ids)
    AND a.category = 'onduty'
    AND a.status = 'approved'
    AND a.period_type = 'fullday'
    AND a.start_date <= p_to
    AND a.end_date   >= p_from
    AND m.member_id IS NOT NULL;
END;
$function$;

COMMENT ON FUNCTION public.fn_attendance_protected_days(uuid[], date, date) IS
  'Days an approved tournament permission or full-day on-duty application excuses, '
  'with the source of each one. Read-time only: never writes student_attendance, so '
  'withdrawing the approval withdraws the protection. Callers dedupe on (learner_id, protected_date).';

REVOKE EXECUTE ON FUNCTION public.fn_attendance_protected_days(uuid[], date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_attendance_protected_days(uuid[], date, date) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. fn_exam_audit_attendance — the Registrar's eligibility numbers.
--    Unchanged except that it now carries the day forward through the blob walk
--    so a protected day can be matched, and reports `protected` as its own
--    column. `present` keeps its exact old meaning (days actually marked
--    present); `protected` is the excused days; `pct` is the eligibility
--    figure and counts both. Nothing is hidden: a reader can always recover the
--    old number as 100 * present / total.
--
--    ONLY days marked absent can be protected, so present + protected can never
--    exceed total and pct can never exceed 100.
--
--    `protected` is APPENDED to the end of the result columns so that any
--    positional consumer of the old six keeps working.
-- -----------------------------------------------------------------------------

-- DROP is required, not stylistic: CREATE OR REPLACE cannot add a column to an
-- existing function's return type ("cannot change return type of existing
-- function", 42P13). Dropping means the recreated function is issued Supabase's
-- default `GRANT ALL ON FUNCTIONS TO anon`, so the REVOKE below each definition
-- is what actually keeps these off the public anon key — not decoration.
DROP FUNCTION IF EXISTS public.fn_exam_audit_attendance(uuid[], date, date);

CREATE OR REPLACE FUNCTION public.fn_exam_audit_attendance(p_institution_ids uuid[], p_from date, p_to date)
 RETURNS TABLE(student_id uuid, course_id uuid, course_code text, present integer, total integer, pct numeric, protected integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '20s'
AS $function$
DECLARE v_ids uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_exam_audit_attendance: not authenticated';
  END IF;
  IF NOT (public.is_super_admin() OR public.user_has_permission('academic.internal_marks.exam_audit.view')) THEN
    RAISE EXCEPTION 'fn_exam_audit_attendance: not authorized';
  END IF;
  IF p_institution_ids IS NULL OR array_length(p_institution_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'fn_exam_audit_attendance: p_institution_ids is required';
  END IF;
  -- The window is MANDATORY: an unbounded scan of a whole college's history
  -- measured 3.7s (over the 3s budget); semester windows run 1.1-2.2s. Callers
  -- always audit a term, so force the bound rather than allow the slow path.
  IF p_from IS NULL THEN
    RAISE EXCEPTION 'fn_exam_audit_attendance: p_from is required (audit a term window)';
  END IF;

  -- Keep only ids the caller may see; NULL ids dropped
  -- (role_has_institution_access(NULL)=TRUE would leak otherwise).
  IF public.is_super_admin() THEN
    SELECT array_agg(x) INTO v_ids FROM unnest(p_institution_ids) AS x WHERE x IS NOT NULL;
  ELSE
    SELECT array_agg(x) INTO v_ids FROM unnest(p_institution_ids) AS x
    WHERE x IS NOT NULL AND public.role_has_institution_access(x);
  END IF;
  IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH periods AS (
    SELECT CASE WHEN (e.val->>'course_id') ~ '^[0-9a-fA-F-]{36}$'
                THEN (e.val->>'course_id')::uuid END AS cid,
           sa.attendance_date AS adate,
           e.val AS period
    FROM public.student_attendance sa,
         LATERAL jsonb_each(sa.attendance_data) AS e(k, val)
    WHERE sa.institution_id = ANY(v_ids)
      AND jsonb_typeof(sa.attendance_data) = 'object'
      AND (p_from IS NULL OR sa.attendance_date >= p_from)
      AND (p_to   IS NULL OR sa.attendance_date <= p_to)
  ),
  studs AS (
    SELECT p.cid, p.adate,
           (s->>'student_id')::uuid AS sid,
           CASE WHEN lower(s->>'status') = 'present' THEN 1 ELSE 0 END AS is_present
    FROM periods p,
         LATERAL jsonb_array_elements(p.period->'students') AS s
    WHERE p.period ? 'students'
      AND COALESCE(s->>'student_id','') <> ''
  ),
  -- DISTINCT is load-bearing: a day covered by both a tournament permission
  -- and an on-duty application returns twice, and joining that raw would
  -- multiply the learner's rows and inflate `total`.
  prot AS (
    SELECT DISTINCT pd.learner_id, pd.protected_date
    FROM public.fn_attendance_protected_days(v_ids, p_from, COALESCE(p_to, CURRENT_DATE)) pd
  )
  SELECT st.sid AS student_id,
         st.cid AS course_id,
         c.course_code::text AS course_code,
         SUM(st.is_present)::int AS present,
         COUNT(*)::int AS total,
         ROUND(
           100.0 * (SUM(st.is_present) + SUM(CASE WHEN st.is_present = 0 AND pr.learner_id IS NOT NULL THEN 1 ELSE 0 END))
           / NULLIF(COUNT(*), 0), 1) AS pct,
         SUM(CASE WHEN st.is_present = 0 AND pr.learner_id IS NOT NULL THEN 1 ELSE 0 END)::int AS protected
  FROM studs st
  LEFT JOIN prot pr ON pr.learner_id = st.sid AND pr.protected_date = st.adate
  LEFT JOIN public.courses c ON c.id = st.cid
  GROUP BY st.sid, st.cid, c.course_code;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_exam_audit_attendance(uuid[], date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_exam_audit_attendance(uuid[], date, date) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. fn_vsr_attendance_core — the learner's own running per-course score.
--    Updated for the SAME reason and by the SAME helper: if only the Registrar's
--    figure honoured protection, a protected learner would read "At risk" on
--    their own card while the audit called them eligible. One rule, both
--    surfaces.
--
--    Grants are deliberately NOT widened: this stays a service_role-only
--    internal helper, exactly as it is on prod today.
-- -----------------------------------------------------------------------------

-- Dropped in dependency order (the two callers first) for the same 42P13 reason.
-- plpgsql bodies are not tracked dependencies, so the callers survive the drop
-- and are republished below.
DROP FUNCTION IF EXISTS public.fn_my_running_attendance();
DROP FUNCTION IF EXISTS public.fn_vsr_attendance_core(uuid, uuid);

CREATE OR REPLACE FUNCTION public.fn_vsr_attendance_core(p_learner uuid, p_inst uuid)
 RETURNS TABLE(course_id uuid, course_code text, course_name text, present integer, total integer, pct numeric, first_session date, last_session date, protected integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '15s'
AS $function$
BEGIN
  IF p_learner IS NULL OR p_inst IS NULL THEN RETURN; END IF;
  RETURN QUERY
  WITH periods AS (
    SELECT CASE WHEN (e.val->>'course_id') ~ '^[0-9a-fA-F-]{36}$'
                THEN (e.val->>'course_id')::uuid END AS cid,
           sa.attendance_date AS ad,
           e.val AS period
    FROM public.student_attendance sa,
         LATERAL jsonb_each(sa.attendance_data) AS e(k, val)
    WHERE sa.institution_id = p_inst
      AND jsonb_typeof(sa.attendance_data) = 'object'
  ),
  mine AS (
    SELECT p.cid, p.ad,
           CASE WHEN lower(s->>'status') = 'present' THEN 1 ELSE 0 END AS is_present
    FROM periods p,
         LATERAL jsonb_array_elements(p.period->'students') AS s
    WHERE p.period ? 'students'
      AND (s->>'student_id') = p_learner::text
  ),
  -- Bounded by this learner's own record so the helper never scans wider than
  -- the rows it is about to credit. Empty record -> no protection to look up.
  bounds AS (
    SELECT MIN(ad) AS lo, MAX(ad) AS hi FROM mine
  ),
  prot AS (
    SELECT DISTINCT pd.protected_date
    FROM bounds b,
         LATERAL public.fn_attendance_protected_days(ARRAY[p_inst], b.lo, b.hi) pd
    WHERE b.lo IS NOT NULL AND pd.learner_id = p_learner
  )
  SELECT m.cid AS course_id,
         c.course_code::text,
         c.course_name::text,
         SUM(m.is_present)::int AS present,
         COUNT(*)::int AS total,
         ROUND(
           100.0 * (SUM(m.is_present) + SUM(CASE WHEN m.is_present = 0 AND pr.protected_date IS NOT NULL THEN 1 ELSE 0 END))
           / NULLIF(COUNT(*), 0), 1) AS pct,
         MIN(m.ad) AS first_session,
         MAX(m.ad) AS last_session,
         SUM(CASE WHEN m.is_present = 0 AND pr.protected_date IS NOT NULL THEN 1 ELSE 0 END)::int AS protected
  FROM mine m
  LEFT JOIN prot pr ON pr.protected_date = m.ad
  LEFT JOIN public.courses c ON c.id = m.cid
  GROUP BY m.cid, c.course_code, c.course_name
  ORDER BY pct ASC NULLS LAST;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_vsr_attendance_core(uuid, uuid) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_vsr_attendance_core(uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 4. fn_my_running_attendance — republished only because it does
--    `SELECT * FROM fn_vsr_attendance_core(...)` into its own column list, so
--    the new trailing column has to be declared here too or the call fails with
--    a structure mismatch. No behaviour of its own changes.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_my_running_attendance()
 RETURNS TABLE(course_id uuid, course_code text, course_name text, present integer, total integer, pct numeric, first_session date, last_session date, protected integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '15s'
AS $function$
DECLARE v_learner uuid; v_inst uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_my_running_attendance: not authenticated';
  END IF;
  SELECT p.learner_id, p.institution_id INTO v_learner, v_inst
  FROM public.profiles p WHERE p.id = auth.uid();
  IF v_learner IS NULL THEN RETURN; END IF;  -- not a learner: empty, not an error

  RETURN QUERY SELECT * FROM public.fn_vsr_attendance_core(v_learner, v_inst);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_my_running_attendance() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_my_running_attendance() TO authenticated;
