-- Comp-off claims carry supporting documents, like leave applications do.
--
-- "Claim a worked day" asserts that a holiday or week-off was actually worked;
-- the proof (duty roster, event order, a photo of the attendance register) had
-- nowhere to live — the claim was worked_date + notes only, and the approver
-- took it on faith. Same jsonb shape as hr_leave_applications.documents
-- (LeaveDocument[]: name, drive_file_id, url, mime_type, size_bytes,
-- uploaded_at) so the whole leave-document toolchain — LeaveDocumentUpload,
-- the Drive upload route, the authorising streaming proxy, LeaveDocumentList —
-- is reused rather than duplicated.
--
-- NOT NULL DEFAULT '[]' so existing rows and the dormant attendance/hr_grant
-- sources need no special-casing: no document is an empty array, never NULL.
--
-- "A document is required on claims" is enforced in
-- CompOffService.claimWorkedDay (like the leave document rule lives in
-- LeaveService.applyLeave), not as a CHECK — hr_grant and the dormant
-- attendance source legitimately create credits with no document.

ALTER TABLE public.hr_comp_off_credits
  ADD COLUMN IF NOT EXISTS documents jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.hr_comp_off_credits.documents IS
  'Supporting documents (LeaveDocument[] shape, Google Drive-backed) attached when the credit was claimed. Empty array for hr_grant/attendance sources.';
