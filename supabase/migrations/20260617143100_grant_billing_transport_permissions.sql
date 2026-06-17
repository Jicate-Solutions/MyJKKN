-- 20260617143100_grant_billing_transport_permissions.sql
--
-- Grant billing.transport.view / .collect to finance/collection roles (those that already
-- manage billing schedules or payments). Idempotent. super_admin is covered by the RBAC
-- wildcard and needs no explicit grant.
UPDATE public.custom_roles
   SET permissions = permissions
         || '{"billing.transport.view": true, "billing.transport.collect": true}'::jsonb,
       updated_at  = now()
 WHERE (
         COALESCE(permissions->>'billing.schedule.view', 'false') = 'true'
         OR COALESCE(permissions->>'billing.payment.view', 'false') = 'true'
         OR role_key IN ('accounts', 'accountant_assistant', 'payment_audit_admin')
       )
   AND COALESCE(permissions->>'billing.transport.view', 'false') <> 'true';
