-- Migration: 20260801001700_procurement_pr_item_quantity_audit
-- Purpose:  Structured audit trail for "Modify & Approve" on Purchase Requests
--           (the approver may correct a requested item's quantity before
--           approving). Previously the before -> after change was only recorded
--           as a free-text line appended to the PR's notes field, unlike every
--           other audit trail in this module (procurement_rfqs.reviewed_by/
--           reviewed_at/review_notes, procurement_grn_items.missing_quantity),
--           which use dedicated structured columns instead of prose.
--           original_quantity stays NULL for items never modified at approval.

ALTER TABLE public.procurement_purchase_request_items
    ADD COLUMN IF NOT EXISTS original_quantity     NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS quantity_modified_by   UUID,
    ADD COLUMN IF NOT EXISTS quantity_modified_at   TIMESTAMPTZ;
