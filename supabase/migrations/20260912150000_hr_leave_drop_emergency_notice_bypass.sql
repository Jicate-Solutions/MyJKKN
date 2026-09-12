-- =====================================================================================
-- HR Leave — the Emergency flag is gone; clear the notice rule it was excusing (2026-09-12)
-- =====================================================================================
--
-- The Apply Leave drawer's "Emergency leave" checkbox did two things: it bypassed
-- hr_leave_types.min_advance_notice_days, and it deferred a required supporting document
-- by 48 hours. HR has removed the feature, so both bypasses disappear with it.
--
-- THE NOTICE RULE CANNOT SURVIVE THE BYPASS UNCHANGED. Measured before this ran:
--
--   Clinical Leave  — 6 days notice, and 69 of its 69 requests were filed as emergencies.
--                     19 of them are still open.
--   Vacation Leave  — 14 days notice, 1 request, also an emergency.
--
-- Every single request against a notice-bearing type went through the bypass. Leaving the
-- notice in place would therefore not "restore a rule" — it would make Clinical Leave
-- unfileable in the way it has always actually been filed, with nothing left to excuse it.
-- So the two types that carry a notice are set to zero, which is the behaviour staff have
-- experienced all along.
--
-- The CHECK itself stays in LeaveService.applyLeave and in the drawer, unchanged apart
-- from losing the `!payload.is_emergency &&` guard: a type that genuinely wants advance
-- notice can still ask for it, and it will now be enforced without exception.
--
-- DATA ONLY — no schema change, nothing to mirror into supabase/setup/.
--
-- hr_leave_applications.is_emergency is deliberately KEPT, along with all 186 rows that
-- carry it. Nothing writes true any more and no screen shows it; rewriting history to
-- make a removed feature look like it never existed would be worse than leaving the fact
-- in place. fn_generate_pending_leave_approval_items still reads the column to pick a
-- work-item priority — new rows are all false, so it simply resolves to the normal lane.
-- =====================================================================================

UPDATE public.hr_leave_types
   SET min_advance_notice_days = 0,
       updated_at = now()
 WHERE min_advance_notice_days > 0;
