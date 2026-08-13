-- 2026-08-11 — Let a college's own Principal see and act on that college's
-- Learners Council on-duty (OD) requests.
--
-- WHY
-- `lc_od_requests` has exactly one SELECT policy and one UPDATE policy, and both
-- admit only (a) the requester, or (b) anyone holding an active `lc_members` row.
-- A chain step naming `principal` therefore resolves to a real person at the
-- application layer -- od-service.ts `approverMatchesRole()` matches profiles.role
-- -- who can never SELECT the row. The queue stays permanently empty, silently:
-- an RLS denial returns 0 rows with error === null.
--
-- This affects the proposed Arts & Science (Aided) chain, and it already affects
-- Pharmacy, whose existing step 2 names `principal` today.
--
-- SCOPE
-- Additive only. Two new policies. No existing policy is altered or dropped.
-- No new function, no table change, no data change. Institution-scoped: a
-- Principal sees only their own college's requests, never another college's.
-- Both helpers already exist and are SECURITY DEFINER, so no new grants are
-- needed and there is no anon exposure to revoke.
--
-- NOT INCLUDED (separate decision): chain steps naming `md` (Dental's step 2)
-- have the same dead end, because a super admin is not a council member either.

CREATE POLICY lc_od_requests_select_principal ON public.lc_od_requests
FOR SELECT USING (
  lower(coalesce(public.get_current_user_role(), '')) = 'principal'
  AND institution_id IS NOT NULL
  AND institution_id = public.get_current_user_institution_id()
);

CREATE POLICY lc_od_requests_update_principal ON public.lc_od_requests
FOR UPDATE USING (
  lower(coalesce(public.get_current_user_role(), '')) = 'principal'
  AND institution_id IS NOT NULL
  AND institution_id = public.get_current_user_institution_id()
);
