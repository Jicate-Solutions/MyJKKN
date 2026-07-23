-- File: supabase/migrations/20260517000004_create_vw_learner_payment_progress.sql
BEGIN;

CREATE OR REPLACE VIEW public.vw_learner_payment_progress
WITH (security_invoker = true) AS
SELECT
  lp.id AS learner_id,
  lp.institution_id,
  lp.lifecycle_status,
  COALESCE(SUM(b.final_amount)
           FILTER (WHERE bc.kind <> 'application_fee'), 0) AS countable_billed,
  COALESCE(SUM(b.final_amount - b.balance_amount)
           FILTER (WHERE bc.kind <> 'application_fee'), 0) AS countable_paid,
  CASE
    WHEN COALESCE(SUM(b.final_amount) FILTER (WHERE bc.kind <> 'application_fee'), 0) = 0
      THEN 0
    ELSE ROUND(
      100.0
      * SUM(b.final_amount - b.balance_amount) FILTER (WHERE bc.kind <> 'application_fee')
      / SUM(b.final_amount)                    FILTER (WHERE bc.kind <> 'application_fee')
    , 2)
  END AS paid_pct,
  BOOL_OR(bc.kind = 'application_fee' AND b.status = 'paid') AS application_fee_paid,
  COUNT(b.id) AS total_bills,
  COUNT(b.id) FILTER (WHERE b.status = 'paid') AS paid_bills
FROM public.learners_profiles lp
LEFT JOIN public.billing_student_bills b
  ON b.student_id = lp.id AND b.status <> 'superseded'
LEFT JOIN public.billing_categories bc
  ON bc.id = b.item_category_id
GROUP BY lp.id, lp.institution_id, lp.lifecycle_status;

COMMENT ON VIEW public.vw_learner_payment_progress IS
  'Per-learner payment progress for seat-filled threshold computation. '
  'paid_pct EXCLUDES application_fee category bills. '
  'security_invoker=true so RLS on learners_profiles + billing_student_bills applies.';

COMMIT;
