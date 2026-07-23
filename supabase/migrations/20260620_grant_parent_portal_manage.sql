-- =====================================================================
-- Grant academic.parent_portal.manage to the parent-portal author roles  2026-06-20
--
-- New permission key gating the /academic/parent-portal authoring page in nav +
-- search (lib/sidebarMenuLink.ts MENU_PERMISSIONS). Previously the route was
-- gated by the broad academic.years.view, so any academic viewer saw the link
-- even though the API (requireStaff -> super_admin/faculty/hod/staff) refused
-- them. This narrows nav/search to match the API.
--
-- Declaring the key in lib/constants/permissions.ts only populates the Role
-- Management UI; custom_roles.permissions JSONB must be granted explicitly or
-- the chip/link disappears for everyone except super_admins (who bypass).
--
-- Granted to the same roles requireStaff() allows. Idempotent (re-runnable).
-- =====================================================================
UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object('academic.parent_portal.manage', true),
       updated_at = now()
 WHERE role_key IN ('super_admin', 'faculty', 'hod', 'staff')
   AND COALESCE((permissions->>'academic.parent_portal.manage')::boolean, false) = false;
