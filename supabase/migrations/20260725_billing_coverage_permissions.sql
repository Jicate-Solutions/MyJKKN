-- Bill Coverage module: grant the two new permission keys to the accountant
-- roles. Super Administrator is NOT listed — it bypasses permission checks via
-- isSuperAdmin, and adding keys there would be misleading.
--
-- custom_roles.permissions is a JSONB object of { "<key>": true }.

UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object(
      'billing.coverage.view', true,
      'billing.coverage.export', true
    ),
    updated_at = now()
WHERE role_name IN ('Chief Accountant', 'Accountant Assistant');
