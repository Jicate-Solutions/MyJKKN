-- The leave/comp-off document upload route looked up the staff row through the
-- caller's own client, so RLS on `staff` (staff.view + module scope) decided
-- whether an employee could file proof against THEIR OWN record. Roles that do
-- not carry staff.view (librarian, assistant_librarian, lab_assistant,
-- library_admin, transport_boarding) got "Staff member or leave type not found".
--
-- This returns only the two fields the route needs to name the file, and only
-- for a staff row that belongs to the caller (fn_my_staff_ids() = profile_id =
-- auth.uid()). It never widens what anyone can read about someone else.

CREATE OR REPLACE FUNCTION public.fn_my_staff_upload_context(p_staff_id uuid)
RETURNS TABLE (staff_code text, institution_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT s.staff_id::text, i.name::text
  FROM public.staff s
  LEFT JOIN public.institutions i ON i.id = s.institution_id
  WHERE s.id = p_staff_id
    AND p_staff_id = ANY (public.fn_my_staff_ids());
$$;

REVOKE ALL ON FUNCTION public.fn_my_staff_upload_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_my_staff_upload_context(uuid) TO authenticated;
