-- ════════════════════════════════════════════════════════════════════════════
-- 20260516010000_validate_bos_perm_key_format_trigger.sql
-- ────────────────────────────────────────────────────────────────────────────
-- Permanently prevents the BoS key-format drift that has reverted three prior
-- migrations (20260511, 20260512, 20260516_normalize_bos_perm_key_format_drift)
-- within hours of each fix.
--
-- ROOT CAUSE (history):
--   The Role Management UI at /users/role-management saves the entire
--   custom_roles.permissions JSONB via lib/services/roles/role-service.ts
--   (full overwrite, not merge). The UI's checkbox catalog at
--   lib/constants/permissions.ts:1591-1631 enumerates BoS keys in the
--   `bos.<X>.<action>` format — NOT the canonical `academic.bos-<X>.<action>`
--   that hooks/use-permissions.ts and the user_has_permission() RPC actually
--   read. Whenever an admin opens the Facilitator role dialog and saves
--   (intentional change OR no-op), the dialog's React Query state — which
--   may still contain stale underscore-format keys from before a prior
--   migration — gets persisted, blowing away the canonical dot-format keys.
--   Verified on 2026-05-16 for role_key='faculty' (yasodharan.v@jkkn.ac.in):
--   migration ran at 07:13, regression at 08:38, exactly one role row
--   affected, exact "underscore replaces dot" pattern.
--
-- WHY A TRIGGER, NOT A CHECK CONSTRAINT:
--   PostgreSQL forbids subqueries in CHECK constraints (SQLSTATE 0A000).
--   Iterating JSONB keys via jsonb_each requires a SELECT, so the check has
--   to live in a trigger function instead. As a side benefit, the trigger
--   can RAISE EXCEPTION with a descriptive message naming the offending
--   key — the Role Management dialog's toast handler surfaces this directly
--   to the admin who triggered it, instead of silently corrupting state.
--
-- IDEMPOTENT: re-runs are safe (CREATE OR REPLACE + DROP IF EXISTS).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.validate_custom_roles_permissions_format()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  bad_key text;
BEGIN
  -- NULL permissions are allowed (some test/seed rows).
  IF NEW.permissions IS NULL THEN
    RETURN NEW;
  END IF;

  -- First offending key wins. The pattern matches:
  --   • underscore-format actions   (academic.bos-X_view, _create, _edit, ...)
  --   • the bare orphan             (academic.bos-syllabi — plural, no action)
  -- 'manage_taxonomy' is listed verbatim because it's a compound suffix and
  -- would otherwise be partially matched.
  SELECT key
  INTO bad_key
  FROM jsonb_each(NEW.permissions)
  WHERE key ~ '^academic\.bos-.*_(view|create|edit|delete|export|submit|approve|import|revise|duplicate|manage_taxonomy)$'
     OR key = 'academic.bos-syllabi'
  LIMIT 1;

  IF bad_key IS NOT NULL THEN
    RAISE EXCEPTION
      'Invalid BoS permission key format on role %: "%". Use dot-format (e.g. academic.bos-courses.view), not underscore (academic.bos-courses_view) or bare module (academic.bos-syllabi).',
      NEW.role_key, bad_key
      USING ERRCODE = '23514',
            HINT = 'See lib/services/bos/bos-role-permissions.ts and migrations 20260511/20260512/20260516 for the canonical key format.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_custom_roles_permissions_format ON public.custom_roles;

CREATE TRIGGER trg_validate_custom_roles_permissions_format
BEFORE INSERT OR UPDATE OF permissions ON public.custom_roles
FOR EACH ROW
EXECUTE FUNCTION public.validate_custom_roles_permissions_format();

-- ─── Self-test (read-only; the trigger should be visible after install) ────
DO $$
DECLARE
  trigger_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'custom_roles'
      AND t.tgname = 'trg_validate_custom_roles_permissions_format'
  ) INTO trigger_exists;

  IF NOT trigger_exists THEN
    RAISE EXCEPTION 'Trigger trg_validate_custom_roles_permissions_format failed to install';
  END IF;

  RAISE NOTICE 'BoS key-format validator trigger installed successfully';
END$$;
