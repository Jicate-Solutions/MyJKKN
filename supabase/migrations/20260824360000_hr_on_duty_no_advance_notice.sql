-- =============================================================================
-- 20260824360000_hr_on_duty_no_advance_notice.sql
--
-- On-Duty Leave stops demanding 2 days advance notice.
--
-- THE BUG
-- -------
-- Filing On-Duty for a date in the past is refused:
--
--     This leave type requires 2 days advance notice. You gave -38.
--
-- On-Duty is not a request for time off — it RECORDS duty already performed: an
-- exam invigilation, a conference, an inspection, an official errand, each
-- approved against a document. You cannot give two days notice of a conference
-- you already attended, so the notice rule refuses the ONLY way the type is
-- ever legitimately used. Same shape as the 6-day annual cap fixed in
-- 20260824200000: it came along with the generic leave-type form, where
-- "notice" is a sensible thing to ask of planned absence.
--
-- IT ALSO CONTRADICTS THE DOCUMENT RULE, DIRECTLY. On-Duty carries
-- requires_documents = true, enforced since e1e241e79 — and the certificate or
-- duty order only exists AFTER the duty. So the two rules together said:
-- "attach the proof, and file it before the thing happens." Nothing could
-- satisfy both.
--
-- On-Duty was the only ACTIVE type with any notice requirement. Casual Leave,
-- Permission and Compensatory Off are all 0; Vacation is 14 but archived in
-- every organisation. This brings On-Duty in line with everything else staff
-- can actually file.
--
-- WHAT STILL BOUNDS A BACKDATED REQUEST
-- -------------------------------------
-- Notice = 0 means a request may name a past date, exactly as Casual Leave and
-- Permission already may. The controls that remain are the real ones: the
-- supporting document (which is the evidence the duty happened), the approval
-- chain, and trg_hla_block_leave_in_locked_period, which refuses any request
-- touching a LOCKED attendance month. Note that no attendance period is
-- currently locked, so month-close is the backstop that has to be running for
-- backdating to be bounded in practice — that is a process point, not something
-- this migration can fix.
--
-- Idempotent: the guard makes a re-run a no-op.
-- =============================================================================

UPDATE public.hr_leave_types
   SET min_advance_notice_days = 0,
       updated_at              = now()
 WHERE leave_type_code         = 'OD'
   AND min_advance_notice_days IS DISTINCT FROM 0;

COMMENT ON COLUMN public.hr_leave_types.min_advance_notice_days IS
  'How many days before the start date a request must be filed. 0 = no restriction, including backdating. Enforced in LeaveService.applyLeave and bypassed by is_emergency. Deliberately 0 for On-Duty: that type records duty already performed and is evidenced by a document that only exists afterwards, so any notice requirement would refuse its only legitimate use.';
