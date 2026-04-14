-- ============================================================================
-- Migration: role_audit_log
-- Date: 2026-04-14
-- Purpose: Capture every role/permission change as a plain-English timeline
--          entry so non-developers can see "what changed" in the Permissions
--          Audit Dashboard.
--
-- Non-destructive: only CREATE TABLE, CREATE INDEX, CREATE FUNCTION, CREATE
-- TRIGGER. Zero DROP/ALTER/DELETE on existing objects.
-- ============================================================================

-- 1. Audit log table --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.role_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What happened
  action_type TEXT NOT NULL CHECK (action_type IN (
    'role_created', 'role_updated', 'role_deleted',
    'user_role_assigned', 'user_role_revoked', 'user_role_primary_changed',
    'institution_access_granted', 'institution_access_revoked', 'institution_access_updated'
  )),

  -- Who did it (NULL if action happened via service_role/migration)
  -- NOTE: No FK constraints — audit logs must survive deletes. Triggers
  -- fire in the same transaction as the DELETE, which would cause FK
  -- violations when inserting the audit row. Denormalized *_name/JSONB
  -- snapshots are the authoritative identity for historical entries.
  actor_user_id UUID,
  actor_name TEXT,

  -- What was affected
  target_user_id UUID,
  target_role_id UUID,

  -- Snapshot of before/after
  old_value JSONB,
  new_value JSONB,

  -- Human-readable description, pre-generated
  description TEXT NOT NULL,

  -- How many users were affected (for role changes)
  affected_user_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 2. Indexes ----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_role_audit_log_created_at
  ON public.role_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_role_audit_log_action_type
  ON public.role_audit_log (action_type);

CREATE INDEX IF NOT EXISTS idx_role_audit_log_actor
  ON public.role_audit_log (actor_user_id)
  WHERE actor_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_role_audit_log_target_role
  ON public.role_audit_log (target_role_id)
  WHERE target_role_id IS NOT NULL;

-- 3. RLS: super admin or users.permissions_audit.view permission -----------
ALTER TABLE public.role_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "role_audit_log_select_super_admin" ON public.role_audit_log;
CREATE POLICY "role_audit_log_select_super_admin"
  ON public.role_audit_log
  FOR SELECT
  TO authenticated
  USING (
    is_super_admin()
    OR is_admin()
    OR user_has_permission('users.permissions_audit.view')
  );

-- No INSERT/UPDATE/DELETE policies — only triggers (SECURITY DEFINER) write here.
-- service_role bypasses RLS so API queries work as expected.

-- 4. Helper function: get actor name ---------------------------------------
CREATE OR REPLACE FUNCTION public._role_audit_actor_name()
RETURNS TEXT AS $$
DECLARE
  uid UUID;
  name TEXT;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RETURN 'System';
  END IF;
  SELECT COALESCE(full_name, email, 'Unknown user')
    INTO name
    FROM public.profiles
    WHERE id = uid;
  RETURN COALESCE(name, 'Unknown user');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 5. Trigger function: custom_roles -----------------------------------------
CREATE OR REPLACE FUNCTION public.log_custom_role_change()
RETURNS TRIGGER AS $$
DECLARE
  actor_id UUID;
  actor_name TEXT;
  role_name TEXT;
  log_msg TEXT;
  users_affected INTEGER := 0;
  perms_added INTEGER := 0;
  perms_removed INTEGER := 0;
  k TEXT;
