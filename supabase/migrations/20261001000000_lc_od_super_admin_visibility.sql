-- 2026-08-13 — Let a super admin see and act on the on-duty requests that a
-- chain step routes to them.
--
-- WHY
-- Dental College's chain step 2 names `md` (Managing Director). od-service.ts
-- `approverMatchesRole()` resolves that to `ctx.isSuperAdmin || profileRole =
-- 'super_admin'` — a real, identifiable person. But `lc_od_requests` admits only
-- the requester, an active council member, and (since 20260822000000) a Principal
-- of the requester's own college. A super admin is none of those, so the request
-- would sit at step 2 forever: the queue reads empty, an RLS denial returns no
-- rows with no error, and nobody is told anything is wrong.
--
-- This is the same defect 20260822000000 fixed for `principal`, in the one
-- remaining chain step that still carries it.
--
-- SCOPE
-- Additive only. Two new policies. No existing policy is altered or dropped, no
-- new function, no table or data change. Deliberately NOT institution-scoped:
-- a super admin is cluster-wide by definition, which is exactly what the `md`
-- step means.
--
-- Deliberately does NOT include is_admin(). The `md` step resolves to super
-- admins alone; admitting every 'admin'/'administrator' role would widen who can
-- read every college's on-duty requests well beyond what any chain step asks for.

CREATE POLICY lc_od_requests_select_super_admin ON public.lc_od_requests
FOR SELECT USING (public.is_super_admin());

CREATE POLICY lc_od_requests_update_super_admin ON public.lc_od_requests
FOR UPDATE USING (public.is_super_admin());
