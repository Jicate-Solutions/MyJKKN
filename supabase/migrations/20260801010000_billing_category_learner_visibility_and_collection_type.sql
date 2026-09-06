-- =============================================================================
-- Billing categories: learner visibility + collection ownership
-- =============================================================================
-- Two additive, independently-managed flags on the (global, non-institution-scoped)
-- billing_categories master:
--
--   visible_to_learners — when FALSE the category still behaves normally for
--     Accounts/management (fee structures, bill generation, receipts, dashboards)
--     but its bills and receipt lines are hidden from the learner-facing
--     /learners/my-bills page and the parent portal. Purely a presentation gate
--     on the learner side; it does NOT restrict who may be billed or who may pay.
--
--   collection_type — 'government' marks fees collected ON BEHALF OF a government
--     body. That money passes through the institution and is NOT management
--     revenue, so the billing dashboards report it as a separate bucket.
--
-- Defaults reproduce today's behaviour exactly (everything visible, everything
-- management), so no backfill is required and no existing bill changes meaning.
--
-- Deliberately NOT pre-tagging University Fee / Exam Fee as 'government': the
-- same lesson the `kind` column taught us — a silent default misroutes money.
-- The operator picks per category, explicitly, in the category form.
--
-- text + CHECK rather than a Postgres enum so a third bucket ('university',
-- 'external', …) is a one-line migration later instead of an ALTER TYPE + cast
-- cascade through every RETURNS TABLE signature that mentions it.
-- =============================================================================

ALTER TABLE public.billing_categories
  ADD COLUMN IF NOT EXISTS visible_to_learners boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS collection_type     text    NOT NULL DEFAULT 'management';

ALTER TABLE public.billing_categories
  DROP CONSTRAINT IF EXISTS billing_categories_collection_type_chk;

ALTER TABLE public.billing_categories
  ADD CONSTRAINT billing_categories_collection_type_chk
  CHECK (collection_type IN ('management', 'government'));

COMMENT ON COLUMN public.billing_categories.visible_to_learners IS
  'FALSE = bills and receipt lines in this category are hidden from /learners/my-bills and the parent portal. Management side (fee structures, billing lists, dashboards) is unaffected.';

COMMENT ON COLUMN public.billing_categories.collection_type IS
  'management = institution revenue. government = collected on behalf of a government body; excluded from management collection totals on the billing dashboards.';

-- The collection split joins receipt_items -> bills -> categories on every
-- analytics call; make sure both hops are indexed.
CREATE INDEX IF NOT EXISTS idx_billing_receipt_items_bill_id
  ON public.billing_receipt_items (bill_id);

CREATE INDEX IF NOT EXISTS idx_billing_student_bills_item_category_id
  ON public.billing_student_bills (item_category_id);
