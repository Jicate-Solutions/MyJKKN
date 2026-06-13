-- ============================================================================
-- 20260520150000 — Grant admission_documents.manage to the `admission`
--                  (Admission Officer) role
-- ============================================================================
-- Context (2026-05-20):
-- The original migration (20260508100003_register_admission_documents_permission.sql)
-- granted this permission to admission_counselor, expo_counselor, administrator,
-- and super_admin only. The `admission` (Admission Officer) role is a legitimate
-- admission-tier role that also needs to move enquiries through the lifecycle —
-- including the 'account' transition that calls
-- public.admission_account_transition_with_bills(), which raises 42501
-- (permission_denied) when this key is missing.
--
-- Symptom: Admission Officer hits "permission_denied: admission_documents.manage
-- required" from /learners/enquiries when changing status.
--
-- Pattern note: per project memory
-- (feedback_module_scope_needs_matching_perm_keys.md), RPCs gated on a
-- permission key only succeed for roles that explicitly carry that key in
-- custom_roles.permissions JSONB. Module-scope alone is not enough.
-- ============================================================================

UPDATE public.custom_roles
   SET permissions = permissions || '{"admission_documents.manage": true}'::jsonb,
       updated_at  = now()
 WHERE role_key = 'admission'
   AND COALESCE(permissions->>'admission_documents.manage','false') <> 'true';
