-- Confine the Staff Counsellor role to its own institution.
--
-- staff_counselor had institution_scope = 'all', so role_has_institution_access()
-- returned true for every institution. Its holders (49 via user_roles, 37 via
-- legacy profiles.role) could therefore list learners_profiles and staff
-- (through the staff_select_visiting_teacher policy) across all colleges.
--
-- Verified by impersonating a counsellor (CAS Self) before/after:
--   staff:    412 rows / 11 institutions  ->  116 rows / 2 institutions
--   learners: 7682 rows / 12 institutions -> 2388 rows / 2 institutions
-- (2 = own institution + its CAS counselling_code sibling, by design.)
--
-- Holders who also carry another institution_scope = 'all' role (e.g. admission)
-- keep that role's wider access — role scopes are unioned.

UPDATE public.custom_roles
SET institution_scope = 'own',
    updated_at = now()
WHERE role_key = 'staff_counselor'
  AND institution_scope IS DISTINCT FROM 'own';
