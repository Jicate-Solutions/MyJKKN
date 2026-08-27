-- On Duty (Hourly) requires a supporting document, in every organization.
--
-- Same policy as day-based On-Duty: OD records duty already performed and the
-- document (duty order, invigilation slip, deputation letter) IS the control —
-- especially with sto_limit_mode='none' and an uncapped entitlement, the proof
-- is the only gate besides approval.
--
-- document_required_after_days stays NULL deliberately: NULL means "required at
-- any duration". An hourly request spans one day, so any threshold >= 1 would
-- quietly downgrade the document to optional (leaveDocumentRequirement treats
-- totalDays <= threshold as optional).
--
-- Enforced by LeaveService.applyLeave (shared leaveDocumentRequirement
-- predicate); the Apply Short Time Off drawer gained the matching upload field
-- in the same change (apply-short-time-off-drawer.tsx), so the flag is not
-- flipped ahead of a form that could satisfy it.

UPDATE public.hr_leave_types
SET requires_documents = true,
    document_required_after_days = NULL
WHERE leave_type_code = 'ODH'
  AND request_category = 'short_time_off';
