-- ════════════════════════════════════════════════════════════════════════════
-- BoS Permission Format Drift — Diagnose + Fix Template
-- ════════════════════════════════════════════════════════════════════════════
-- USE WHEN: a BoS page renders blank for a non-super-admin role (HOD,
--           Principal, Facilitator, Coordinator, Faculty) even though the seed
--           config in lib/services/bos/bos-role-permissions.ts grants the
--           permission.
--
-- ROOT CAUSE: usePermissions().canAccess(module, action) in
--             hooks/use-permissions.ts builds the key as
--                  `${module}.${action}`   ← literal dot, no fallback
--             but custom_roles.permissions JSONB sometimes has only:
--               • UNDERSCORE format          'academic.bos-experts_view'
--               • or a BARE module key       'academic.bos-experts'
--             Neither of these matches the dot lookup → page is blank.
--
-- HOW TO USE THIS FILE:
--   1. PART A — paste into Supabase SQL editor first. It diagnoses which
--                role/module combos are missing dot-format keys without
--                making any changes.
--   2. PART B — adapt the MODULE / ACTIONS variables to the module you're
--                fixing and run it. Idempotent; safe to re-run.
--   3. PART C — verification query to confirm the fix landed.
-- ════════════════════════════════════════════════════════════════════════════


-- ─── PART A: DIAGNOSE (read-only) ───────────────────────────────────────────
-- Shows every role × every BoS module × every standard action. The 'has_key'
-- column tells you whether the canonical dot-format key exists and is true.

WITH role_perms AS (
  SELECT role_key, role_name, permissions
  FROM public.custom_roles
  WHERE role_key IN ('hod', 'principal', 'facilitator', 'coordinator', 'faculty', 'administrator')
    AND is_active = true
),
modules AS (
  SELECT unnest(ARRAY[
    'academic.bos-syllabus',
    'academic.bos-taxonomy',
    'academic.bos-experts',
    'academic.bos-compositions',
    'academic.bos-meetings',
    'academic.bos-ta-da',
    'academic.bos-reports',
    'academic.bos-courses',
    'academic.bos-scheme',
    'academic.bos-members'
  ]) AS module
),
actions AS (
  SELECT unnest(ARRAY['view','create','edit','delete']) AS action
)
SELECT
  r.role_key,
  m.module,
  a.action,
  -- ✓ if the canonical dot-format key is true
  (r.permissions ->> (m.module || '.' || a.action))::boolean AS dot_format,
  -- legacy underscore variant (presence means a backfill is needed)
  (r.permissions ->> (m.module || '_' || a.action))::boolean AS underscore_format,
  -- orphan bare-module key (no action suffix) — never authorizes anything
  (r.permissions ->> m.module)::boolean AS bare_orphan
FROM role_perms r
CROSS JOIN modules m
CROSS JOIN actions a
ORDER BY r.role_key, m.module, a.action;


-- ─── PART B: FIX TEMPLATE ──────────────────────────────────────────────────
-- Change the two variables below to the module + roles you're fixing.
-- The seed config in lib/services/bos/bos-role-permissions.ts is the source
-- of truth for which actions each role gets.

BEGIN;

-- HOD: full CRUD on <MODULE>
UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object(
    'academic.bos-experts.view',   true,
    'academic.bos-experts.create', true,
    'academic.bos-experts.edit',   true,
    'academic.bos-experts.delete', true
  ),
  updated_at = NOW()
WHERE role_key = 'hod';

-- Principal: view + edit (per seed)
-- The "permissions - 'academic.bos-experts'" strips the orphan bare-module key.
UPDATE public.custom_roles
SET permissions = (permissions - 'academic.bos-experts') || jsonb_build_object(
    'academic.bos-experts.view', true,
    'academic.bos-experts.edit', true
  ),
  updated_at = NOW()
WHERE role_key = 'principal';

-- Facilitator: view only (per seed; idempotent if already present)
UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object(
    'academic.bos-experts.view', true
  ),
  updated_at = NOW()
WHERE role_key = 'facilitator';

COMMIT;


-- ─── PART C: VERIFY ────────────────────────────────────────────────────────
-- After running PART B, re-run this to confirm every (role, action) pair
-- you intended to grant now reports dot_format=true.

SELECT
  role_key,
  (permissions ->> 'academic.bos-experts.view')::boolean   AS view,
  (permissions ->> 'academic.bos-experts.create')::boolean AS create,
  (permissions ->> 'academic.bos-experts.edit')::boolean   AS edit,
  (permissions ->> 'academic.bos-experts.delete')::boolean AS delete,
  (permissions ->> 'academic.bos-experts')::boolean        AS bare_orphan
FROM public.custom_roles
WHERE role_key IN ('hod','principal','facilitator','coordinator','faculty')
ORDER BY role_key;


-- ─── ROLLBACK (paste only if you need to undo PART B) ──────────────────────
/*
BEGIN;
UPDATE public.custom_roles
SET permissions = permissions
  - 'academic.bos-experts.view'
  - 'academic.bos-experts.create'
  - 'academic.bos-experts.edit'
  - 'academic.bos-experts.delete',
  updated_at = NOW()
WHERE role_key IN ('hod', 'principal', 'facilitator');
COMMIT;
*/


-- ════════════════════════════════════════════════════════════════════════════
-- REFERENCES (where the rules live in code)
-- ────────────────────────────────────────────────────────────────────────────
-- • hooks/use-permissions.ts:378
--     const permKey = `${module}.${action}`;   ← dot is the only format checked
--     return enhancedPermissions[permKey] || false;
--
-- • lib/services/bos/bos-role-permissions.ts
--     DEFAULT_ROLE_PERMISSIONS — declarative source of truth for which role
--     should have which (module, action) pairs. The DB column is supposed to
--     mirror this; drift = bug.
--
-- • lib/utils/bos/bos-access.ts:158
--     canAccessBos() — server-side check via user_has_permission(<dotkey>) RPC.
--     Same dot-format requirement.
--
-- • components/auth/permission-guard.tsx:48
--     <PermissionGuard fallback={null}> → blank page when the check fails.
-- ════════════════════════════════════════════════════════════════════════════
