-- ─── Budget line attachments on Google Drive (BUG-004627) ────────────────────
-- 2026-09-25
--
-- Reported by the COO: "Please add attachment option for the budget option."
--
-- event_budget_items.receipt_url has existed since the marathon era but nothing
-- ever wrote it. Budget lines now take ONE attachment each (bill, quotation,
-- receipt), uploaded to Google Drive by
--   POST /api/events/[eventId]/budget-attachment
-- which stores the Drive view link in receipt_url and adds:
--   receipt_drive_file_id — the Drive file id, so a replaced or removed
--                            attachment's file can be deleted from Drive;
--   receipt_name          — the original filename, shown on the budget line.
--
-- The route writes these through the CALLER's session, so the existing
-- event_budget_items write policies and fn_guard_event_budget_locked still
-- decide who may attach. That trigger lists the PLAN columns it freezes after
-- approval; these two new columns are not among them, so — like receipt_url —
-- an in-charge can still attach a bill after the budget is approved (while the
-- books are open), which is when bills actually arrive.
--
-- No BEGIN/COMMIT: applied through exec_sql (scripts/apply-migration-file.mjs).
-- Idempotent.

ALTER TABLE public.event_budget_items
  ADD COLUMN IF NOT EXISTS receipt_drive_file_id text,
  ADD COLUMN IF NOT EXISTS receipt_name text;

COMMENT ON COLUMN public.event_budget_items.receipt_drive_file_id IS
  'Google Drive file id of the attachment whose view link is receipt_url (BUG-004627).';
COMMENT ON COLUMN public.event_budget_items.receipt_name IS
  'Original filename of the attachment in receipt_url (BUG-004627).';

NOTIFY pgrst, 'reload schema';
