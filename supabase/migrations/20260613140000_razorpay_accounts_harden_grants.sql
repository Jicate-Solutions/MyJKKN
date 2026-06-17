-- 20260613140000_razorpay_accounts_harden_grants.sql
--
-- Defense-in-depth for the payment-credentials table. The secrets are already
-- (a) pgcrypto-encrypted and (b) RLS-gated to service_role only, but Supabase's
-- default broad table grants to anon/authenticated mean access control would rely
-- SOLELY on RLS remaining enabled. The app never touches razorpay_accounts as
-- anon/authenticated (only via service_role SECURITY DEFINER RPCs), so revoking
-- these grants removes a whole class of risk at the privilege layer with zero
-- functional impact.
REVOKE ALL ON public.razorpay_accounts FROM anon, authenticated;

-- Advisor 0011 (function_search_path_mutable): pin the updated_at trigger
-- function's search_path. It only calls now() (pg_catalog), so an empty
-- search_path is sufficient and safe.
ALTER FUNCTION public.update_razorpay_accounts_updated_at() SET search_path = '';
