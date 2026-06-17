-- =====================================================================
-- Grant campus_living.upgrades.manage to admin/warden roles            2026-06-17
--
-- New permission key gating the admin Category Upgrade module. Declaring it in
-- lib/constants/permissions.ts only populates the Role Management UI -- roles'
-- custom_roles.permissions JSONB must be granted explicitly or the page renders
-- empty for everyone (super_admins bypass).
--
-- Grant it to every role that already holds campus_living.allocations.edit
-- (the same key the existing admin cancel-upgrade action uses): currently
-- Chief Executive Officer, Chief Warden, Executive Administrative Officer,
-- Hostel Office Admin, Warden. Idempotent (re-runnable).
-- =====================================================================
UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object('campus_living.upgrades.manage', true),
       updated_at = now()
 WHERE COALESCE((permissions->>'campus_living.allocations.edit')::boolean, false) = true
   AND COALESCE((permissions->>'campus_living.upgrades.manage')::boolean, false) = false;
