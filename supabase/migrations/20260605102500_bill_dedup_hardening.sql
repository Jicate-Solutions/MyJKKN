-- 20260605102500_bill_dedup_hardening.sql
-- Hardening for 20260605102000 (from code review):
--  (I1) An academic/hostel_category bill that carries a hostel_year stamp MUST have a
--       category, otherwise the NULL-key behaviour of uq_bill_dedup_category (NULL != NULL)
--       would let duplicate uncategorised bills slip through. Scoped to hostel_year_id
--       IS NOT NULL so existing legacy rows (hostel_year_id NULL) are unaffected.
--  (M1) Exclude 'superseded' (like 'cancelled') from the dedup indexes so a superseding
--       replacement bill can be issued for the same (student, hostel_year, category/package).
--  (M3) Range-guard applies_year_of_study, consistent with admission_fee_structure_items.

ALTER TABLE public.billing_student_bills
  DROP CONSTRAINT IF EXISTS bsb_hostel_cat_required_chk,
  ADD CONSTRAINT bsb_hostel_cat_required_chk
    CHECK (
      hostel_year_id IS NULL
      OR fee_source NOT IN ('academic','hostel_category')
      OR item_category_id IS NOT NULL
    );

ALTER TABLE public.billing_student_bills
  DROP CONSTRAINT IF EXISTS bsb_applies_year_range_chk,
  ADD CONSTRAINT bsb_applies_year_range_chk
    CHECK (applies_year_of_study IS NULL OR applies_year_of_study BETWEEN 1 AND 10);

DROP INDEX IF EXISTS uq_bill_dedup_category;
CREATE UNIQUE INDEX uq_bill_dedup_category
  ON public.billing_student_bills (student_id, hostel_year_id, item_category_id)
  WHERE hostel_year_id IS NOT NULL
    AND fee_source IN ('academic','hostel_category')
    AND status NOT IN ('cancelled','superseded');

DROP INDEX IF EXISTS uq_bill_dedup_package;
CREATE UNIQUE INDEX uq_bill_dedup_package
  ON public.billing_student_bills (student_id, hostel_year_id, package_id)
  WHERE hostel_year_id IS NOT NULL
    AND fee_source = 'hostel_package'
    AND status NOT IN ('cancelled','superseded');
