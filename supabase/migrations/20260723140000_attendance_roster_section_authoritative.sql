-- =====================================================================
-- 20260723140000 — fn_attendance_roster: make section_id AUTHORITATIVE
-- =====================================================================
-- BUG (b6fce213 / BUG-003249, BUG-003250): the attendance-marking roster at
-- /academic/attendance/mark showed the count as 59 but rendered only one
-- learner's name. A prior service-layer attempt (PR #2268) was never merged and the
-- re-check still reported it broken.
--
-- ROOT CAUSE: this RPC ANDs four filters — section_ids AND degree_id AND
-- program_id AND semester_id. When a marker opens a specific section's period,
-- section_id ALONE fully determines the roster; the other three are redundant
-- denormalized copies sourced from the timetable/section row. If any of them has
-- drifted from a learner's own learners_profiles value (e.g. a stale semester_id
-- after a promotion), the AND silently excludes that learner even though their
-- section matches — collapsing a 60-learner roster down to the stray row(s) whose
-- fields still coincidentally line up.
--
-- PROVEN ON LIVE DATA (real section 168bbeb9, 60 active learners):
--   section-only filter                     -> 60   (correct roster)
--   section AND a drifted semester_id        -> 0    (the reported collapse)
--   section-authoritative + drifted semester -> 60   (this fix)
--   no-section path + semester_id            -> unchanged (still filters)
--
-- FIX: when p_section_ids is provided it is authoritative — the degree/program/
-- semester params are ignored. They still apply on the no-section path (e.g. a
-- program-wide roster with no section scope), so that use is unchanged. This is
-- the root-cause fix in the RPC itself, so EVERY caller is protected, not just
-- the one service path #2268 patched.
--
-- Everything else (the auth guard, the returned columns, ordering) is preserved
-- verbatim from the live definition. Idempotent CREATE OR REPLACE.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_attendance_roster(p_institution_id uuid, p_section_ids uuid[] DEFAULT NULL::uuid[], p_degree_id uuid DEFAULT NULL::uuid, p_program_id uuid DEFAULT NULL::uuid, p_semester_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, first_name text, last_name text, roll_number text, student_photo_url text, institution_id uuid, degree_id uuid, program_id uuid, department_id uuid, semester_id uuid, section_id uuid, lifecycle_status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- SECURITY DEFINER bypasses RLS, so the access checks that learners_profiles_select_policy
  -- would normally enforce MUST be replicated here. Gate on institution access + an
  -- attendance permission key (never on hardcoded role names).
  -- Updated 2026-07-06: staff_teaches_in_institution() admits visiting staff — a
  -- staff member assigned (via staff planning) to teach in an institution other
  -- than their own can load the roster there.
  IF NOT (
    is_super_admin()
    OR is_admin()
    OR (
      (
        role_has_institution_access(p_institution_id)
        OR staff_teaches_in_institution(p_institution_id)
      )
      AND (
        user_has_permission('academic.attendance.mark')
        OR user_has_permission('academic.attendance.view')
        OR user_has_permission('academic.attendance.reports')
      )
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to view the attendance roster for this institution'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    lp.id,
    lp.first_name,
    lp.last_name,
    lp.roll_number,
    lp.student_photo_url,
    lp.institution_id,
    lp.degree_id,
    lp.program_id,
    lp.department_id,
    lp.semester_id,
    lp.section_id,
    lp.lifecycle_status::text
  FROM public.learners_profiles lp
  WHERE lp.lifecycle_status = 'active'
    AND lp.institution_id = p_institution_id
    -- Section is AUTHORITATIVE. When a section scope is given it alone determines
    -- the roster; the degree/program/semester params are redundant denormalized
    -- copies from the timetable/section row and, if drifted, would silently drop
    -- matching-section learners (BUG-003249/003250). They still apply on the
    -- no-section path, where they are the only scoping available.
    -- Department is intentionally NOT filtered: teaching staff can teach learners
    -- from other departments (subdivision groups / electives).
    AND CASE
          WHEN p_section_ids IS NOT NULL
            THEN lp.section_id = ANY (p_section_ids)
          ELSE (p_degree_id   IS NULL OR lp.degree_id   = p_degree_id)
           AND (p_program_id  IS NULL OR lp.program_id  = p_program_id)
           AND (p_semester_id IS NULL OR lp.semester_id = p_semester_id)
        END
  ORDER BY lp.first_name ASC, lp.last_name ASC;
END;
$function$;

-- Grants preserved from the live function (unchanged by CREATE OR REPLACE, restated for the record).
REVOKE EXECUTE ON FUNCTION public.fn_attendance_roster(uuid, uuid[], uuid, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_attendance_roster(uuid, uuid[], uuid, uuid, uuid) TO authenticated, service_role;
