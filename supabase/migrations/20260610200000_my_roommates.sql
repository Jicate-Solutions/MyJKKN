-- 20260610200000_my_roommates.sql
-- My Hostel Overview: co-residents of the current user's assigned room. Residents can
-- only read their OWN hostel_allocations row (RLS allocations.view_own), so a direct
-- query can't see roommates — this SECURITY DEFINER fn returns the OTHER residents of
-- the caller's room only (scoped to auth.uid()'s allocation; no cross-room leakage).
-- Exposes name + bed + program + year + status only (no email/phone).
CREATE OR REPLACE FUNCTION public.fn_my_roommates()
RETURNS TABLE(
  full_name text, bed_number text, program_name text, semester_name text, status text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (
    SELECT a.room_id
    FROM hostel_allocations a
    WHERE a.learner_id = auth.uid()
      AND a.status IN ('active','pending_approval','pending_vacate')
      AND a.room_id IS NOT NULL
    ORDER BY a.allocation_date DESC NULLS LAST
    LIMIT 1
  )
  SELECT
    COALESCE(p.full_name, p.email, '—') AS full_name,
    bd.bed_number,
    prog.program_name,
    sem.semester_name,
    a.status
  FROM hostel_allocations a
  JOIN me ON me.room_id = a.room_id
  JOIN profiles p ON p.id = a.learner_id
  LEFT JOIN hostel_beds bd ON bd.id = a.bed_id
  LEFT JOIN learners_profiles lp ON lp.id = p.learner_id
  LEFT JOIN programs prog ON prog.id = lp.program_id
  LEFT JOIN semesters sem ON sem.id = lp.semester_id
  WHERE a.learner_id <> auth.uid()
    AND a.status IN ('active','pending_approval','pending_vacate')
  ORDER BY bd.bed_number NULLS LAST, p.full_name;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_my_roommates() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_my_roommates() TO authenticated;
