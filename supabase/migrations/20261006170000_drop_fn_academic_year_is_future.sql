-- Online payment year order is now OLDEST YEAR FIRST (any bill is locked while an
-- older academic year still has a balance), not "future years only". The order
-- comes from academic_years.start_date, which a learner session can already read
-- for the years on its own bills — so the DEFINER boundary helper added in
-- 20261006150000 has no caller left. Drop it rather than leave an unused DEFINER.
-- Rule now lives in lib/utils/billing/academic-year-payment-order.ts.

DROP FUNCTION IF EXISTS public.fn_academic_year_is_future(uuid, date);
