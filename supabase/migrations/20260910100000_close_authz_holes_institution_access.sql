-- 20260910100000_close_authz_holes_institution_access.sql
--
-- Three SECURITY DEFINER functions were callable by EVERY signed-in user
-- (~7,317 accounts) with no authorization check. Found 2026-08-19 while
-- sweeping the class that PR #3130 shipped and 20260901140000 fixed.
--
-- These are NOT from that wave. They are older and were live in production the
-- whole time.
--
-- ── 1 & 2. user_institution_access: who may see which college ───────────────
--
--   grant_user_institution_access(target_user_id, target_institution_id, ...)
--   revoke_user_institution_access(target_user_id, target_institution_id)
--
-- user_institution_access is the table role_has_institution_access() consults
-- to decide cross-institution visibility across 14 institutions. The grant
-- function upserts an ACTIVE grant for an ARBITRARY user id, so any signed-in
-- account could give itself another college's data. The revoke function could
-- strip any colleague's legitimate access.
--
-- Neither had a check of any kind. auth.uid() DID appear in the grant — inside
-- COALESCE(granted_by_param, auth.uid()), filling the audit column. It RECORDS
-- the actor and authorises no one. That is the same "recorded, not checked"
-- shape the CI gate was widened for on the same day.
--
-- WHY NOT SIMPLY REVOKE `authenticated`:
--   Both are called from the BROWSER by lib/services/users/user-institution-access-service.ts,
--   which uses createClientSupabaseClient() — the anon/session client. Revoking
--   `authenticated` would break Role Management for legitimate admins. The fix
--   must therefore be a guard INSIDE the function, with the grant retained.
--
-- WHICH PERMISSION:
--   The only caller of the write paths is
--   app/(routes)/users/role-management/_components/user-institution-access-manager.tsx.
--   /users/role-management is gated by 'roles.create' (lib/sidebarMenuLink.ts).
--   Measured 2026-08-19: 3 users hold roles.create, plus 14 super admins.
--
-- ── 3. user_has_permission(user_id uuid, permission_key text) ───────────────
--
-- The TWO-ARGUMENT overload resolves permissions for whichever user id the
-- caller passes and never compares it to auth.uid(). Combined with
-- profiles_select_policy — USING (auth.uid() IS NOT NULL), so any signed-in
-- user reads all 7,317 profile ids — the ENTIRE access-control map was
-- enumerable: 7,317 people x 1,930 permission keys, Director handover
-- delegations included. It is a disclosure oracle, not a write.
--
-- It was ALWAYS meant to be service_role-only; app/api/admission/bridge/convert/route.ts
-- even carries "Do NOT switch back to user_has_permission(user_id uuid, permission_key text)".
-- The revoke makes the ACL match the documented intent.
--
-- SAFE TO REVOKE — verified against production 2026-08-19, not assumed:
--   • 0 of 1,346 RLS policies referencing user_has_permission use the 2-arg form.
--   • 4 functions call it internally; ALL FOUR are SECURITY DEFINER, so they run
--     as the owner and never consult the caller's EXECUTE privilege.
--   • 0 TypeScript call sites pass permission_key; all 137 use permission_name.
--
-- NOTE ON REVOKES: `anon` is a MEMBER of `PUBLIC`. Revoking anon alone leaves a
-- PUBLIC grant intact and the function still reachable. Name both, every time.
--
-- Updated: 2026-08-19 - Added authorization guards + closed the 2-arg disclosure oracle.

-- ── 1. grant_user_institution_access ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.grant_user_institution_access(
    target_user_id uuid,
    target_institution_id uuid,
    -- Defaults PRESERVED verbatim from the live function. Dropping them fails
    -- with 42P13 "cannot remove parameter defaults from existing function" —
    -- caught by dry-running this file against production before opening the PR.
    -- Note what the first default means: a caller who omits access_type gets
    -- 'full'. That made the unguarded function worse, not milder.
    access_type_param text DEFAULT 'full'::text,
    granted_by_param uuid DEFAULT NULL::uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- The gate. Note this BRANCHES on the predicate; it does not merely record it.
    IF NOT (is_super_admin() OR is_admin() OR user_has_permission('roles.create')) THEN
        RAISE EXCEPTION 'grant_user_institution_access: roles.create required'
            USING ERRCODE = '42501';
    END IF;

    INSERT INTO user_institution_access (
        user_id, institution_id, access_type, granted_by, is_active, created_at, updated_at
    ) VALUES (
        target_user_id, target_institution_id, access_type_param,
        COALESCE(granted_by_param, auth.uid()),   -- audit column, NOT a check
        true, NOW(), NOW()
    )
    ON CONFLICT (user_id, institution_id)
    DO UPDATE SET
        access_type = access_type_param,
        granted_by  = COALESCE(granted_by_param, auth.uid()),
        is_active   = true,
        updated_at  = NOW();
END;
$$;

-- ── 2. revoke_user_institution_access ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.revoke_user_institution_access(
    target_user_id uuid,
    target_institution_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (is_super_admin() OR is_admin() OR user_has_permission('roles.create')) THEN
        RAISE EXCEPTION 'revoke_user_institution_access: roles.create required'
            USING ERRCODE = '42501';
    END IF;

    UPDATE user_institution_access
       SET is_active = false, updated_at = NOW()
     WHERE user_id = target_user_id
       AND institution_id = target_institution_id;
END;
$$;

-- `authenticated` is RETAINED on purpose for these two: the browser client is
-- the real caller and the guards above are what stop the abuse.
REVOKE EXECUTE ON FUNCTION public.grant_user_institution_access(uuid, uuid, text, uuid)  FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.revoke_user_institution_access(uuid, uuid)             FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.grant_user_institution_access(uuid, uuid, text, uuid)  TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.revoke_user_institution_access(uuid, uuid)             TO authenticated, service_role;

-- ── 3. close the disclosure oracle ──────────────────────────────────────────
-- No browser caller exists, so this one IS revoked rather than guarded.
-- service_role keeps it: server routes on a service-role client are unaffected.

REVOKE EXECUTE ON FUNCTION public.user_has_permission(uuid, text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.user_has_permission(uuid, text) TO service_role;

COMMENT ON FUNCTION public.user_has_permission(uuid, text) IS
  'SERVICE-ROLE ONLY. Takes a caller-supplied user id and never compares it to '
  'auth.uid(), so a signed-in caller could enumerate the whole permission map. '
  'EXECUTE was revoked from authenticated on 2026-08-19. Cookie-scoped callers '
  'must use the one-argument user_has_permission(text), which resolves auth.uid() '
  'internally.';
