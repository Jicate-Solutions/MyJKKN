-- Backfill: approved regularizations whose attendance day was never stamped.
--
-- approveRequest() marks the request approved, then best-effort updates the
-- matching hr_attendance_records row. That second step silently no-op'd
-- whenever the staff member had no hr_staff_details row (the guard demanded an
-- hr_organization_id even for a plain UPDATE that never writes one), so the
-- report kept showing the biometric verdict — an approved regularization with
-- the day still ABSENT. Fixed in regularization-service.ts on 2026-08-27; this
-- repairs the rows approved before the fix.
--
-- Update-in-place only where a record exists (true for the 1 affected row —
-- NOT148, 2026-07-01, ABSENT despite an approved PRESENT regularization).
-- Punches are preserved: proposed_in_at/out_at only override when proposed.
-- reconciled_at IS NULL keeps this idempotent and away from days a human has
-- already reconciled.

UPDATE public.hr_attendance_records ar
SET status_type_id = COALESCE(
      r.proposed_status_type_id,
      (SELECT id FROM public.hr_attendance_status_types WHERE code = 'REGULARIZED')
    ),
    source         = 'regularization',
    in_at          = COALESCE(r.proposed_in_at,  ar.in_at),
    out_at         = COALESCE(r.proposed_out_at, ar.out_at),
    reconciled_by  = r.approver_id,
    reconciled_at  = r.approved_at,
    notes          = left(
      'Regularized: ' || COALESCE(rc.label, r.reason_text, ''), 500
    ),
    updated_at     = now()
FROM public.hr_attendance_regularizations r
LEFT JOIN public.hr_regularization_reasons rc ON rc.id = r.reason_code_id
WHERE r.status = 'approved'
  AND ar.employee_id = r.employee_id
  AND ar.work_date   = r.for_date
  AND ar.reconciled_at IS NULL;
