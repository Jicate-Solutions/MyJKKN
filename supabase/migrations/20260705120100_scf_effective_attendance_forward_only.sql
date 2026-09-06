-- =====================================================================
-- Faculty-feedback exam-link — FORWARD-ONLY floor on effective-attendance (Build 2a)
-- Date: 2026-07-05  Spec: specs/faculty-feedback-exam-link-2026-07-05.md
-- Adds the forward-only floor (Director decision #4) to fn_scf_effective_attendance:
-- pre-enforcement-start marks never dilute the confirmed-attendance eligibility %.
-- Depends on session_feedback.enforcement_start_date (seeded in Build 1).
-- Additive + idempotent (CREATE OR REPLACE). Function stays server-side dark-gated
-- (returns 0 rows unless attendance_coupling_enabled) and NEVER mutates attendance.
-- =====================================================================
BEGIN;
CREATE OR REPLACE FUNCTION public.fn_scf_effective_attendance(p_from date, p_to date, p_institution_id uuid DEFAULT NULL::uuid, p_program_id uuid DEFAULT NULL::uuid, p_department_id uuid DEFAULT NULL::uuid, p_section_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(student_id uuid, present_marks bigint, absent_marks bigint, confirmed_present bigint, official_pct numeric, effective_pct numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '20s'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_effective_attendance: not authenticated'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('academic.attendance.dashboard.view')) THEN
    RAISE EXCEPTION 'fn_scf_effective_attendance: not authorized';
  END IF;

  -- Server-side compliance gate (defense in depth). The coupling is DARK by default and
  -- must stay inert until a super-admin flips session_feedback.attendance_coupling_enabled
  -- AND legal/compliance sign-off (spec R2). The service layer already checks this flag,
  -- but re-check it HERE so the derived effective-% can NEVER be computed by a direct RPC
  -- call that bypasses the service. When OFF: return zero rows, compute/touch nothing.
  -- Resolves the institution override (p_institution_id) -> global -> default FALSE.
  IF NOT public.fn_get_policy_bool(
       'session_feedback.attendance_coupling_enabled', false, p_institution_id) THEN
    RETURN;
  END IF;

  -- Forward-only floor (Director 2026-07-05): never count marks before the enforcement
  -- start date, so pre-rule attendance can't dilute the confirmed-attendance %. Mirrors
  -- fn_scf_faculty_completion. Institution override -> global -> default '2026-07-05'.
  p_from := GREATEST(p_from, COALESCE(NULLIF(public.fn_get_policy_text(
              'session_feedback.enforcement_start_date','2026-07-05', p_institution_id),'')::date,
              '2026-07-05'::date));

  RETURN QUERY
  WITH marks AS (
    SELECT
      (st ->> 'student_id')::uuid AS sid,
      sa.attendance_date,
      sa.timetable_id             AS timetable_id,
      period.key                  AS period_id,
      (st ->> 'status')           AS status
    FROM public.student_attendance sa
    CROSS JOIN LATERAL jsonb_each(
      CASE WHEN jsonb_typeof(sa.attendance_data) = 'object'
           THEN sa.attendance_data ELSE '{}'::jsonb END) AS period
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(period.value -> 'students') = 'array'
           THEN period.value -> 'students' ELSE '[]'::jsonb END) AS st
    WHERE sa.attendance_date BETWEEN p_from AND p_to
      AND (st ->> 'status') IN ('Present', 'Absent')
      AND (st ->> 'student_id') ~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      AND (p_institution_id IS NULL OR sa.institution_id = p_institution_id)
      AND (p_program_id     IS NULL OR sa.program_id     = p_program_id)
      AND (p_department_id  IS NULL OR sa.department_id  = p_department_id)
      AND (p_section_id     IS NULL OR sa.section_id     = p_section_id)
      -- Same scope-honest guard as fn_scf_confirmation_rollup (no is_admin() bypass
      -- of institution_scope): super_admin sees all, everyone else is bounded by
      -- role_has_institution_access.
      AND (is_super_admin() OR role_has_institution_access(sa.institution_id))
  ),
  -- One mark per (learner, date, timetable, period); prefer Present on the rare
  -- dual-row tuple. timetable_id is IN the key so two distinct classes that share a
  -- period key on the same date do NOT collapse into one mark (which would skew both
  -- official_pct and effective_pct).
  dedup AS (
    SELECT DISTINCT ON (sid, attendance_date, timetable_id, period_id)
      sid, attendance_date, timetable_id, period_id, status
    FROM marks
    ORDER BY sid, attendance_date, timetable_id, period_id, (status = 'Present') DESC
  ),
  agg AS (
    SELECT
      d.sid,
      count(*) FILTER (WHERE d.status = 'Present') AS present_marks,
      count(*) FILTER (WHERE d.status = 'Absent')  AS absent_marks,
      count(*) FILTER (WHERE d.status = 'Present' AND EXISTS (
        SELECT 1 FROM public.session_feedback f
        WHERE f.student_id      = d.sid
          AND f.attendance_date = d.attendance_date
          AND f.period_id       = d.period_id
          -- Match the confirmation on the full session identity (session_feedback.
          -- timetable_id is NOT NULL) so feedback for a different class sharing the
          -- same period slot cannot inflate confirmed_present.
          AND f.timetable_id    = d.timetable_id
      )) AS confirmed_present
    FROM dedup d
    GROUP BY d.sid
  )
  SELECT
    a.sid,
    a.present_marks::bigint,
    a.absent_marks::bigint,
    a.confirmed_present::bigint,
    CASE WHEN (a.present_marks + a.absent_marks) = 0 THEN 0
         ELSE round(a.present_marks::numeric
                    / (a.present_marks + a.absent_marks) * 100, 2) END,
    CASE WHEN (a.present_marks + a.absent_marks) = 0 THEN 0
         ELSE round(a.confirmed_present::numeric
                    / (a.present_marks + a.absent_marks) * 100, 2) END
  FROM agg a;
END;
$function$
;
COMMIT;

-- Explicit anon-lock (CLAUDE.md standing rule; idempotent for CREATE OR REPLACE — the
-- live fn is already anon-locked, this keeps the migration file self-documenting + green).
REVOKE EXECUTE ON FUNCTION public.fn_scf_effective_attendance(date, date, uuid, uuid, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_effective_attendance(date, date, uuid, uuid, uuid, uuid) TO authenticated;
