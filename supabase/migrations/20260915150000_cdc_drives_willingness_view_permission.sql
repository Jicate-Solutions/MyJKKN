-- 2026-09-15 — cdc.drives.willingness.view
-- Gates the staff assigned-learner willingness tracker:
--   /cdc/drives/[id]/willingness (staff branch), /cdc/drives/willingness,
--   GET /api/cdc/drives/[id]/assigned (json + xlsx).
-- Granted to every custom role that already holds cdc.drives.view, so the
-- existing CDC head / coordinator roles see the page without a manual step.
-- Additive + idempotent. Super admins bypass via user_has_permission().

UPDATE public.custom_roles
SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object('cdc.drives.willingness.view', true),
    updated_at = now()
WHERE COALESCE((permissions ->> 'cdc.drives.view')::boolean, false) = true
  AND COALESCE((permissions ->> 'cdc.drives.willingness.view')::boolean, false) = false;
