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
-- v_health_tournament_participation is the single definition of an approved
-- squad. Consuming it means any later change to what "approved" means per
-- college flows here for free, instead of a second opinion drifting apart from
-- the first. That is not hypothetical: #2682 landed while this change was open
-- and moved the view's gate from the trip-wide `overall_status = 'approved'` to
-- the learner's OWN college's approval row, so a partly-approved trip now
-- protects the approving colleges' learners and not the refusing college's.
-- Nothing here needed to change for that, which is the point — and it is the
-- behaviour the Principal's letter actually describes, since only a learner's
-- own Principal can excuse their attendance. Re-verified against the merged
-- definition: every column this file reads (permission_id, tournament_name,
-- sport, start_date, end_date, learner_id, institution_id) survives #2682, and
-- institution_id is still the LEARNER's college (learners_profiles.institution_id),
-- never the new host_institution — which is what the institution filter below
-- must be, because protection belongs to the college that sent the learner.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. fn_attendance_protected_days — the ONE answer to "was this learner's day
--    excused, and by what?". Every percentage that honours protection resolves
--    through the single _core query below and nothing else, so the two surfaces
--    further down can never drift apart.
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
--
--    IT IS SPLIT IN TWO, and the split is load-bearing:
--
--      * _core — the query. NO authorization of its own, therefore NO grants
--        (definer-chain only, the same convention the fn_vsr_*_core helpers in
--        20260715070000 already use). It scopes to one learner when asked.
--      * the public wrapper — authorization only, and the ONLY granted surface.
--
--    Why not one function that authorizes from auth.uid(): because a legitimate
--    caller in this chain has no auth.uid() at all. fn_vsr_shared_record is the
--    module's ONE deliberate anon surface — a local employer opening a learner's
--    verify-link with no account — and it reaches this code through
--    fn_vsr_record_core -> fn_vsr_attendance_core. SECURITY DEFINER changes the
--    ROLE, never the JWT, so auth.uid() is NULL for the whole of that chain.
--    Proven on prod 2026-07-31 inside BEGIN..ROLLBACK: with anon-shaped claims
--    fn_vsr_attendance_core returned 26 rows before this migration and raised
--    'fn_attendance_protected_days: not authenticated' after an earlier draft of
--    it — i.e. a single auth.uid() guard in the shared helper takes out a live
--    public page. The wrapper keeps the guard where a caller really is a
--    request; the core is scoped by ARGUMENT where the caller was already
--    authorized upstream by a share token.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_attendance_protected_days_core(
  p_institution_ids uuid[],
  p_from date,
  p_to date,
  p_learner uuid DEFAULT NULL
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
BEGIN
  -- No caller check here BY DESIGN — see the header. This function is reachable
  -- only from a SECURITY DEFINER caller that has already decided who is asking,
  -- which the empty grant list below is what enforces.
  IF p_institution_ids IS NULL OR array_length(p_institution_ids, 1) IS NULL THEN
    RETURN;
  END IF;
  -- Both bounds are mandatory: an unbounded generate_series over an approval
  -- range is a trivially cheap way to make this function expensive.
  IF p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'fn_attendance_protected_days_core: p_from and p_to are required';
  END IF;

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
  WHERE v.institution_id = ANY(p_institution_ids)
    AND v.start_date <= p_to
    AND v.end_date   >= p_from
    AND (p_learner IS NULL OR v.learner_id = p_learner)

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
  -- A team member is only credited inside the institution the application was
  -- filed under. Without this join, auditing two colleges together
  -- (p_institution_ids = [X, Y]) would let an application filed under X excuse a
  -- learner of Y — cross-tenant credit that would surface only in a combined audit.
  JOIN public.learners_profiles mlp
    ON mlp.id = m.member_id
   AND mlp.institution_id = a.institution_id
  CROSS JOIN LATERAL generate_series(
         GREATEST(a.start_date, p_from),
         LEAST(a.end_date, p_to),
         interval '1 day') AS d
  WHERE a.institution_id = ANY(p_institution_ids)
    AND a.category = 'onduty'
    AND a.status = 'approved'
    AND a.period_type = 'fullday'
    AND a.start_date <= p_to
    AND a.end_date   >= p_from
    AND m.member_id IS NOT NULL
    AND (p_learner IS NULL OR m.member_id = p_learner);
END;
$function$;

COMMENT ON FUNCTION public.fn_attendance_protected_days_core(uuid[], date, date, uuid) IS
  'Unauthorized core of the protected-day lookup: scoped by ARGUMENT, not by caller. '
  'Deliberately carries NO grants — reachable only through a SECURITY DEFINER caller '
  'that has already established who is asking (fn_attendance_protected_days for a live '
  'request, fn_vsr_attendance_core for a share-token-authorized read).';

-- A brand-new function is issued Supabase's default `GRANT ALL ON FUNCTIONS TO
-- anon` (and authenticated), so this REVOKE is what actually keeps the core off
-- the public anon key — not decoration. REVOKE first, and nothing is granted
-- back: the definer chain does not need a grant, the function owner always may
-- execute. Verified live after applying: acl shows postgres only.
REVOKE EXECUTE ON FUNCTION public.fn_attendance_protected_days_core(uuid[], date, date, uuid)
  FROM anon, authenticated, PUBLIC;

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
DECLARE v_ids uuid[]; v_privileged boolean; v_self uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_attendance_protected_days: not authenticated';
  END IF;
  IF p_institution_ids IS NULL OR array_length(p_institution_ids, 1) IS NULL THEN
    RETURN;
  END IF;
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

  -- Passing the institution gate is NOT enough to read the whole college's
  -- squads. Verified on prod 2026-07-31 against a real learner: role 'student',
  -- role_has_institution_access(own institution) = TRUE, but
  -- academic.attendance.view = FALSE and exam_audit.view = FALSE. Without the
  -- self-scope below, that learner could call this RPC with the public anon
  -- key's authenticated session and enumerate every squad roster and every
  -- on-duty application in their college — the caller-identity IDOR shape this
  -- repo has already had to sweep out of 75 functions. Measured, not asserted:
  -- before this scope existed the peer learner got back 4 rows belonging to a
  -- learner who is not them; after it, 0.
  --
  -- Privileged callers (the Registrar's audit, attendance staff) see everyone in
  -- scope; everyone else sees only their own days. COALESCE on each permission
  -- read so a NULL cannot make `v_privileged` NULL, which `IF NOT v_privileged`
  -- would then skip — leaving v_self NULL and silently returning nothing to a
  -- caller who was entitled to an answer.
  v_privileged := COALESCE(public.is_super_admin(), false)
               OR COALESCE(public.user_has_permission('academic.attendance.view'), false)
               OR COALESCE(public.user_has_permission('academic.internal_marks.exam_audit.view'), false);
  IF NOT v_privileged THEN
    SELECT p.learner_id INTO v_self FROM public.profiles p WHERE p.id = auth.uid();
    IF v_self IS NULL THEN RETURN; END IF;  -- not a learner, no permission: nothing to show
  END IF;

  RETURN QUERY
  SELECT * FROM public.fn_attendance_protected_days_core(
                  v_ids, p_from, p_to,
                  CASE WHEN v_privileged THEN NULL ELSE v_self END);
END;
$function$;

COMMENT ON FUNCTION public.fn_attendance_protected_days(uuid[], date, date) IS
  'Days an approved tournament permission or full-day on-duty application excuses, '
  'with the source of each one. Authorizing wrapper: institution-scoped for every caller, '
  'and self-scoped for a caller who holds neither academic.attendance.view nor '
  'academic.internal_marks.exam_audit.view. Read-time only: never writes student_attendance, '
  'so withdrawing the approval withdraws the protection. Callers dedupe on (learner_id, protected_date).';

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
DECLARE v_ids uuid[]; v_to date;
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

  -- ONE upper bound for both the attendance scan and the protection lookup.
  -- Previously the scan was unbounded when p_to was NULL while protection
  -- stopped at CURRENT_DATE, so a day past the boundary could be counted into
  -- `total` but was never eligible for credit — an asymmetry that can only ever
  -- push a percentage down.
  --
  -- CHOICE: clamp BOTH windows to the same bound, rather than forbid a NULL
  -- p_to the way p_from is forbidden. Both close the gap; clamping keeps the
  -- function callable the way its signature already advertises (p_to optional)
  -- and cannot break a caller that omits it, whereas raising would convert a
  -- today-benign call into a hard error. Both API routes pass p_to today, so
  -- neither choice changes live behaviour — this is about the next caller.
  v_to := COALESCE(p_to, CURRENT_DATE);

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
      AND sa.attendance_date >= p_from
      AND sa.attendance_date <= v_to
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
    FROM public.fn_attendance_protected_days(v_ids, p_from, v_to) pd
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
  -- Bounds are COALESCEd rather than filtered: the lookup RAISEs on a NULL
  -- window, and relying on `WHERE b.lo IS NOT NULL` to dodge that only works
  -- while the planner pushes the qual below the LATERAL. A learner with no
  -- attendance rows now asks a harmless one-day question and joins to nothing,
  -- instead of depending on a plan shape. Verified live: 0 rows, no exception.
  --
  -- The _core is called, NOT the public wrapper: this function is already given
  -- its learner as an argument, and its callers include fn_vsr_record_core,
  -- which fn_vsr_shared_record reaches with NO auth.uid() at all (the module's
  -- one deliberate anon surface — a share link opened by an employer with no
  -- account). Going through the wrapper would raise 'not authenticated' there
  -- and take that page down; proven on prod inside BEGIN..ROLLBACK. Scope is
  -- therefore carried by the p_learner ARGUMENT, which is strictly narrower than
  -- the wrapper's self-scope and cannot widen: the extra WHERE below is kept as
  -- a second, independent bound so that dropping the argument by accident still
  -- fails closed.
  prot AS (
    SELECT DISTINCT pd.protected_date
    FROM bounds b,
         LATERAL public.fn_attendance_protected_days_core(
                   ARRAY[p_inst],
                   COALESCE(b.lo, CURRENT_DATE),
                   COALESCE(b.hi, CURRENT_DATE),
                   p_learner) pd
    WHERE pd.learner_id = p_learner
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
