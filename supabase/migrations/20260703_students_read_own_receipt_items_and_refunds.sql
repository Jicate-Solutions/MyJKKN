-- /learners/my-bills: students need to read their own receipt line items
-- (receipt -> bill links, used to group paid receipts by academic year and to
-- render the receipt detail / PDF) and processed refunds (so a refunded
-- receipt is never presented as a plain payment). Additive SELECT policies
-- only — same email-match identity pattern as the existing
-- "Students can view their own bills/receipts" policies.

CREATE POLICY "Students can view their own receipt items"
ON public.billing_receipt_items
FOR SELECT
TO authenticated
USING (
  receipt_id IN (
    SELECT r.id
    FROM public.billing_receipts r
    WHERE r.student_id IN (
      SELECT lp.id
      FROM public.learners_profiles lp
      JOIN public.profiles p
        ON (p.email = lp.student_email OR p.email = lp.college_email)
      WHERE p.id = auth.uid()
        AND p.role = 'student'
    )
  )
);

CREATE POLICY "Students can view their own refunds"
ON public.billing_refunds
FOR SELECT
TO authenticated
USING (
  receipt_id IN (
    SELECT r.id
    FROM public.billing_receipts r
    WHERE r.student_id IN (
      SELECT lp.id
      FROM public.learners_profiles lp
      JOIN public.profiles p
        ON (p.email = lp.student_email OR p.email = lp.college_email)
      WHERE p.id = auth.uid()
        AND p.role = 'student'
    )
  )
);
