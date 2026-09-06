-- ============================================================================
-- 20260909001000 — Register school_fees.collect
-- ============================================================================
-- Grants the School Bill Payment counter (/billing/school-fees/collect).
--
-- Same mechanism as 20260813100007: there is NO permissions catalogue or
-- role_permissions join table — public.user_has_permission(text) reads the
-- JSONB `permissions` column on public.custom_roles.
--
-- KEY FORMAT WARNING: the application must use 'school_fees.collect'
-- BYTE-IDENTICALLY (underscore in the namespace, dot before the verb). A
-- dotted or hyphenated variant denies silently with no error.
--
-- WHY a separate key rather than reusing school_fees.read:
-- reading a fee plan and taking money at the counter are different privileges.
-- Front-office staff who collect payments should not necessarily be able to
-- edit plans, and read-only finance reviewers should not be able to receipt.
--
-- Grants (deliberately WIDER than .manage — the counter is front-office work):
--   accounts, accountant_assistant, administrator, super_admin
--
-- ADDS a key via the `||` merge operator only. No existing permission key is
-- removed or overwritten, and no college billing permission is affected.
-- ============================================================================

UPDATE public.custom_roles
   SET permissions = COALESCE(permissions, '{}'::jsonb) || '{"school_fees.collect": true}'::jsonb,
       updated_at  = now()
 WHERE role_key IN ('accounts','accountant_assistant','administrator','super_admin')
   AND COALESCE((permissions->>'school_fees.collect')::boolean, false) = false;
