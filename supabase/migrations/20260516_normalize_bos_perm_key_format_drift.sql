-- ════════════════════════════════════════════════════════════════════════════
-- 20260516_normalize_bos_perm_key_format_drift.sql
-- ────────────────────────────────────────────────────────────────────────────
-- Normalises `custom_roles.permissions` JSONB keys for the BoS modules:
--   • underscore-format `academic.bos-X_action`  → dot-format `academic.bos-X.action`
--   • plural module name `academic.bos-syllabi`  → singular `academic.bos-syllabus`
--     (covers the bare orphan AND any keys derived from it)
--
-- WHY: hooks/use-permissions.ts, lib/utils/bos/bos-access.ts (user_has_permission
--      RPC) and PermissionGuard all read the dot-format key. JSONB seeded with
--      underscore keys silently authorises nothing, producing blank pages or
--      403 Forbidden from canAccessBos. Reproduced on 2026-05-16 against the
--      `faculty` (display "Facilitator") role for user yasodharan.v@jkkn.ac.in
--      hitting /api/bos/courses-master.
--
-- IDEMPOTENT: the WHERE filter restricts the UPDATE to roles that still carry
--             at least one underscore-format / plural key. Re-running is a
--             no-op after the first successful apply.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE public.custom_roles
SET permissions = (
  SELECT jsonb_object_agg(new_key, value)
  FROM (
    -- On collision (a role already had BOTH the old and the new key) keep the
    -- truthy one. Without DISTINCT ON the OR-of-two-bools collapses into the
    -- arbitrary "last seen" — explicit ordering prevents data loss.
    SELECT DISTINCT ON (new_key) new_key, value
    FROM (
      SELECT
        CASE
          WHEN key LIKE 'academic.bos-%'
            THEN regexp_replace(
                   regexp_replace(
                     key,
                     -- Plural → singular, matching the bare orphan and any
                     -- suffixed variant ('academic.bos-syllabi.view',
                     -- 'academic.bos-syllabi_view', 'academic.bos-syllabi').
                     'academic\.bos-syllabi($|[_.])', 'academic.bos-syllabus\1'
                   ),
                   -- Underscore → dot, but only for the known action suffixes.
                   -- 'manage_taxonomy' contains an underscore in its name, so
                   -- it's listed verbatim — the regex anchors at end-of-string
                   -- to avoid touching it twice.
                   '_(view|create|edit|delete|export|submit|approve|import|revise|duplicate|manage_taxonomy)$',
                   '.\1'
                 )
          ELSE key
        END AS new_key,
        value
      FROM jsonb_each(permissions)
    ) renamed
    ORDER BY new_key, (value = 'true'::jsonb) DESC
  ) deduped
),
updated_at = NOW()
WHERE permissions IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_each(permissions)
    WHERE key ~ '^academic\.bos-.*_(view|create|edit|delete|export|submit|approve|import|revise|duplicate|manage_taxonomy)$'
       OR key LIKE 'academic.bos-syllabi%'
  );

COMMIT;

-- ─── Verification (read-only) ───────────────────────────────────────────────
-- Re-run this after the COMMIT. For every role you care about, dot_format
-- should be 'true' and underscore_format should be NULL.

SELECT
  role_key,
  role_name,
  (permissions ->> 'academic.bos-courses.view')::text   AS courses_view_dot,
  (permissions ->> 'academic.bos-courses_view')::text   AS courses_view_underscore_legacy,
  (permissions ->> 'academic.bos-syllabus.view')::text  AS syllabus_view_dot,
  (permissions ->> 'academic.bos-syllabi')::text        AS syllabi_bare_orphan_legacy
FROM public.custom_roles
WHERE role_key IN ('faculty','hod','principal','administrator','coordinator');
