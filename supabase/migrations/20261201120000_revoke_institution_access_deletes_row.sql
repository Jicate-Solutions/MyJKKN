-- ============================================================================
-- Revoking cross-institution access must actually revoke it
-- Created: 2026-09-12
--
-- THE DEFECT
--   revoke_user_institution_access() only did:
--       UPDATE user_institution_access SET is_active = false
--   But 38 RLS policies across 31 tables read that table WITHOUT checking
--   is_active. Verified from the live catalogue; the shape is always:
--       institution_id IN (SELECT institution_id FROM user_institution_access
--                          WHERE user_id = auth.uid())
--   Affected: the entire Internship module (19 tables), WhatsApp automation
--   (6), LTI grades/launches (2), institution_off_days, and both
--   leave-approval tables. 23 other policies DO check is_active, so the flag
--   is not wrong — those 31 tables simply never consulted it.
--
--   Net effect: clicking "Revoke" in Role Management removed the grant from
--   some modules and silently left it standing in others. A revoke that half
--   works is worse than one that fails loudly, because the admin is told it
--   succeeded.
--
--   Current exposure is small — only ONE grant has ever been revoked, and that
--   person's role already carries institution_scope='all', so the stale row
--   conferred nothing extra. This is a loaded gun, not a smoking one: the next
--   revoke that actually matters would have failed the same way.
--
-- THE FIX: delete the row. Then there is nothing for a policy to miss,
--   whether or not it checks is_active.
--
-- THE AUDIT TRAIL IS NOT LOST — this was the deciding factor.
--   trg_log_institution_access_change already fires AFTER INSERT OR DELETE OR
--   UPDATE, and log_institution_access_change() has a full TG_OP='DELETE'
--   branch that writes action_type 'institution_access_revoked' to
--   role_audit_log with the old access_type and institution name. The delete
--   path is the one the audit system was designed for; the soft delete logged
--   the weaker 'institution_access_updated ... INACTIVE'. Deleting produces a
--   BETTER record, not a worse one.
--
--   Safe to delete outright: user_institution_access has ZERO inbound foreign
--   keys (verified in pg_constraint), so nothing dangles.
--
-- is_active IS KEPT. 23 policies read it correctly and grant_user_institution_
--   access() sets it on insert. It simply should never be false again.
-- ============================================================================

-- ── 1. Revoke one grant ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.revoke_user_institution_access(
  target_user_id uuid,
  target_institution_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT (is_super_admin() OR is_admin() OR user_has_permission('roles.create')) THEN
        RAISE EXCEPTION 'revoke_user_institution_access: roles.create required'
            USING ERRCODE = '42501';
    END IF;

    -- DELETE, not a flag. 31 tables' policies never read is_active, so a soft
    -- delete left the access standing while reporting success.
    DELETE FROM user_institution_access
     WHERE user_id = target_user_id
       AND institution_id = target_institution_id;
END;
$function$;

-- ── 2. Revoke every grant a person holds ────────────────────────────────────
-- Needed by the external-auditor offboarding endpoint, which revokes a whole
-- person rather than one institution. That endpoint previously wrote to the
-- table directly with the CALLER'S client — and user_institution_access has no
-- UPDATE/DELETE policy for `authenticated` and no SELECT policy for other
-- people's rows, so it matched zero rows and returned {revoked: true} anyway.
-- Routing it through a SECURITY DEFINER RPC is what makes it work at all.
CREATE OR REPLACE FUNCTION public.revoke_all_user_institution_access(
  target_user_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted integer;
BEGIN
    IF NOT (
      is_super_admin()
      OR is_admin()
      OR user_has_permission('roles.create')
      OR user_has_permission('audit.external_auditor.manage')
    ) THEN
        RAISE EXCEPTION 'revoke_all_user_institution_access: roles.create or audit.external_auditor.manage required'
            USING ERRCODE = '42501';
    END IF;

    IF target_user_id IS NULL THEN
        RETURN 0;
    END IF;

    DELETE FROM user_institution_access
     WHERE user_id = target_user_id;

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;   -- so the caller can report a truthful count
END;
$function$;

COMMENT ON FUNCTION public.revoke_all_user_institution_access(uuid) IS
  'Deletes every cross-institution grant held by one person and returns how many were removed. Used by external-auditor offboarding. Deletes rather than flagging because 31 tables'' RLS policies do not read is_active; the delete is recorded in role_audit_log by trg_log_institution_access_change.';

-- Restates the existing production ACL for both functions (verified via
-- pg_proc.proacl: anon false, authenticated true, service_role true). anon must
-- never reach an administrative revoke.
REVOKE EXECUTE ON FUNCTION public.revoke_user_institution_access(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.revoke_user_institution_access(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.revoke_all_user_institution_access(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.revoke_all_user_institution_access(uuid) TO authenticated, service_role;

-- ── 3. Finish the one revoke that never took effect ─────────────────────────
-- Exactly one row sits at is_active = false. It is a revocation an admin
-- performed on 2025-07-07 that the 31 tables above never honoured. Now that
-- revoke means delete, this row is in a state the system no longer produces.
--
-- The row, recorded here so it is restorable if ever needed:
--   id              fce15d09-3ac6-4bee-84f2-50ebd9cffc5a
--   user_id         2f05a806-35c5-4e05-90e3-1f593ec74bfc  (gandhimathi.v@jkkn.ac.in)
--   institution_id  e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5  (JKKN Dental College and Hospital)
--   access_type     billing_only
--   granted_at      2025-06-28 11:59:02.024962+00
--   revoked (updated_at) 2025-07-07 05:50:10.500742+00
--
-- Deleting it removes no effective privilege: that account's role `accounts`
-- carries institution_scope='all', so it reaches every institution regardless.
-- The delete is logged to role_audit_log by the existing trigger.
DELETE FROM public.user_institution_access
 WHERE is_active = false;
