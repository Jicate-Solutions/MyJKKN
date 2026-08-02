-- Migration: 20260801001200_procurement_rfq_review
-- Purpose:  Super-Admin review gate for RFQs before they are sent to vendors.
--           New flow: draft → [submit] → pending_review → approve → approved → [send]
--           (or reject → rejected → creator edits → resubmit). Adds the review
--           audit columns and the three new status values. Permission that gates
--           approve/reject: procurement.rfq_approve (catalog in lib/constants/permissions.ts).

ALTER TABLE public.procurement_rfqs
    ADD COLUMN IF NOT EXISTS reviewed_by   UUID,
    ADD COLUMN IF NOT EXISTS reviewed_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS review_notes  TEXT;

ALTER TABLE public.procurement_rfqs
    DROP CONSTRAINT IF EXISTS procurement_rfqs_status_check;
ALTER TABLE public.procurement_rfqs
    ADD CONSTRAINT procurement_rfqs_status_check
    CHECK (status IN (
        'draft', 'pending_review', 'approved', 'rejected',
        'sent', 'quotations_received', 'compared', 'awarded', 'closed', 'cancelled'
    ));
