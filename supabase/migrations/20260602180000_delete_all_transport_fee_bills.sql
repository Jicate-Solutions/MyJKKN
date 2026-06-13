-- ============================================================================
-- 20260602180000 — Delete ALL transport-fee student bills (data cleanup).
-- ============================================================================
-- Request: remove every bill under the Transport Fee category
-- (billing_categories.kind = 'transport'), plus any bill-related dependent
-- rows, across all institutions.
--
-- State at deletion time (2026-06-02): 594 transport bills totalling
-- ₹16,06,500 — ALL with status='unpaid'. No payment had ever been collected,
-- so there were ZERO billing_receipt_items, billing_discounts, and
-- payment_transaction_items referencing these bills. Nothing financial is lost.
--
-- Dependency / blast-radius analysis (FKs referencing billing_student_bills):
--   billing_discounts.bill_id            -> CASCADE   (0 rows)
--   billing_receipt_items.bill_id        -> CASCADE   (0 rows)
--   payment_transaction_items.bill_id    -> CASCADE   (0 rows)
--   billing_student_bills.superseded_by_bill_id -> NO ACTION (0 referencing)
--   student_credit_balances.consumed_against_bill_id -> NO ACTION (0 referencing)
--   billing_deletion_dependencies        -> VIEW (computed live; self-corrects)
--   mv_student_billing_summary           -> auto-refreshed by AFTER DELETE trigger
--   webhook_logs                         -> 1 audit row per bill via safety_log_delete
--
-- NOT touched (intentional scope boundary):
--   * The "Transport Fee" billing_categories row itself (kept — future
--     transport bills still work).
--   * Learner transport config (learners_profiles.bus_required / route / stop,
--     tms_route*) — those are assignments, not bills.
--   * Hostel bills (kind='hostel') — unchanged (62 rows).
--
-- Data-only deletion; no schema change. Hard delete (no soft-delete column);
-- only the webhook_logs SAFETY_ALERT audit trail remains. Idempotent — a
-- re-run deletes nothing once the rows are gone.
-- ============================================================================

DELETE FROM public.billing_student_bills b
USING public.billing_categories c
WHERE b.item_category_id = c.id
  AND c.kind = 'transport';

-- mv_student_billing_summary is refreshed automatically by
-- trigger_bills_refresh_summary (AFTER DELETE). No manual REFRESH needed.
