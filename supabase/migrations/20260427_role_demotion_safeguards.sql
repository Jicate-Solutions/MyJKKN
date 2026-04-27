-- ============================================================================
-- Migration: role_demotion_safeguards
-- Date: 2026-04-27
-- Author: Agent I (role-revert-prevention-server-side)
--
-- Bug context (the "role reverter" mystery, 2026-04-23 → 2026-04-27)
-- ----------------------------------------------------------------------
-- Agent A's 20260423 migration set the 8 counselor users into the correct
-- state. Three days later, jeevavarshinis.dp@jkkn.ac.in's profiles.role had
-- regressed from `counselor` to `student`. Agent D's forensic audit
-- (PR #516) confirmed the cause: a privileged user (Boobalan, super_admin)
-- manually re-assigned the user as Student via /users/role-management.
-- The trigger `sync_primary_role_to_profile()` faithfully replayed that
-- change to profiles.role with no audit trail or warning.
--
-- This migration ships TWO server-side defense-in-depth protections:
--
-- Protection 1 — Trigger awareness
--   Update `sync_primary_role_to_profile()` so that when it observes a
--   transition AWAY from a `counselor` role for a user who has admission
--   call_logs / leads / pending callbacks, it writes a
--   `counselor_demotion_warned` row into role_audit_log with the actor,
--   target, before/after snapshot, and impact counts. The trigger never
--   deletes user_role rows itself; it only flips is_primary on others —
--   so counselor permission membership survives a demotion.
--
-- Protection 2 — Pre-demotion impact RPC
--   New `fn_check_role_demotion_impact(target_user_id UUID, new_role TEXT)`
--   returns counts of admission_call_logs, admission_leads, and pending
--   admission_callback_queue rows owned by the target user. UI surfaces
--   (Agent G's confirmation dialog, Role Management page) call this RPC
--   before allowing a counselor demotion so the actor sees what they
--   will abandon.
--
-- Idempotent: every CREATE has IF NOT EXISTS / OR REPLACE.
-- Non-destructive: zero DROP/ALTER on existing tables. Only the existing
-- function `sync_primary_role_to_profile()` is replaced, with backward-
-- compatible behavior for non-counselor role changes.
-- ============================================================================

BEGIN;

-- =============================================================================
-- 1. Extend role_audit_log action_type CHECK constraint
-- =============================================================================
ALTER TABLE public.role_audit_log
  DROP CONSTRAINT IF EXISTS role_audit_log_action_type_check;

ALTER TABLE public.role_audit_log
  ADD CONSTRAINT role_audit_log_action_type_check
  CHECK (action_type = ANY (ARRAY[
    'role_created'::text,
    'role_updated'::text,
    'role_deleted'::text,
    'user_role_assigned'::text,
    'user_role_revoked'::text,
    'user_role_primary_changed'::text,
    'institution_access_granted'::text,
    'institution_access_revoked'::text,
    'institution_access_updated'::text,
    'preview_session_started'::text,
    'preview_session_ended'::text,
    'preview_mutation_blocked'::text,
    'compliance_report_downloaded'::text,
    'counselor_demotion_warned'::text
  ]));

-- =============================================================================
-- 2. Replace sync_primary_role_to_profile() with counselor-aware logic
-- =============================================================================
-- Behavior:
--   - For non-counselor role changes: identical to existing behavior (UPDATE
--     profiles.role + flip other is_primary flags to false).
--   - For counselor demotions (OLD role was counselor, NEW is something else,
--     and the user has live admission_call_logs / leads / pending callbacks):
--     write a `counselor_demotion_warned` row to role_audit_log with full
--     before/after snapshot + impact counts.
--   - For counselor PROMOTIONS (e.g. assigning counselor): no warning, the
--     change is purely additive.
--   - The trigger NEVER deletes user_role rows — counselor permission
--     membership is preserved through a demotion (only is_primary flips).

CREATE OR REPLACE FUNCTION public.sync_primary_role_to_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    primary_role_key  TEXT;
    old_role_key      TEXT;
    actor_uid         UUID;
    actor_name        TEXT;
    actor_email       TEXT;
    actor_role        TEXT;
    target_email      TEXT;
    impact_call_logs  INTEGER := 0;
    impact_leads      INTEGER := 0;
    impact_callbacks  INTEGER := 0;
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        IF NEW.is_primary = true THEN
            -- Resolve incoming role_key
            SELECT cr.role_key INTO primary_role_key
            FROM custom_roles cr
            WHERE cr.id = NEW.role_id;

            -- Capture previous primary role_key for transition detection
            IF TG_OP = 'UPDATE' THEN
                SELECT cr.role_key INTO old_role_key
                FROM user_roles ur
                JOIN custom_roles cr ON cr.id = ur.role_id
                WHERE ur.user_id = NEW.user_id
                  AND ur.is_primary = true
                  AND ur.id != NEW.id
                LIMIT 1;
            ELSIF TG_OP = 'INSERT' THEN
                -- For INSERT, look at profiles.role (reflects the prior
                -- primary role even if the corresponding row was already
                -- revoked — this is the Boobalan flow: DELETE-all + INSERT-fresh).
                SELECT role INTO old_role_key
                FROM profiles
                WHERE id = NEW.user_id;
            END IF;

            -- Counselor-demotion detection
            IF old_role_key = 'counselor'
               AND COALESCE(primary_role_key, '') != 'counselor'
            THEN
                SELECT COUNT(*) INTO impact_call_logs
                FROM admission_call_logs
                WHERE counselor_id = NEW.user_id;

                SELECT COUNT(*) INTO impact_leads
                FROM admission_leads
                WHERE assigned_counselor_id = NEW.user_id;

                SELECT COUNT(*) INTO impact_callbacks
                FROM admission_callback_queue
                WHERE assigned_counselor_id = NEW.user_id
                  AND status NOT IN ('resolved', 'closed');

                -- Only warn if there is real attached state
                IF (impact_call_logs + impact_leads + impact_callbacks) > 0 THEN
                    actor_uid := auth.uid();

                    IF actor_uid IS NOT NULL THEN
                        SELECT
                            COALESCE(p.full_name, p.email, 'Unknown user'),
                            p.email,
                            p.role
                        INTO actor_name, actor_email, actor_role
                        FROM profiles p
                        WHERE p.id = actor_uid;
                    ELSE
                        actor_name := 'System';
                    END IF;

                    SELECT email INTO target_email
                    FROM profiles
                    WHERE id = NEW.user_id;

                    INSERT INTO role_audit_log (
                        action_type,
                        actor_user_id,
                        actor_name,
                        actor_email,
                        actor_role,
                        target_user_id,
                        target_email,
                        target_role_id,
                        old_value,
                        new_value,
                        description,
                        metadata,
                        affected_user_count
                    ) VALUES (
                        'counselor_demotion_warned',
                        actor_uid,
                        actor_name,
                        actor_email,
                        actor_role,
                        NEW.user_id,
                        target_email,
                        NEW.role_id,
                        jsonb_build_object('role_key', old_role_key),
                        jsonb_build_object('role_key', primary_role_key),
                        format(
                            'WARN: counselor demotion (%s -> %s) for user with %s call logs / %s leads / %s pending callbacks',
                            old_role_key,
                            COALESCE(primary_role_key, 'NULL'),
                            impact_call_logs,
                            impact_leads,
                            impact_callbacks
                        ),
                        jsonb_build_object(
                            'impact_call_logs', impact_call_logs,
                            'impact_leads', impact_leads,
                            'impact_callbacks', impact_callbacks,
                            'trigger_op', TG_OP,
                            'user_role_id', NEW.id,
                            'source', 'sync_primary_role_to_profile'
                        ),
                        1
                    );
                END IF;
            END IF;

            -- Original behavior: update profiles.role
            UPDATE profiles
            SET role = primary_role_key, updated_at = NOW()
            WHERE id = NEW.user_id;

            -- Original behavior: unset primary on other rows (NEVER deletes)
            UPDATE user_roles
            SET is_primary = false
            WHERE user_id = NEW.user_id
              AND id != NEW.id
              AND is_primary = true;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_primary_role_to_profile IS
'Syncs primary role to profiles.role for backward compatibility. Writes a counselor_demotion_warned audit row when a counselor with live admission artifacts is demoted (Agent I, 2026-04-27).';

DROP TRIGGER IF EXISTS sync_primary_role_trigger ON public.user_roles;
CREATE TRIGGER sync_primary_role_trigger
    AFTER INSERT OR UPDATE OF is_primary ON public.user_roles
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_primary_role_to_profile();

-- =============================================================================
-- 3. fn_check_role_demotion_impact RPC
-- =============================================================================
-- Returns the impact counts for demoting a counselor user. UI surfaces
-- (Agent G's confirmation dialog, Role Management page) call this BEFORE
-- allowing a destructive role change so the actor sees what they will
-- abandon.

CREATE OR REPLACE FUNCTION public.fn_check_role_demotion_impact(
    target_user_id UUID,
    new_role       TEXT
)
RETURNS TABLE (
    target_user_id_out      UUID,
    target_email            TEXT,
    target_current_role     TEXT,
    new_role_key            TEXT,
    is_counselor_demotion   BOOLEAN,
    impact_call_logs        INTEGER,
    impact_leads            INTEGER,
    impact_pending_callbacks INTEGER,
    has_impact              BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_target_email     TEXT;
    v_current_role     TEXT;
    v_is_demotion      BOOLEAN;
    v_call_logs        INTEGER := 0;
    v_leads            INTEGER := 0;
    v_callbacks        INTEGER := 0;
BEGIN
    -- Permission gate
    IF NOT (
        is_super_admin()
        OR is_admin()
        OR user_has_permission('users.permissions_audit.view')
        OR user_has_permission('admission.counselors.view')
        OR user_has_permission('admission.counselors.edit')
    ) THEN
        RAISE EXCEPTION 'permission denied: fn_check_role_demotion_impact'
            USING ERRCODE = '42501';
    END IF;

    SELECT p.email, p.role INTO v_target_email, v_current_role
    FROM profiles p
    WHERE p.id = target_user_id;

    v_is_demotion := (v_current_role = 'counselor'
                      AND COALESCE(new_role, '') != 'counselor');

    SELECT COUNT(*) INTO v_call_logs
    FROM admission_call_logs
    WHERE counselor_id = target_user_id;

    SELECT COUNT(*) INTO v_leads
    FROM admission_leads
    WHERE assigned_counselor_id = target_user_id;

    SELECT COUNT(*) INTO v_callbacks
    FROM admission_callback_queue
    WHERE assigned_counselor_id = target_user_id
      AND status NOT IN ('resolved', 'closed');

    RETURN QUERY SELECT
        target_user_id,
        v_target_email,
        v_current_role,
        new_role,
        v_is_demotion,
        v_call_logs,
        v_leads,
        v_callbacks,
        (v_call_logs + v_leads + v_callbacks) > 0;
END;
$$;

COMMENT ON FUNCTION public.fn_check_role_demotion_impact IS
'Returns admission-artifact counts attached to target user. UI calls this before permitting counselor demotion (Agent I, 2026-04-27).';

GRANT EXECUTE ON FUNCTION public.fn_check_role_demotion_impact(UUID, TEXT)
    TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
