-- scripts/moments/grant-roles.sql
-- Family Moments — role permission grants (2026-06-12).
--
-- Applied as DATA (custom_roles.permissions JSONB), not as a migration:
-- grants are reviewable/reversible in the Role Management UI afterwards.
-- Show-SQL-first discipline: run after Director review, alongside the
-- 20260711000000_family_moments_engine.sql migration.
--
-- Teachers (collect child messages): faculty, school_faculty, hod, principal
-- Dashboards (view campaign stats):  principal, admin
-- Campaign management:               admin (super admins bypass via is_super_admin())

UPDATE custom_roles
SET permissions = permissions || '{"moments.submissions.create": true}'::jsonb
WHERE role_key IN ('faculty', 'school_faculty', 'hod', 'principal')
  AND is_active = true;

UPDATE custom_roles
SET permissions = permissions || '{"moments.campaigns.view": true}'::jsonb
WHERE role_key IN ('principal', 'admin')
  AND is_active = true;

UPDATE custom_roles
SET permissions = permissions || '{"moments.campaigns.view": true, "moments.campaigns.manage": true}'::jsonb
WHERE role_key = 'admin'
  AND is_active = true;

-- Verify:
SELECT role_key,
       permissions ? 'moments.submissions.create' AS can_submit,
       permissions ? 'moments.campaigns.view'     AS can_view_campaigns
FROM custom_roles
WHERE role_key IN ('faculty', 'school_faculty', 'hod', 'principal', 'admin')
ORDER BY role_key;
