-- ════════════════════════════════════════════════════════════════════════════
-- 20260627_bos_taxonomy_sop_superadmin_only.sql
-- ────────────────────────────────────────────────────────────────────────────
-- Lock /bos/taxonomy and /bos/sop down to SUPER ADMIN ONLY.
--
-- WHY:
--   • Taxonomy framework + regulation/board assignment is a low-frequency,
--     high-blast-radius config (it rewrites the k_values every syllabus CO and
--     PDF legend reads). It was granted to administrator/principal/hod/faculty/
--     school_*/payment_audit_admin — too wide. Product decision: super-admin only.
--   • SOP had NO role grants already (menu hidden for everyone but super_admin),
--     but its page lacked a PermissionGuard so the URL was reachable directly.
--     The page guard is added in the same change (app/(routes)/bos/sop/page.tsx).
--
-- WHAT THIS DOES:
--   Strips every taxonomy/sop permission key — canonical (academic.bos-taxonomy.*,
--   academic.bos-sop.*) AND legacy (bos.taxonomy.*, bos.sop.*) — from every
--   custom_role EXCEPT super_admin/system_admin. Removing the legacy keys too
--   stops 20260516020000_copy_forward_bos_ui_catalog_keys.sql from silently
--   re-granting the canonical keys if it is ever re-run.
--
--   super_admin/system_admin are left untouched; their access comes from the
--   isSuperAdmin short-circuit in usePermissions / PermissionGuard regardless.
--
--   The MENU_PERMISSIONS entries in sidebarMenuLink.ts
--   ('/bos/taxonomy' → academic.bos-taxonomy.view, '/bos/sop' → academic.bos-sop.view)
--   STAY — they are exactly what hides the sidebar + Ctrl+K search from every
--   role that now lacks the grant. Do NOT remove them.
--
-- IDEMPOTENT: re-running is a no-op once the keys are gone.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE public.custom_roles
SET permissions = (
    SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
    FROM jsonb_each(permissions)
    WHERE key !~ '^(academic\.bos-(taxonomy|sop)|bos\.(taxonomy|sop))\.'
  ),
  updated_at = NOW()
WHERE permissions IS NOT NULL
  AND role_key NOT IN ('super_admin', 'system_admin')
  AND EXISTS (
    SELECT 1 FROM jsonb_each(permissions)
    WHERE key ~ '^(academic\.bos-(taxonomy|sop)|bos\.(taxonomy|sop))\.'
  );

COMMIT;

-- ─── Verification ──────────────────────────────────────────────────────────
-- Expect ZERO rows: no non-super-admin role should retain any taxonomy/sop key.
SELECT
  role_key,
  (SELECT count(*) FROM jsonb_each(permissions)
   WHERE key ~ '^(academic\.bos-(taxonomy|sop)|bos\.(taxonomy|sop))\.'
     AND value = 'true'::jsonb) AS remaining_tax_sop_keys
FROM public.custom_roles
WHERE role_key NOT IN ('super_admin', 'system_admin')
  AND EXISTS (
    SELECT 1 FROM jsonb_each(permissions)
    WHERE key ~ '^(academic\.bos-(taxonomy|sop)|bos\.(taxonomy|sop))\.'
      AND value = 'true'::jsonb
  );
