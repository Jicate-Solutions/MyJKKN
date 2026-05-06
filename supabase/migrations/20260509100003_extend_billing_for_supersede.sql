-- ============================================================================
-- 20260509100003 — Extend billing schema for supersede + reallocation
-- ============================================================================
-- Spec §6.5. Adds:
--   billing_student_bills.superseded_by_bill_id (FK to self)
--   billing_student_bills.status now allows 'superseded'
--   billing_receipt_items.allocation_reason
-- ============================================================================

-- Add the new column
ALTER TABLE public.billing_student_bills
    ADD COLUMN IF NOT EXISTS superseded_by_bill_id uuid REFERENCES public.billing_student_bills(id);

-- Drop the existing status constraint (named per project convention) + replace
DO $$
BEGIN
    -- Find any check constraint on billing_student_bills.status
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
         WHERE table_schema='public' AND table_name='billing_student_bills'
           AND constraint_type='CHECK'
           AND constraint_name LIKE '%status%'
    ) THEN
        EXECUTE (
            SELECT format('ALTER TABLE public.billing_student_bills DROP CONSTRAINT %I', constraint_name)
              FROM information_schema.table_constraints
             WHERE table_schema='public' AND table_name='billing_student_bills'
               AND constraint_type='CHECK'
               AND constraint_name LIKE '%status%'
             LIMIT 1
        );
    END IF;
END$$;

ALTER TABLE public.billing_student_bills
    ADD CONSTRAINT billing_student_bills_status_check
    CHECK (status IN ('unpaid','partially_paid','paid','superseded'));

-- Add allocation_reason on receipt_items
ALTER TABLE public.billing_receipt_items
    ADD COLUMN IF NOT EXISTS allocation_reason text NOT NULL DEFAULT 'original_payment'
        CHECK (allocation_reason IN
            ('original_payment','fee_structure_change_reallocation','manual_reallocation'));
