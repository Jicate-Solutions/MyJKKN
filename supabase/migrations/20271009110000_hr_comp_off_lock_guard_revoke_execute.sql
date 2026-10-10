-- The comp-off month-lock guard is a trigger function, so nothing should call it
-- over the API. Supabase grants EXECUTE on every new function to anon and
-- authenticated, which published it at /rest/v1/rpc/hr_trig_block_comp_off_claim_in_locked_period
-- (flagged by get_advisors on 2026-10-09). It is SECURITY DEFINER, so it should not
-- be reachable by signed-out callers at all.
--
-- The trigger keeps firing: a trigger function's EXECUTE privilege is checked when
-- the trigger is created, not when it fires.

REVOKE ALL ON FUNCTION public.hr_trig_block_comp_off_claim_in_locked_period()
  FROM PUBLIC, anon, authenticated;
