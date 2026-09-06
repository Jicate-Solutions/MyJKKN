-- 2026-07-13 · Exam IA Audit — "is the internal assessment as per JKKN data or
-- some other data?" (Director, 2026-07-13; Registrar is the in-person auditor)
--
-- Context (proven from COE prod data 2026-07-13, APRIL-MAY-2026 cycle sample):
-- CIA marks are bulk-entered by 4 operator accounts (faculty_id empty on every
-- row), 99.8% of sampled rows on ONE day, round 1 only, attendance component
-- blank, nothing verified/approved. Colleges submit semester attendance to the
-- university from MANUAL registers. This audit page joins COE (what goes to
-- the university) against MyJKKN's continuous day-one data (student_attendance)
-- so the Registrar can walk into a department with the JKKN numbers in hand.
--
-- NEW KEY (registered in lib/constants/permissions.ts):
--   academic.internal_marks.exam_audit.view — seeded super_admin,
--   administrator, principal (own college), ceo, executive_admin_officer,
--   registrar (scope='all' — audits every college in person). HoDs excluded
--   (Director audience decision 2026-07-13). Grantable later via Role Mgmt.
--
-- COE reads happen server-side in the API routes (service creds, server-only);
-- these fns are the MyJKKN-side gate + attendance calculators.

-- ---------------------------------------------------------------------------
-- 1. Seed
-- ---------------------------------------------------------------------------

UPDATE public.custom_roles
SET permissions = permissions || '{"academic.internal_marks.exam_audit.view": true}'::jsonb,
    updated_at  = now()
WHERE role_key IN ('super_admin','administrator','principal','ceo','executive_admin_officer','registrar')
  AND COALESCE(permissions->>'academic.internal_marks.exam_audit.view','false') <> 'true';

-- ---------------------------------------------------------------------------
-- 2. fn_exam_audit_access — the single authority the audit API routes call.
--    Returns whether the caller may see the audit at all, and which MyJKKN
--    institutions they may see (NULL array = super admin = all).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_exam_audit_access()
 RETURNS TABLE(allowed boolean, is_super boolean, institution_ids uuid[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_super boolean; v_ids uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN QUERY SELECT false, false, NULL::uuid[]; RETURN;
  END IF;
  v_super := public.is_super_admin();
  IF NOT (v_super OR public.user_has_permission('academic.internal_marks.exam_audit.view')) THEN
    RETURN QUERY SELECT false, false, NULL::uuid[]; RETURN;
  END IF;
  IF v_super THEN
    RETURN QUERY SELECT true, true, NULL::uuid[]; RETURN;
  END IF;
  -- Tenant scope hoisted ONCE (never per-row): scope='all' roles (registrar/
  -- ceo/eao/administrator) get every institution; principals get their own.
  SELECT array_agg(i.id) INTO v_ids
  FROM public.institutions i WHERE public.role_has_institution_access(i.id);
  RETURN QUERY SELECT (v_ids IS NOT NULL), false, v_ids;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_exam_audit_access() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_exam_audit_access() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. fn_exam_audit_attendance — per (student × course) continuous attendance
--    from the day-one record. The Registrar's walk-sheet numbers: what JKKN
--    data says, held against the manual register. Same blob walk as the
--    proven fn_student_attendance_pct, grouped by the period's course_id and
--    bridged to courses.course_code (COE-mirrored; blob course_code is stale).
--    Institution filter applied BEFORE the jsonb explosion (perf discipline).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_exam_audit_attendance(p_institution_ids uuid[], p_from date, p_to date)
 RETURNS TABLE(student_id uuid, course_id uuid, course_code text, present integer, total integer, pct numeric)
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
           e.val AS period
    FROM public.student_attendance sa,
         LATERAL jsonb_each(sa.attendance_data) AS e(k, val)
    WHERE sa.institution_id = ANY(v_ids)
      AND jsonb_typeof(sa.attendance_data) = 'object'
      AND (p_from IS NULL OR sa.attendance_date >= p_from)
      AND (p_to   IS NULL OR sa.attendance_date <= p_to)
  ),
  studs AS (
    SELECT p.cid,
           (s->>'student_id')::uuid AS sid,
           CASE WHEN lower(s->>'status') = 'present' THEN 1 ELSE 0 END AS is_present
    FROM periods p,
         LATERAL jsonb_array_elements(p.period->'students') AS s
    WHERE p.period ? 'students'
      AND COALESCE(s->>'student_id','') <> ''
  )
  SELECT st.sid AS student_id,
         st.cid AS course_id,
         c.course_code::text AS course_code,
         SUM(st.is_present)::int AS present,
         COUNT(*)::int AS total,
         ROUND(100.0 * SUM(st.is_present) / NULLIF(COUNT(*), 0), 1) AS pct
  FROM studs st
  LEFT JOIN public.courses c ON c.id = st.cid
  GROUP BY st.sid, st.cid, c.course_code;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_exam_audit_attendance(uuid[], date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_exam_audit_attendance(uuid[], date, date) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. fn_my_running_attendance — the learner's own "you start at 100/100 and
--    watch it come down" transparency score (Director decision 2026-07-13:
--    ship WITH the audit). Self-scoped: profiles.learner_id of auth.uid()
--    only; staff/callers without a learner row get zero rows. Per-course
--    running present/total/% from day one — the same figures the audit page
--    and (one day) the university submission are held against.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_my_running_attendance()
 RETURNS TABLE(course_id uuid, course_code text, course_name text, present integer, total integer, pct numeric, first_session date, last_session date)
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

  RETURN QUERY
  WITH periods AS (
    SELECT CASE WHEN (e.val->>'course_id') ~ '^[0-9a-fA-F-]{36}$'
                THEN (e.val->>'course_id')::uuid END AS cid,
           sa.attendance_date AS ad,
           e.val AS period
    FROM public.student_attendance sa,
         LATERAL jsonb_each(sa.attendance_data) AS e(k, val)
    WHERE sa.institution_id = v_inst
      AND jsonb_typeof(sa.attendance_data) = 'object'
  ),
  mine AS (
    SELECT p.cid, p.ad,
           CASE WHEN lower(s->>'status') = 'present' THEN 1 ELSE 0 END AS is_present
    FROM periods p,
         LATERAL jsonb_array_elements(p.period->'students') AS s
    WHERE p.period ? 'students'
      AND (s->>'student_id') = v_learner::text
  )
  SELECT m.cid AS course_id,
         c.course_code::text,
         c.course_name::text,
         SUM(m.is_present)::int AS present,
         COUNT(*)::int AS total,
         ROUND(100.0 * SUM(m.is_present) / NULLIF(COUNT(*), 0), 1) AS pct,
         MIN(m.ad) AS first_session,
         MAX(m.ad) AS last_session
  FROM mine m
  LEFT JOIN public.courses c ON c.id = m.cid
  GROUP BY m.cid, c.course_code, c.course_name
  ORDER BY pct ASC NULLS LAST;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_my_running_attendance() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_my_running_attendance() TO authenticated;

NOTIFY pgrst, 'reload schema';
