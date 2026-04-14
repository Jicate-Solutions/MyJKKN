-- ============================================================================
-- Migration: extend role_audit_log action_type to support preview events
-- Date: 2026-04-14 (v2 Phase 2 PR #3 — See As User Preview)
-- ============================================================================
-- Adds 3 new allowed values to the role_audit_log.action_type CHECK constraint:
--   - 'preview_session_started'   — super admin opened a preview session
--   - 'preview_session_ended'     — session was closed (manual exit or expiry)
--   - 'preview_mutation_blocked'  — a mutation was attempted during read-only
--                                   preview and the middleware rejected it
--
-- Applied to production 2026-04-14 via Supabase MCP (tested on staging first).
-- Non-destructive: pure constraint relaxation, no data changes.
-- ============================================================================

ALTER TABLE public.role_audit_log DROP CONSTRAINT IF EXISTS role_audit_log_action_type_check;
ALTER TABLE public.role_audit_log ADD CONSTRAINT role_audit_log_action_type_check
  CHECK (action_type = ANY (ARRAY[
    'role_created', 'role_updated', 'role_deleted',
    'user_role_assigned', 'user_role_revoked', 'user_role_primary_changed',
    'institution_access_granted', 'institution_access_revoked', 'institution_access_updated',
    'preview_session_started', 'preview_session_ended', 'preview_mutation_blocked'
  ]));
