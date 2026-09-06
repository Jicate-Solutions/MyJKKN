-- 20260617142000_razorpay_transport_to_global.sql
--
-- Convert the existing "JKKN Arts - Transport Fees" account to GLOBAL so it serves
-- transport for every institution. Same id / keys / webhook_ref / MID — only scope
-- broadens. Pinned transactions keep verifying (resolve by account id). Runs after the
-- global-aware indexes exist (20260617140000). Drop the _bak_ table after smoke.

CREATE TABLE IF NOT EXISTS public._bak_razorpay_transport_global_20260617 AS
  SELECT * FROM public.razorpay_accounts
  WHERE id = '010f1c0a-7c9f-4627-8977-7074029dcde3';

UPDATE public.razorpay_accounts
   SET institution_id = NULL,
       account_label  = 'JKKN Transport Fees (All Institutions)',
       updated_at     = now()
 WHERE id = '010f1c0a-7c9f-4627-8977-7074029dcde3'
   AND fee_head = 'transport'
   AND is_active;
