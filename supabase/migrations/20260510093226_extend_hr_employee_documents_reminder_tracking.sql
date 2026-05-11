-- ============================================================================
-- HR Employee Documents — Reminder Tracking Columns (T1.5b Phase 2b)
-- ============================================================================
-- Created: 2026-05-10
-- Spec: specs/hr-module-decomposition-2026-05-09.md (Tier 1, T1.5b Phase 2b)
--
-- Adds 3 nullable timestamptz columns used by the document-expiry reminder
-- cron (/api/cron/hr/document-expiry-reminders) for idempotency.
--
-- Decision: schema-extend the existing table with 3 columns instead of
-- creating a separate hr_employee_documents_reminders log table.
-- Rationale:
--   * Cron only needs "have we already sent the 30/14/7-day reminder?" — not
--     a historical log. A boolean-style timestamp captures both "did we send"
--     and "when".
--   * Three columns add ~24 bytes/row * thousands of rows = trivial storage.
--   * Avoids a 1:1 join on every cron tick.
--   * Future log requirements (sender, error, who-was-emailed) can be added
--     via a separate audit table later without breaking this idempotency.
-- ============================================================================

ALTER TABLE public.hr_employee_documents
  ADD COLUMN IF NOT EXISTS last_reminder_30d_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_reminder_14d_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_reminder_7d_at  timestamptz;

COMMENT ON COLUMN public.hr_employee_documents.last_reminder_30d_at IS
  'Set when the cron sent the 30-day-before-expiry reminder for this row. NULL = never sent. Used for idempotency: cron skips rows where this is set within last 25 days.';
COMMENT ON COLUMN public.hr_employee_documents.last_reminder_14d_at IS
  'Set when the cron sent the 14-day-before-expiry reminder for this row. NULL = never sent.';
COMMENT ON COLUMN public.hr_employee_documents.last_reminder_7d_at IS
  'Set when the cron sent the 7-day-before-expiry reminder for this row. NULL = never sent.';
