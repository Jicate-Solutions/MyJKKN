-- 20260606100500_lock_down_readonly_resolver.sql
-- Security: admission_resolve_fee_items_readonly is a SECURITY DEFINER read function that
-- bypasses RLS. It must NOT be directly callable by untrusted roles (anon/authenticated) —
-- that would be an IDOR (read any learner's fees). It is only ever called INTERNALLY by the
-- permission-gated campus_living_generate_hostel_year_bills RPC, which is SECURITY DEFINER and
-- runs as this function's owner. Owner-only execute closes the IDOR + PUBLIC-exposure findings.
REVOKE ALL ON FUNCTION public.admission_resolve_fee_items_readonly(uuid, int)
  FROM PUBLIC, anon, authenticated, service_role;
