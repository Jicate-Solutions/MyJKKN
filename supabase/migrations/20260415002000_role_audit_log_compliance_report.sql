-- Migration: extend role_audit_log.action_type CHECK constraint to include
-- the 'compliance_report_downloaded' event. Required by the Permissions
-- Compliance Report PDF download endpoint which logs every download.
--
-- Updated: 2026-04-15 - Added compliance_report_downloaded action type

ALTER TABLE role_audit_log
  DROP CONSTRAINT IF EXISTS role_audit_log_action_type_check;

ALTER TABLE role_audit_log
  ADD CONSTRAINT role_audit_log_action_type_check CHECK (
    action_type = ANY (ARRAY[
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
      'compliance_report_downloaded'::text
    ])
  );
