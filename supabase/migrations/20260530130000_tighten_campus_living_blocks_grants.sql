-- Tighten campus_living.blocks.* role grants (2026-05-30).
--
-- Context: all four block permission keys were blanket-granted to ~20 roles
-- (incl. student, faculty, admission_*, accounts), making the new permission-
-- gated blocks UI meaningless. RLS on hostel_blocks already gates every op on
-- user_has_permission('campus_living.blocks.<action>'); this aligns the grants.
--
--   - view   : left untouched (blocks are reference data read across
--              campus-living: allocations, residents, etc.).
--   - create/edit : restricted to hostel_office, chief_warden, administrator
--                   (super admin always bypasses).
--   - delete : removed from every custom role — super-admin/admin only, matching
--              the super-admin-only Delete action in the blocks list UI.

-- 1) Revoke create + edit from everyone except the hostel-admin keep-set.
update custom_roles
set permissions = permissions - 'campus_living.blocks.create' - 'campus_living.blocks.edit'
where role_key not in ('hostel_office', 'chief_warden', 'administrator')
  and (permissions ? 'campus_living.blocks.create' or permissions ? 'campus_living.blocks.edit');

-- 2) Revoke delete from ALL custom roles (super-admin/admin only via RLS).
update custom_roles
set permissions = permissions - 'campus_living.blocks.delete'
where permissions ? 'campus_living.blocks.delete';
