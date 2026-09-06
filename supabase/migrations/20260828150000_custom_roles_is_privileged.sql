-- Mark which roles are privileged, so the staff form and the role guard can
-- tell an admin role from an ordinary one.
--
-- WHY A NEW FLAG. custom_roles.is_system_role is true for nearly every role
-- (driver, guest and mess_caterer included), so it discriminates nothing — the
-- same dead-flag shape as staff.role_type. Counting granted permissions fails
-- too: super_admin shows only 176 grants because is_super_admin() short-circuits
-- every check, which ranks it BELOW HOD's 342.
--
-- Split from the trigger migration deliberately: combining them held a lock on
-- custom_roles while waiting for an AccessExclusiveLock on the busy staff table,
-- and deadlocked against live traffic.

BEGIN;

ALTER TABLE public.custom_roles
  ADD COLUMN IF NOT EXISTS is_privileged boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.custom_roles.is_privileged IS
  'Role can grant/alter permissions or administer the platform. Only super admins may assign it to a staff member (enforced by trg_staff_guard_role_key). Maintained in Role Management.';

-- Seeded from "can grant or alter permissions, or is a platform executive" —
-- deliberately NOT "can edit staff", which would sweep in HOD (76 staff) and
-- Principal (11) and is not what an admin role means here.
--
-- 'guest' is in the list because it grants roles.assign, which is almost
-- certainly a misconfiguration in its own right; it is already excluded from
-- the staff dropdown.
UPDATE public.custom_roles
SET is_privileged = true
WHERE role_key IN (
  'super_admin', 'administrator', 'managing_director', 'ceo', 'coo', 'cao',
  'registrar', 'executive_admin_officer', 'payment_audit_admin',
  'digital_coordinator', 'hr_admin', 'guest'
)
AND is_privileged IS DISTINCT FROM true;

COMMIT;
