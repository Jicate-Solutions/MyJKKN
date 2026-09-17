-- Multi-instalment online payments for /my-courses.
--
-- course_bill_payments_rzp_payment_uniq was UNIQUE(razorpay_payment_id) —
-- correct when one Razorpay payment could only ever credit one bill. Partial
-- payments now let a participant select several unpaid instalments and pay
-- them in ONE Razorpay transaction, which inserts one course_bill_payments
-- row per selected bill sharing that payment id. The old index would reject
-- every row after the first with 23505.
--
-- Swap it for a composite index so the anti-double-credit guarantee holds
-- PER BILL instead of per payment: a given bill still cannot be credited
-- twice for the same Razorpay payment (replayed browser callback / retried
-- verify call), but N bills legitimately sharing one payment id is no longer
-- a conflict.
DROP INDEX IF EXISTS public.course_bill_payments_rzp_payment_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS course_bill_payments_rzp_payment_bill_uniq
  ON public.course_bill_payments (razorpay_payment_id, bill_id)
  WHERE razorpay_payment_id IS NOT NULL;
