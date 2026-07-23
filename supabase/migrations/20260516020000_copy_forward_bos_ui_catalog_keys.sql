-- ════════════════════════════════════════════════════════════════════════════
-- 20260516020000_copy_forward_bos_ui_catalog_keys.sql
-- ────────────────────────────────────────────────────────────────────────────
-- Bridge migration paired with the lib/constants/permissions.ts catalog
-- rewrite landed in the same change. The catalog now emits canonical
-- `academic.bos-<X>.<action>` keys instead of the legacy `bos.<X>.<action>`
-- keys it used to emit. Before this migration runs, admins may have toggles
-- ON for keys like `bos.courses.create=true` — those keys authorise nothing
-- in the runtime code (which has always read `academic.bos-courses.create`).
-- This migration projects those legacy keys forward into their canonical
-- counterparts so the toggles users already enabled actually take effect
-- after the catalog change ships.
--
-- WHAT IT DOES:
--   For every custom_roles row, for every key matching `bos.<X>.<action>`
--   (with the truthy value true), set the canonical `academic.bos-<X>.<action>`
--   key to true. Original `bos.<X>.<action>` keys are left in place — they're
--   harmless (nothing reads them) and keeping them lets the old role-management
--   dialog state continue to display the toggle as ON.
--
-- KEY TRANSFORMS:
--   bos.compositions.<a>  → academic.bos-compositions.<a>
--   bos.experts.<a>       → academic.bos-experts.<a>
--   bos.meetings.<a>      → academic.bos-meetings.<a>
--   bos.reports.<a>       → academic.bos-reports.<a>
--   bos.members.<a>       → academic.bos-members.<a>
--   bos.courses.<a>       → academic.bos-courses.<a>
--   bos.scheme.<a>        → academic.bos-scheme.<a>
--   bos.taxonomy.<a>      → academic.bos-taxonomy.<a>
--   bos.syllabus.<a>      → academic.bos-syllabus.<a>
--   bos.sop.<a>           → academic.bos-sop.<a>
--   bos.ta_da.<a>         → academic.bos-ta-da.<a>   ← underscore→dash on module
--
-- NOT TRANSFORMED:
--   bos.view              → kept as-is; that's the sidebar menu parent gate
--                           at sidebarMenuLink.ts:497.
--
-- IDEMPOTENT: re-running won't double-set (jsonb || merges by key). Safe to
--             re-run after future role-management saves to re-sync any
--             newly-toggled legacy keys.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE public.custom_roles
SET permissions = permissions || (
  SELECT COALESCE(jsonb_object_agg(
    -- Map module portion to canonical
    CASE
      WHEN module = 'ta_da' THEN 'academic.bos-ta-da.' || action
      ELSE 'academic.bos-' || module || '.' || action
    END,
    'true'::jsonb
  ), '{}'::jsonb)
  FROM (
    SELECT
      -- Extract module + action from `bos.<module>.<action>` keys
      split_part(key, '.', 2) AS module,
      split_part(key, '.', 3) AS action
    FROM jsonb_each(permissions)
    WHERE key ~ '^bos\.(compositions|experts|meetings|reports|members|courses|scheme|taxonomy|syllabus|sop|ta_da)\.[a-z_]+$'
      AND value = 'true'::jsonb
  ) parts
),
updated_at = NOW()
WHERE permissions IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_each(permissions)
    WHERE key ~ '^bos\.(compositions|experts|meetings|reports|members|courses|scheme|taxonomy|syllabus|sop|ta_da)\.[a-z_]+$'
      AND value = 'true'::jsonb
  );

COMMIT;

-- ─── Verification ──────────────────────────────────────────────────────────
-- For each role, count how many canonical academic.bos-* keys it now has.
-- A role that had `bos.courses.create=true` before should now also have
-- `academic.bos-courses.create=true`.

SELECT
  role_key,
  (SELECT count(*) FROM jsonb_each(permissions)
   WHERE key ~ '^academic\.bos-.*\.[a-z_]+$' AND value = 'true'::jsonb) AS canonical_count,
  (SELECT count(*) FROM jsonb_each(permissions)
   WHERE key ~ '^bos\.(compositions|experts|meetings|reports|members|courses|scheme|taxonomy|syllabus|sop|ta_da)\.[a-z_]+$'
     AND value = 'true'::jsonb) AS legacy_ui_catalog_count,
  (permissions ->> 'academic.bos-courses.create')::text AS courses_create_canonical
FROM public.custom_roles
WHERE role_key IN ('faculty','hod','principal','administrator','coordinator');
