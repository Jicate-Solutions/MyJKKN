-- 2026-07-05 — Faculty-feedback → exam-eligibility, round-3 refinements #10/#11/#12
-- folded into fn_scf_effective_attendance. Applied live via Mgmt API; forward record.
--   #10 outage : outage-window marks dropped from BOTH present and absent.
--   #11 48h    : confirmed_present counts only within-window feedback (IST-midnight anchor).
--   #12 OD/leave: approved-leave/OD marks dropped from BOTH sides of the denominator.
-- Forward-only floor + dark coupling gate + scope-honest guard preserved from 20260705120100.
-- Depends on scf_outage_days (migration 20260705130000).

CREATE OR REPLACE FUNCTION public.fn_scf_effective_attendance(p_from date, p_to date, p_institution_id uuid DEFAULT NULL::uuid, p_program_id uuid DEFAULT NULL::uuid, p_department_id uuid DEFAULT NULL::uuid, p_section_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(student_id uuid, present_marks bigint, absent_marks bigint, confirmed_present bigint, official_pct numeric, effective_pct numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '20s'
AS $function$
DECLARE v_window_hours integer;
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

  -- Late-feedback window (decision #11): a confirmation counts only if submitted within
  -- window_hours of the class. Reuses the SAME session_feedback.window_hours lever the
  -- faculty completion window uses (default 48), so "within window" means one thing
  -- everywhere. Resolved once for the query's institution scope.
  v_window_hours := public.fn_get_policy_int('session_feedback.window_hours', 48, p_institution_id);

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
      -- Decision #10 (outage): drop marks on a super-admin-declared feedback outage
      -- (date [, institution][, period]) from BOTH present and absent counts.
      AND NOT EXISTS (
        SELECT 1 FROM public.scf_outage_days o
        WHERE o.outage_date = sa.attendance_date
          AND (o.institution_id IS NULL OR o.institution_id = sa.institution_id)
          AND (o.period_id      IS NULL OR o.period_id      = period.key))
      -- Decision #12 (approved leave/OD): drop marks that have an approved OD/leave
      -- adjustment (leave_onduty_attendance_updates) from BOTH sides of the denominator,
      -- so a legitimately-excused learner is never penalised for not confirming.
      AND NOT EXISTS (
        SELECT 1 FROM public.leave_onduty_attendance_updates lou
        WHERE lou.attendance_record_id = sa.id
          AND lou.student_id::text     = (st ->> 'student_id')
          AND lou.period_slot_id       = period.key)
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
          -- Decision #11: only feedback submitted within window_hours of the class
          -- (class day interpreted at IST midnight, mirroring fn_scf_faculty_completion)
          -- counts as a confirmation. A late confirmation still exists but no longer
          -- credits attendance.
          AND f.created_at <= ((d.attendance_date::timestamp AT TIME ZONE 'Asia/Kolkata')
                               + make_interval(hours => v_window_hours))
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

-- Explicit anon-lock (CLAUDE.md standing rule; idempotent for CREATE OR REPLACE — the
-- live fn is already anon-locked, this keeps the migration file self-documenting + green).
REVOKE EXECUTE ON FUNCTION public.fn_scf_effective_attendance(date, date, uuid, uuid, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_effective_attendance(date, date, uuid, uuid, uuid, uuid) TO authenticated;
