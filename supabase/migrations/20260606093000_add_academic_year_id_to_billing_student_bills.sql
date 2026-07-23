-- Academic-year-aware billing: stamp the academic year on each bill so
-- multi-year courses (e.g. BDS) can distinguish year-1 from year-2 bills and
-- track per-year payment status. Nullable by design — legacy bills and
-- automated insert paths (hostel RPC, Excel import) may leave it NULL
-- ("Unspecified"); the manual create + bulk-create forms require it.

ALTER TABLE public.billing_student_bills
  ADD COLUMN IF NOT EXISTS academic_year_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'billing_student_bills_academic_year_id_fkey'
  ) THEN
    ALTER TABLE public.billing_student_bills
      ADD CONSTRAINT billing_student_bills_academic_year_id_fkey
      FOREIGN KEY (academic_year_id)
      REFERENCES public.academic_years(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_billing_student_bills_academic_year
  ON public.billing_student_bills (academic_year_id);

CREATE INDEX IF NOT EXISTS idx_billing_student_bills_student_academic_year
  ON public.billing_student_bills (student_id, academic_year_id);

COMMENT ON COLUMN public.billing_student_bills.academic_year_id IS
  'Academic year (academic_years.id) this bill applies to. Nullable: legacy/automated bills may be NULL; manual create + bulk-create require it.';
