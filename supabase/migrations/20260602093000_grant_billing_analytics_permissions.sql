-- ============================================================================
-- 20260602093000 — Grant billing.analytics.view/.export to relevant roles
-- ============================================================================
-- New keys billing.analytics.view / billing.analytics.export are declared in
-- lib/constants/permissions.ts, but declaring a key only populates the Role
-- Management UI — a role can't USE it until it's in custom_roles.permissions.
-- Without this grant the new /billing/analytics page (and its RPC gate
-- user_has_permission('billing.analytics.view')) would render empty for
-- everyone except super_admin.
--
-- Audience: data-driven — every role that already holds billing.reports.view
-- (analytics is a reports-family surface), PLUS the accounts + audit roles
-- explicitly. super_admin holds {"all": true} so it is implicitly covered.
-- Idempotent: the WHERE guard skips roles already granted.
-- ============================================================================

UPDATE public.custom_roles
   SET permissions = permissions
         || '{"billing.analytics.view": true, "billing.analytics.export": true}'::jsonb,
       updated_at  = now()
 WHERE (
         COALESCE(permissions->>'billing.reports.view', 'false') = 'true'
         OR role_key IN ('accounts', 'accountant_assistant', 'lead_auditor', 'external_auditor_timeboxed')
       )
   AND COALESCE(permissions->>'billing.analytics.view', 'false') <> 'true';
