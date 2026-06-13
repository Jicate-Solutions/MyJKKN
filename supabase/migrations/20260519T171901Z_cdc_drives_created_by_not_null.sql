-- =====================================================================
-- Migration: cdc_drives.created_by — add NOT NULL integrity constraint
-- =====================================================================
-- Context (T2.2 / B3.4):
--   C1 PR #1006 discovered that the drive-notification trigger
--   (migration 20260519T0444Z_cdc_drive_notifications.sql, line 73)
--   resolves the creator via:
--       (SELECT created_by FROM public.cdc_drives WHERE id = p_drive_id)
--   If that value is NULL, the notification path silently no-ops —
--   the trigger swallows the failure and no audit row is written for
--   the creator. Sprint 2's dispatcher MUST populate created_by, but
--   the table currently allows NULL at the schema layer, which makes
--   that contract unenforceable and the bug class recurring.
--
--   This migration closes the schema-level gap by promoting created_by
--   from nullable to NOT NULL, turning a silent-failure mode into a
--   loud INSERT-time error that surfaces during code review / tests.
--
-- Pre-check (run via Supabase Management API on 2026-05-19):
--   SELECT count(*) FROM cdc_drives WHERE created_by IS NULL;
--   -> 0 rows (table also has 0 rows total at the time of writing).
--
-- Safety:
--   * No backfill is performed. If a NULL row appears between
--     pre-check and apply, the ALTER will fail — that is the
--     intended loud-boundary behavior; resolve those rows in a
--     separate workstream.
--   * The existing FK to profiles(id) is preserved untouched.
--   * No other columns on cdc_drives are modified.
--
-- Reference: feedback_loud_boundary_principle, T2.2 (B3.4)
-- =====================================================================

ALTER TABLE public.cdc_drives
  ALTER COLUMN created_by SET NOT NULL;

COMMENT ON COLUMN public.cdc_drives.created_by IS
  'FK to profiles(id). NOT NULL — required so the drive-notification trigger '
  '(cdc_drive_notifications) can always resolve the creator and emit the '
  'expected audit/notification rows. Populating this column is the caller''s '
  'responsibility (Sprint 2 dispatcher, /cdc/drives create RPC, etc.).';
