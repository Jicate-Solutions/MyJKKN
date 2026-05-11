-- ============================================================================
-- 20260508100003 — Register admission_documents.manage permission
-- ============================================================================
-- Counsellors collect documents from parents at the time of admission, so
-- they need this permission. Admin-tier roles too.
-- ============================================================================

UPDATE public.custom_roles
   SET permissions = permissions || '{"admission_documents.manage": true}'::jsonb,
       updated_at  = now()
 WHERE role_key IN ('admission_counselor','expo_counselor','administrator','super_admin')
   AND COALESCE(permissions->>'admission_documents.manage','false') <> 'true';