BEGIN
  actor_id := auth.uid();
  actor_name := public._role_audit_actor_name();

  IF TG_OP = 'INSERT' THEN
    log_msg := actor_name || ' created role "' || NEW.role_name || '"';
    INSERT INTO public.role_audit_log (
      action_type, actor_user_id, actor_name, target_role_id,
      old_value, new_value, description, affected_user_count
    ) VALUES (
      'role_created', actor_id, actor_name, NEW.id,
      NULL,
      jsonb_build_object(
        'role_key', NEW.role_key,
        'role_name', NEW.role_name,
        'permissions', COALESCE(NEW.permissions, '{}'::jsonb),
        'is_system_role', NEW.is_system_role
      ),
      log_msg, 0
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Count user_roles for this role to know blast radius
    SELECT COUNT(*) INTO users_affected
    FROM public.user_roles
    WHERE role_id = NEW.id;

    -- Count permission diffs
    FOR k IN
      SELECT key FROM jsonb_each(COALESCE(NEW.permissions, '{}'::jsonb))
    LOOP
      IF COALESCE(OLD.permissions, '{}'::jsonb) ->> k IS DISTINCT FROM COALESCE(NEW.permissions, '{}'::jsonb) ->> k THEN
        IF (COALESCE(NEW.permissions, '{}'::jsonb) ->> k) = 'true' THEN
          perms_added := perms_added + 1;
        ELSE
          perms_removed := perms_removed + 1;
        END IF;
      END IF;
    END LOOP;

    log_msg := actor_name || ' updated role "' || NEW.role_name || '"';
    IF perms_added > 0 OR perms_removed > 0 THEN
      log_msg := log_msg || ' — ' || perms_added || ' permission(s) added, ' || perms_removed || ' removed';
    END IF;
    IF users_affected > 0 THEN
      log_msg := log_msg || '. ' || users_affected || ' user(s) affected.';
    END IF;

    INSERT INTO public.role_audit_log (
      action_type, actor_user_id, actor_name, target_role_id,
      old_value, new_value, description, affected_user_count
    ) VALUES (
      'role_updated', actor_id, actor_name, NEW.id,
      jsonb_build_object(
        'role_name', OLD.role_name,
        'permissions', COALESCE(OLD.permissions, '{}'::jsonb)
      ),
      jsonb_build_object(
        'role_name', NEW.role_name,
        'permissions', COALESCE(NEW.permissions, '{}'::jsonb),
        'perms_added', perms_added,
        'perms_removed', perms_removed
      ),
      log_msg, users_affected
    );
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    log_msg := actor_name || ' deleted role "' || OLD.role_name || '"';
    INSERT INTO public.role_audit_log (
      action_type, actor_user_id, actor_name, target_role_id,
      old_value, new_value, description, affected_user_count
    ) VALUES (
      'role_deleted', actor_id, actor_name, OLD.id,
      jsonb_build_object(
        'role_key', OLD.role_key,
        'role_name', OLD.role_name,
        'permissions', COALESCE(OLD.permissions, '{}'::jsonb)
      ),
      NULL, log_msg, 0
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Trigger function: user_roles -------------------------------------------
CREATE OR REPLACE FUNCTION public.log_user_role_change()
RETURNS TRIGGER AS $$
DECLARE
  actor_id UUID;
  actor_name TEXT;
  target_name TEXT;
  role_name TEXT;
  log_msg TEXT;
  action TEXT;
BEGIN
  actor_id := auth.uid();
  actor_name := public._role_audit_actor_name();

  IF TG_OP = 'INSERT' THEN
    SELECT COALESCE(full_name, email, 'user') INTO target_name
      FROM public.profiles WHERE id = NEW.user_id;
    SELECT role_name INTO role_name
      FROM public.custom_roles WHERE id = NEW.role_id;
    log_msg := actor_name || ' assigned role "' || COALESCE(role_name, 'unknown') || '" to ' || COALESCE(target_name, 'user');
    IF NEW.is_primary THEN
      log_msg := log_msg || ' (as primary role)';
    END IF;
    INSERT INTO public.role_audit_log (
      action_type, actor_user_id, actor_name,
      target_user_id, target_role_id,
      old_value, new_value, description
    ) VALUES (
      'user_role_assigned', actor_id, actor_name,
      NEW.user_id, NEW.role_id,
      NULL,
      jsonb_build_object('role_name', role_name, 'is_primary', NEW.is_primary),
      log_msg
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Only log primary role flips; other updates are noise
    IF OLD.is_primary IS DISTINCT FROM NEW.is_primary THEN
      SELECT COALESCE(full_name, email, 'user') INTO target_name
        FROM public.profiles WHERE id = NEW.user_id;
      SELECT role_name INTO role_name
        FROM public.custom_roles WHERE id = NEW.role_id;
      log_msg := actor_name || ' changed primary role for ' || COALESCE(target_name, 'user') || ' to "' || COALESCE(role_name, 'unknown') || '"';
      INSERT INTO public.role_audit_log (
        action_type, actor_user_id, actor_name,
        target_user_id, target_role_id,
        old_value, new_value, description
      ) VALUES (
        'user_role_primary_changed', actor_id, actor_name,
        NEW.user_id, NEW.role_id,
        jsonb_build_object('is_primary', OLD.is_primary),
        jsonb_build_object('is_primary', NEW.is_primary),
        log_msg
      );
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    SELECT COALESCE(full_name, email, 'user') INTO target_name
      FROM public.profiles WHERE id = OLD.user_id;
    SELECT role_name INTO role_name
      FROM public.custom_roles WHERE id = OLD.role_id;
    log_msg := actor_name || ' revoked role "' || COALESCE(role_name, 'unknown') || '" from ' || COALESCE(target_name, 'user');
    INSERT INTO public.role_audit_log (
      action_type, actor_user_id, actor_name,
      target_user_id, target_role_id,
      old_value, new_value, description
    ) VALUES (
      'user_role_revoked', actor_id, actor_name,
      OLD.user_id, OLD.role_id,
      jsonb_build_object('role_name', role_name, 'was_primary', OLD.is_primary),
      NULL,
      log_msg
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Trigger function: user_institution_access -----------------------------
CREATE OR REPLACE FUNCTION public.log_institution_access_change()
RETURNS TRIGGER AS $$
DECLARE
  actor_id UUID;
  actor_name TEXT;
  target_name TEXT;
  inst_name TEXT;
  log_msg TEXT;
BEGIN
  actor_id := auth.uid();
  actor_name := public._role_audit_actor_name();

  IF TG_OP = 'INSERT' THEN
    SELECT COALESCE(full_name, email, 'user') INTO target_name
      FROM public.profiles WHERE id = NEW.user_id;
    SELECT name INTO inst_name
      FROM public.institutions WHERE id = NEW.institution_id;
    log_msg := actor_name || ' granted ' || COALESCE(target_name, 'user') ||
      ' "' || COALESCE(NEW.access_type, 'access') || '" access to ' || COALESCE(inst_name, 'an institution');
    INSERT INTO public.role_audit_log (
      action_type, actor_user_id, actor_name,
      target_user_id,
      old_value, new_value, description
    ) VALUES (
      'institution_access_granted', actor_id, actor_name,
      NEW.user_id,
      NULL,
      jsonb_build_object(
        'institution_id', NEW.institution_id,
        'institution_name', inst_name,
        'access_type', NEW.access_type
      ),
      log_msg
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.access_type IS DISTINCT FROM NEW.access_type
      OR OLD.is_active IS DISTINCT FROM NEW.is_active THEN
      SELECT COALESCE(full_name, email, 'user') INTO target_name
        FROM public.profiles WHERE id = NEW.user_id;
      SELECT name INTO inst_name
        FROM public.institutions WHERE id = NEW.institution_id;
      log_msg := actor_name || ' updated ' || COALESCE(target_name, 'user') ||
        '''s access to ' || COALESCE(inst_name, 'an institution') ||
        ' (now: ' || COALESCE(NEW.access_type, 'none') ||
        CASE WHEN NEW.is_active THEN '' ELSE ', INACTIVE' END || ')';
      INSERT INTO public.role_audit_log (
        action_type, actor_user_id, actor_name,
        target_user_id,
        old_value, new_value, description
      ) VALUES (
        'institution_access_updated', actor_id, actor_name,
        NEW.user_id,
        jsonb_build_object('access_type', OLD.access_type, 'is_active', OLD.is_active),
        jsonb_build_object('access_type', NEW.access_type, 'is_active', NEW.is_active),
        log_msg
      );
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    SELECT COALESCE(full_name, email, 'user') INTO target_name
      FROM public.profiles WHERE id = OLD.user_id;
    SELECT name INTO inst_name
      FROM public.institutions WHERE id = OLD.institution_id;
    log_msg := actor_name || ' revoked ' || COALESCE(target_name, 'user') ||
      '''s access to ' || COALESCE(inst_name, 'an institution');
    INSERT INTO public.role_audit_log (
      action_type, actor_user_id, actor_name,
      target_user_id,
      old_value, new_value, description
    ) VALUES (
      'institution_access_revoked', actor_id, actor_name,
      OLD.user_id,
      jsonb_build_object('access_type', OLD.access_type, 'institution_name', inst_name),
      NULL,
      log_msg
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Attach triggers --------------------------------------------------------
DROP TRIGGER IF EXISTS trg_log_custom_role_change ON public.custom_roles;
CREATE TRIGGER trg_log_custom_role_change
  AFTER INSERT OR UPDATE OR DELETE ON public.custom_roles
  FOR EACH ROW EXECUTE FUNCTION public.log_custom_role_change();

DROP TRIGGER IF EXISTS trg_log_user_role_change ON public.user_roles;
CREATE TRIGGER trg_log_user_role_change
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.log_user_role_change();

DROP TRIGGER IF EXISTS trg_log_institution_access_change ON public.user_institution_access;
CREATE TRIGGER trg_log_institution_access_change
  AFTER INSERT OR UPDATE OR DELETE ON public.user_institution_access
  FOR EACH ROW EXECUTE FUNCTION public.log_institution_access_change();

-- 9. Grant necessary privileges ---------------------------------------------
GRANT SELECT ON public.role_audit_log TO authenticated;

-- Comments
COMMENT ON TABLE public.role_audit_log IS 'Plain-English audit trail of every role/permission change. Populated by triggers on custom_roles, user_roles, and user_institution_access.';
COMMENT ON COLUMN public.role_audit_log.description IS 'Pre-generated human-readable description shown in the Permissions Audit > What Changed tab.';
