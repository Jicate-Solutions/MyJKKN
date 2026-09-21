-- ============================================================================
-- hr_can_decide_eligibility(): eligibility approvers only
-- 2026-09-21
-- ----------------------------------------------------------------------------
-- WHY. The first cut (20261225110000) OR-ed in hr_can_approve_leave(), which
-- admits anyone named on ANY leave flow — every HOD, for instance. That made
-- the "Waiting on you" queue on HR → Leave → Eligibility appear for people who
-- decide leave but not eligibility. The tab itself no longer needs this gate
-- (it is shown to everyone as the place to REQUEST eligibility), so the
-- function now answers only the narrower question the queue asks: is this
-- caller someone an eligibility request can actually land on?
--
-- That is: a super admin, anyone named on an active leave_eligibility flow, or
-- anyone on the current step of a pending request — which is how the leave
-- approvers are admitted for a gated type that has no eligibility flow of its
-- own and therefore fell back to them. The page adds a small default set of
-- roles (HR Head, CAO, Principal) on the client, where a role name is a
-- greppable constant rather than a policy.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.hr_can_decide_eligibility()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT public.is_super_admin()
      OR public.fn_is_configured_eligibility_approver()
      OR public.fn_is_any_eligibility_approver();
$function$;

COMMENT ON FUNCTION public.hr_can_decide_eligibility() IS
  'Can this caller decide an eligibility request? Super admin, anyone an active leave_eligibility flow names, or anyone on the current step of a pending request. Narrower than hr_can_approve_leave() on purpose.';
