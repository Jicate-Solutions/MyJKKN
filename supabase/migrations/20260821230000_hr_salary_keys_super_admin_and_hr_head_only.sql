-- Employee salaries are for the Super Administrator and the HR Head. Nobody else.
--
-- 20260821190000 granted hr.payroll.salary.view/.manage to the three roles that
-- already held hr.payroll.institution.manage -- hr_admin, hr_head and
-- hr_manager -- by analogy with the payer directory. That analogy was wrong:
-- maintaining the directory of WHO PAYS someone is an HR-operations task, while
-- WHAT SOMEONE EARNS is not. This narrows it to hr_head, with the Super
-- Administrator reaching it through is_super_admin() as it always does.
--
-- SET TO false, NOT REMOVED. Role Management writes every catalogued key into
-- every role's JSONB, so a deleted key is re-added as false on the next save and
-- the two states are indistinguishable to it. More importantly a key-PRESENCE
-- test reads a stored false as a grant, so removing the key and leaving it are
-- equally unsafe against that bug; the honest fix is to store the denial
-- explicitly and test by value everywhere, which user_has_permission() does.
--
-- This is the whole enforcement. hr_staff_salaries_select/_write and
-- hr_staff_salary_directory() all gate on these keys, and MENU_PERMISSIONS maps
-- /hr/payroll/salaries to hr.payroll.salary.view, so revoking here removes the
-- page, its sidebar row, its navbar chip and its data in one move.

UPDATE public.custom_roles
   SET permissions = permissions
         || jsonb_build_object('hr.payroll.salary.view',   false,
                               'hr.payroll.salary.manage', false),
       updated_at = now()
 WHERE is_active
   AND role_key IN ('hr_admin', 'hr_manager');

-- Belt and braces: any OTHER role that picked the keys up loses them too. The
-- allow-list is hr_head alone -- super_admin is deliberately absent because it
-- has never needed a stored grant.
UPDATE public.custom_roles
   SET permissions = permissions
         || jsonb_build_object('hr.payroll.salary.view',   false,
                               'hr.payroll.salary.manage', false),
       updated_at = now()
 WHERE is_active
   AND role_key NOT IN ('hr_head', 'super_admin')
   AND ((permissions->>'hr.payroll.salary.view')::boolean IS TRUE
     OR (permissions->>'hr.payroll.salary.manage')::boolean IS TRUE);
