-- 20260605102000_bill_ledger_cycle_context.sql
-- Adds hostel-year / package / source context to bills and per-cycle dedup.
ALTER TABLE public.billing_student_bills
  ADD COLUMN IF NOT EXISTS hostel_year_id uuid NULL REFERENCES public.hostel_years(id),
  ADD COLUMN IF NOT EXISTS package_id uuid NULL REFERENCES public.admission_packages(id),
  ADD COLUMN IF NOT EXISTS fee_source text NOT NULL DEFAULT 'academic',
  ADD COLUMN IF NOT EXISTS applies_year_of_study int NULL;

ALTER TABLE public.billing_student_bills
  DROP CONSTRAINT IF EXISTS bsb_fee_source_chk,
  ADD CONSTRAINT bsb_fee_source_chk
    CHECK (fee_source IN ('academic','hostel_package','hostel_category','ad_hoc'));

-- Dedup A: category-keyed bills (academic + hostel category fees) — one per (student, hostel year, category).
CREATE UNIQUE INDEX IF NOT EXISTS uq_bill_dedup_category
  ON public.billing_student_bills (student_id, hostel_year_id, item_category_id)
  WHERE hostel_year_id IS NOT NULL
    AND fee_source IN ('academic','hostel_category')
    AND status <> 'cancelled';

-- Dedup B: flat package bills (item_category_id may be NULL) — one per (student, hostel year, package).
CREATE UNIQUE INDEX IF NOT EXISTS uq_bill_dedup_package
  ON public.billing_student_bills (student_id, hostel_year_id, package_id)
  WHERE hostel_year_id IS NOT NULL
    AND fee_source = 'hostel_package'
    AND status <> 'cancelled';

-- Helpful lookup for "which residents are billed for hostel year X".
CREATE INDEX IF NOT EXISTS ix_bill_hostel_year
  ON public.billing_student_bills (hostel_year_id, student_id)
  WHERE hostel_year_id IS NOT NULL;
