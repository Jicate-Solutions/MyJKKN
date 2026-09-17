-- ============================================================================
-- 2026-09-16 — gate_in_out_report / gate_search_people: explicit ::text casts
--
-- ⚠️ NOT APPLIED — FILE ONLY. Apply after 20260916110000.
--
-- "structure of query does not match function result type": the source
-- columns are varchar (roll_number, staff_id, department_name, designation,
-- full_name, …) while the functions declare text. RETURN QUERY requires an
-- exact type match, so every text output is cast. The two source migrations
-- in the repo carry the same casts for fresh databases.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- 3f. gate_in_out_report — staff reason falls back to the pass
-- ────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.gate_in_out_report(date, date, text, uuid, uuid, text);
CREATE OR REPLACE FUNCTION public.gate_in_out_report(
  p_from date, p_to date, p_person_type text DEFAULT NULL,
  p_institution_id uuid DEFAULT NULL, p_department_id uuid DEFAULT NULL, p_state text DEFAULT NULL
)
RETURNS TABLE (
  person_type text, person_name text, code text, department text, designation text,
  institution_id uuid, gate_pass_id uuid, pass_number text, pass_status text, reason text,
  approved_by text, out_time timestamptz, in_time timestamptz, movement_date date,
  current_status text, movement_id uuid, reason_updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_super_admin() OR public.user_has_permission('gate_security.reports.view')) THEN
    RAISE EXCEPTION 'gate: not authorized to view reports' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT 'learner'::text,
         COALESCE(NULLIF(trim(concat_ws(' ', lp.first_name, lp.last_name)), ''), p.full_name)::text,
         COALESCE(lp.register_number, lp.roll_number)::text,
         d.department_name::text, NULL::text,
         gp.institution_id, gp.id, gp.pass_number::text, gp.status::text, COALESCE(gp.reason, gp.destination)::text,
         ap.full_name::text, gp.out_time, gp.actual_return,
         COALESCE(gp.valid_date, (timezone('Asia/Kolkata', COALESCE(gp.out_time, gp.approved_at, gp.created_at)))::date),
         (CASE gp.status::text WHEN 'active' THEN 'Outside' WHEN 'overdue' THEN 'Outside (late)'
              WHEN 'returned' THEN 'Completed' WHEN 'issued' THEN 'Approved' ELSE initcap(gp.status::text) END)::text,
         NULL::uuid, NULL::timestamptz
    FROM public.hostel_gate_passes gp
    JOIN public.profiles p ON p.id = gp.learner_id
    LEFT JOIN public.learners_profiles lp ON lp.id = p.learner_id
    LEFT JOIN public.departments d ON d.id = lp.department_id
    LEFT JOIN public.profiles ap ON ap.id = gp.approved_by
   WHERE (p_person_type IS NULL OR p_person_type = 'learner')
     AND COALESCE(gp.valid_date, (timezone('Asia/Kolkata', COALESCE(gp.out_time, gp.approved_at, gp.created_at)))::date) BETWEEN p_from AND p_to
     AND gp.status::text NOT IN ('requested', 'rejected')
     AND (p_institution_id IS NULL OR gp.institution_id = p_institution_id)
     AND (p_department_id IS NULL OR lp.department_id = p_department_id)
     AND (p_state IS NULL
          OR (p_state = 'outside'   AND gp.status::text IN ('active', 'overdue'))
          OR (p_state = 'completed' AND gp.status::text = 'returned'))
  UNION ALL
  SELECT 'staff'::text,
         trim(concat_ws(' ', s.first_name, s.last_name))::text, s.staff_id::text,
         d.department_name::text, s.designation::text,
         m.institution_id, NULL::uuid, sp.pass_number::text, sp.status::text, COALESCE(m.reason, sp.reason)::text,
         NULL::text,
         CASE WHEN m.direction = 'out' THEN m.recorded_at END,
         CASE WHEN m.direction = 'in'  THEN m.recorded_at END,
         m.movement_date,
         (CASE WHEN last_m.direction = 'out' THEN 'Outside' ELSE 'Inside' END)::text,
         m.id, m.reason_updated_at
    FROM public.gate_movements m
    JOIN public.staff s ON s.id = m.staff_id
    LEFT JOIN public.gate_staff_passes sp ON sp.id = m.staff_pass_id
    LEFT JOIN public.departments d ON d.id = s.department_id
    LEFT JOIN LATERAL (
      SELECT direction FROM public.gate_movements x
       WHERE x.staff_id = m.staff_id AND x.movement_date = m.movement_date
       ORDER BY x.recorded_at DESC LIMIT 1
    ) last_m ON true
   WHERE m.person_type = 'staff'
     AND (p_person_type IS NULL OR p_person_type = 'staff')
     AND m.movement_date BETWEEN p_from AND p_to
     AND (p_institution_id IS NULL OR m.institution_id = p_institution_id)
     AND (p_department_id IS NULL OR s.department_id = p_department_id)
     AND (p_state IS NULL
          OR (p_state = 'outside'   AND last_m.direction = 'out')
          OR (p_state = 'completed' AND last_m.direction = 'in'))
  ORDER BY 14 DESC, 12 DESC NULLS LAST, 13 DESC NULLS LAST;
