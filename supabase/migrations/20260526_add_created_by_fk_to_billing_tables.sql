-- Migration: Add FK constraints on created_by → profiles(id) for billing tables
-- Date: 2026-05-26
--
-- Enables PostgREST to join creator profile data (full_name) in select queries.
-- Used by the History tab in student billing detail pages.

ALTER TABLE public.billing_student_bills
  ADD CONSTRAINT fk_billing_student_bills_created_by
  FOREIGN KEY (created_by) REFERENCES public.profiles(id)
  ON DELETE SET NULL;

ALTER TABLE public.billing_receipts
  ADD CONSTRAINT fk_billing_receipts_created_by
  FOREIGN KEY (created_by) REFERENCES public.profiles(id)
  ON DELETE SET NULL;

ALTER TABLE public.billing_discounts
  ADD CONSTRAINT fk_billing_discounts_created_by
  FOREIGN KEY (created_by) REFERENCES public.profiles(id)
  ON DELETE SET NULL;

ALTER TABLE public.billing_refunds
  ADD CONSTRAINT fk_billing_refunds_created_by
  FOREIGN KEY (created_by) REFERENCES public.profiles(id)
  ON DELETE SET NULL;
