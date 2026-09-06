-- Migration: 20260703131000_scf_faculty_summary_key_by_identity.sql
-- Purpose : Fix fn_scf_admin_faculty_summary so faculty are keyed by IDENTITY, not by the
--           raw feedback email. Root cause: session_feedback.faculty_email is denormalized out
--           of the timetable attendance blob and is frequently a personal @gmail.com address, so
--           the old "GROUP BY faculty_email" split one real person across two rows (e.g.
--           dharshinidevi@jkkn.ac.in vs mdharshini02@gmail.com) and surfaced personal gmails +
--           a seeded test account at the top of the leadership "needs support" ranking.
--
-- Fix     : Resolve each feedback row's DISPLAY identity to the person's institutional email:
--             tier 1  staff.institution_email via staff.id = session_feedback.faculty_id  (stable
--                     staff id; 95.7% populated overall, 100% on gmail rows, 0 orphans)
--             tier 2  staff.institution_email via lower(staff.email) = lower(faculty_email)  (safety net)
--             tier 3  raw faculty_email  (true orphans only)
--           then GROUP BY that resolved email so the personal-gmail and institutional halves of the
--           same person MERGE. Scalar subqueries with LIMIT 1 guarantee a non-unique staff.email can
--           never fan out the feedback rows.
--
-- Preserved unchanged: RETURNS TABLE shape (column names/types/order incl. the `faculty_email`
--           output column, whose VALUE is now the resolved institutional email), the k>=3
--           response floor, low_sessions logic, authz guard, SECURITY DEFINER + search_path,
--           ORDER BY, and the anon/PUBLIC lockdown.
--
-- Safety  : Idempotent (CREATE OR REPLACE + explicit REVOKE/GRANT). No data is modified; this only
--           changes how existing session_feedback rows are aggregated for the two admin consumers
--           (/academic/session-feedback/admin and the attendance-dashboard feedback-confirmation tab).
--           No consumer code change is required because the RETURNS TABLE shape is byte-identical.
--
-- Rehearsed rolled-back as super_admin over 2026-06-01..2026-07-31 (prod, kvizhngldtiuufknvehv):
--           distinct faculty 48 -> 45; all 11 personal gmails eliminated; Dharshini's 2 rows
--           collapse to 1 (responses 52 = 10+42); 34 unaffected faculty byte-identical. ROLLBACK.

CREATE OR REPLACE FUNCTION public.fn_scf_admin_faculty_summary(p_from date, p_to date)
 RETURNS TABLE(institution_id uuid, institution_name text, faculty_email text, sessions bigint, responses bigint, avg_understood numeric, low_sessions bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_inst uuid; v_super boolean; v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_admin_faculty_summary: not authenticated'; END IF;
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (p.role = ANY (ARRAY['super_admin','administrator','institution_admin','dean','hod','principal','coordinator']) OR p.is_super_admin = true)
    INTO v_inst, v_super, v_allowed
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_admin_faculty_summary: not authorized';
  END IF;

  RETURN QUERY
  WITH fb AS (
    -- Resolve each feedback row's DISPLAY identity to the institutional email so the
    -- personal-gmail and institutional halves of the same person merge. Identity key is
    -- faculty_id first (stable staff id), then staff.email = faculty_email; institution_email
    -- is the canonical display. Scalar subqueries (LIMIT 1) so a non-unique staff.email can
    -- never fan out the feedback rows. Fallback = raw faculty_email for true orphans.
    SELECT f.institution_id AS inst_id,
           f.attendance_date, f.period_id, f.course_code,
           f.understood,
           COALESCE(
             (SELECT s.institution_email FROM public.staff s
               WHERE s.id = f.faculty_id
                 AND NULLIF(btrim(s.institution_email), '') IS NOT NULL
               LIMIT 1),
             (SELECT s.institution_email FROM public.staff s
               WHERE lower(s.email) = lower(f.faculty_email)
                 AND NULLIF(btrim(s.institution_email), '') IS NOT NULL
               LIMIT 1),
             f.faculty_email
           ) AS resolved_email
    FROM public.session_feedback f
    WHERE (v_super OR f.institution_id = v_inst)
      AND f.attendance_date BETWEEN p_from AND p_to
  ),
  per_session AS (
    SELECT fb.inst_id,
           fb.resolved_email,
           fb.attendance_date, fb.period_id, fb.course_code,
           count(*)::bigint           AS s_responses,
           avg(fb.understood)::numeric AS s_avg
    FROM fb
    GROUP BY fb.inst_id, fb.resolved_email, fb.attendance_date, fb.period_id, fb.course_code
  )
  SELECT ps.inst_id AS institution_id,
         i.name::text AS institution_name,
         ps.resolved_email AS faculty_email,
         count(*)::bigint                                                   AS sessions,
         sum(ps.s_responses)::bigint                                        AS responses,
         -- k>=3 floor: average only over sessions with >= 3 responses, so a small
         -- (<3) session's value can never surface as an individual rating. NULL
         -- when the faculty has no >=3-response session (insufficient data).
         round((sum(ps.s_avg * ps.s_responses) FILTER (WHERE ps.s_responses >= 3)
              / NULLIF(sum(ps.s_responses) FILTER (WHERE ps.s_responses >= 3), 0))::numeric, 2) AS avg_understood,
         count(*) FILTER (WHERE ps.s_responses >= 3 AND ps.s_avg < 3)::bigint AS low_sessions
  FROM per_session ps
  LEFT JOIN public.institutions i ON i.id = ps.inst_id
  GROUP BY ps.inst_id, i.name, ps.resolved_email
  ORDER BY avg_understood ASC NULLS LAST;
END;
$function$;

-- Anon lockdown (mandatory for every RPC; CREATE OR REPLACE preserves the prior ACL,
-- these statements make the locked-down state explicit and idempotent).
REVOKE EXECUTE ON FUNCTION public.fn_scf_admin_faculty_summary(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_admin_faculty_summary(date, date) TO authenticated;