END;
$$;
REVOKE ALL ON FUNCTION public.gate_in_out_report(date, date, text, uuid, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.gate_in_out_report(date, date, text, uuid, uuid, text) TO authenticated;


-- ────────────────────────────────────────────────────────────────────────
-- 5f. gate_search_people — the security search bar (§4)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.gate_search_people(p_query text, p_limit int DEFAULT 12)
RETURNS TABLE (
  person_type text, profile_id uuid, learner_profile_id uuid, staff_id uuid,
  full_name text, code text, email text, photo_url text, subtitle text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_q text := trim(COALESCE(p_query, '')); v_like text;
BEGIN
  IF NOT public.gate_can_scan() THEN
    RAISE EXCEPTION 'gate: not authorized' USING ERRCODE = '42501';
  END IF;
  IF length(v_q) < 2 THEN RETURN; END IF;
  v_like := '%' || v_q || '%';

  RETURN QUERY
  -- A pass number resolves straight to its learner.
  SELECT 'learner'::text, p.id, lp.id, NULL::uuid,
         COALESCE(NULLIF(trim(concat_ws(' ', lp.first_name, lp.last_name)), ''), p.full_name)::text,
         COALESCE(lp.roll_number, lp.register_number)::text, COALESCE(lp.college_email, lp.student_email, p.email)::text,
         lp.student_photo_url::text, ('Pass ' || gp.pass_number)::text
    FROM public.hostel_gate_passes gp
    JOIN public.profiles p ON p.id = gp.learner_id
    LEFT JOIN public.learners_profiles lp ON lp.id = p.learner_id
   WHERE gp.pass_number ILIKE v_like
  UNION ALL
  SELECT 'learner'::text, p.id, lp.id, NULL::uuid,
         COALESCE(NULLIF(trim(concat_ws(' ', lp.first_name, lp.last_name)), ''), p.full_name)::text,
         COALESCE(lp.roll_number, lp.register_number)::text, COALESCE(lp.college_email, lp.student_email, p.email)::text,
         lp.student_photo_url::text, COALESCE(lp.roll_number, '')::text
    FROM public.learners_profiles lp
    JOIN public.profiles p ON p.learner_id = lp.id
   WHERE lp.roll_number ILIKE v_like
      OR lp.register_number ILIKE v_like
      OR lp.college_email ILIKE v_like
      OR lp.student_email ILIKE v_like
      OR p.email ILIKE v_like
      OR concat_ws(' ', lp.first_name, lp.last_name) ILIKE v_like
      OR EXISTS (SELECT 1 FROM public.jkkn_identities ji WHERE ji.learner_profile_id = lp.id AND ji.jkkn_id = v_q)
  UNION ALL
  SELECT 'staff'::text, s.profile_id, NULL::uuid, s.id,
         trim(concat_ws(' ', s.first_name, s.last_name))::text, s.staff_id::text, COALESCE(s.institution_email, s.email)::text,
         s.profile_picture::text, COALESCE(s.designation, 'Team member')::text
    FROM public.staff s
   WHERE s.is_active IS DISTINCT FROM false
     AND (s.staff_id ILIKE v_like OR s.email ILIKE v_like OR s.institution_email ILIKE v_like
          OR concat_ws(' ', s.first_name, s.last_name) ILIKE v_like)
  LIMIT GREATEST(1, LEAST(p_limit, 30));
END;
$$;
REVOKE ALL ON FUNCTION public.gate_search_people(text, int) FROM public;
GRANT EXECUTE ON FUNCTION public.gate_search_people(text, int) TO authenticated;


COMMIT;
