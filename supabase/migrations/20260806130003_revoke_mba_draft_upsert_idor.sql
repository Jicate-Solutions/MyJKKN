-- Migration: Close IDOR on fn_mba_dept_artifact_ai_draft_upsert
-- Created: 2026-07-28
-- fn_mba_dept_artifact_ai_draft_upsert is a SECURITY DEFINER writer that creates/
-- overwrites the AI-drafted playbook artifact for an improvement area. It was
-- GRANTed EXECUTE to `authenticated` but has NO in-body permission guard, so ANY
-- logged-in user could call it directly (public anon key is in the client bundle)
-- and overwrite any department's playbook draft for any area. Its ONLY legitimate
-- caller is the service-role path lib/services/mba-dept-artifacts/collect-drafts.ts
-- (admin.rpc(...)), which runs as service_role — that grant is retained.
-- Fix: revoke EXECUTE from authenticated + anon + PUBLIC. Do NOT add an in-body
-- `auth.uid() IS NULL` guard: the legitimate caller runs as service_role where
-- auth.uid() is NULL, so that check would break drafting.
-- Applied to prod 2026-07-28 via Mgmt-API; grants after: service_role, postgres only.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.fn_mba_dept_artifact_ai_draft_upsert(uuid, text, jsonb, text, text, uuid) FROM authenticated, anon, PUBLIC;
