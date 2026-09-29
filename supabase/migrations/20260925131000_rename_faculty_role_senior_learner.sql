-- ============================================================================
-- custom_roles: faculty display name 'Facilitator' -> 'Senior Learner'
-- ----------------------------------------------------------------------------
-- JKKN terminology ruling (2026-07-14, "Senior Learners everywhere"). Label
-- only: role_key stays 'faculty', so permissions, RLS and staff.role_key are
-- untouched. Singular form matches the existing department roles
-- (cse_facilitator = 'CSE Senior Learner', it_facilitator, ece_, eee_, mech_).
-- No function, policy or app code compares against role_name = 'Facilitator'
-- (checked 2026-09-25). school_faculty ('School Facilitator') is deliberately
-- left as is.
-- ============================================================================

UPDATE public.custom_roles
   SET role_name  = 'Senior Learner',
       updated_at = now()
 WHERE role_key  = 'faculty'
   AND role_name = 'Facilitator';
