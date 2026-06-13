-- ============================================================
-- B3.2 — Bridge user_roles → profiles.role for CDC roles
-- ============================================================
-- Discovered by B3 audit (PR #987 docs/audit/cdc-rls-coverage-2026-05-19.md
-- Finding 2). The platform has two parallel role-mechanisms:
--
--   * custom_roles + user_roles  — canonical assignment registry
--                                  (5805 active rows, /admin/users writes here)
--   * profiles.role (text)       — what CDC RLS helpers actually read
--                                  (is_cdc_staff(), is_cdc_head_or_super())
--
-- The two are NOT bridged. A user assigned `cdc_coordinator` via
-- /admin/users gets a user_roles row but profiles.role stays unchanged —
-- meaning CDC RLS sees them as their old role (or 'student').
--
-- This migration is the NARROW fix: trigger on user_roles INSERT that
-- elevates profiles.role to the CDC role when a CDC user_roles assignment
-- lands. cdc_head wins over cdc_coordinator if both are assigned.
--
-- ON DELETE: we do NOT revert profiles.role. The narrow bridge only
-- elevates; demoting back requires explicit admin action because we
-- don't track the user's "prior" non-CDC role. Documented as a known
-- limitation.
--
-- OUT OF SCOPE: a generic platform-wide `has_role(role_key)` function
-- that unifies the two role mechanisms. That's a larger refactor
-- touching every existing `is_*` helper.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_sync_cdc_role_to_profiles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_key text;
BEGIN
  -- Find the role_key of the inserted/deleted assignment
  SELECT cr.role_key INTO v_role_key
  FROM custom_roles cr
  WHERE cr.id = COALESCE(NEW.role_id, OLD.role_id);

  -- Only act on CDC role assignments
  IF v_role_key NOT IN ('cdc_head', 'cdc_coordinator') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Elevate profiles.role. cdc_head wins over cdc_coordinator:
    -- if the user already has 'cdc_head' on profiles, don't downgrade
    -- to 'cdc_coordinator' here.
    IF v_role_key = 'cdc_head' THEN
      UPDATE profiles SET role = 'cdc_head' WHERE id = NEW.user_id;
    ELSIF v_role_key = 'cdc_coordinator' THEN
      UPDATE profiles
      SET role = 'cdc_coordinator'
      WHERE id = NEW.user_id
        AND role IS DISTINCT FROM 'cdc_head';  -- don't downgrade head
    END IF;
    RETURN NEW;
  END IF;

  -- ON DELETE: narrow bridge does NOT revert profiles.role.
  -- An admin must explicitly change it. Documented in PR body.
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cdc_role_sync ON user_roles;
CREATE TRIGGER trg_cdc_role_sync
  AFTER INSERT OR DELETE ON user_roles
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_cdc_role_to_profiles();

-- ============================================================
-- Backfill: any existing user_roles rows for CDC roles get their
-- profiles.role updated now. Per audit, count = 0 currently, so
-- this is defensive.
-- ============================================================
UPDATE profiles p
SET role = 'cdc_head'
FROM user_roles ur
JOIN custom_roles cr ON cr.id = ur.role_id
WHERE ur.user_id = p.id
  AND cr.role_key = 'cdc_head'
  AND p.role IS DISTINCT FROM 'cdc_head';

UPDATE profiles p
SET role = 'cdc_coordinator'
FROM user_roles ur
JOIN custom_roles cr ON cr.id = ur.role_id
WHERE ur.user_id = p.id
  AND cr.role_key = 'cdc_coordinator'
  AND p.role NOT IN ('cdc_head', 'cdc_coordinator');
