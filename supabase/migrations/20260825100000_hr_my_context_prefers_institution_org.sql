-- =============================================================================
-- 20260825100000_hr_my_context_prefers_institution_org.sql
--
-- fn_my_hr_context() resolves the caller's HR organisation from their
-- INSTITUTION first, and only falls back to hr_staff_details.
--
-- THE BUG
-- -------
-- Reported by nithya.raja@jkkn.ac.in (NOT122): applying for leave failed with
-- "No leave approval flow is configured for your organisation", even though
-- her organisation has five.
--
-- Her staff.institution_id is JKKN Main Office. Her hr_staff_details row says
-- her hr_organization_id is JKKN DENTAL COLLEGE. The function preferred the
-- hr_staff_details value:
--
--     COALESCE(d.hr_organization_id, o.id)   -- details first
--
-- so every Time Off drawer posted Dental as her organisation, while the leave
-- TYPES in her dropdown came from v_hr_leave_balance_src, which resolves them
-- the other way — `JOIN hr_organizations org ON org.institution_id = ...` via
-- staff.institution_id, i.e. Main Office. The form offered Main Office leave
-- types and then asked for Dental's approval flow.
--
-- What happened next depended on the caller's role, and both outcomes are bad:
--
--   * a plain staff member cannot see another college's flows —
--     fn_my_hr_organization_ids() scopes to their own institution — so the read
--     returned zero rows and surfaced as "no flow is configured". Failing
--     closed, which is what Nithya hit.
--   * someone whose role grants wider institution access CAN read them, so the
--     request was accepted and routed to the WRONG COLLEGE'S approver. Seven
--     applications from this group are already filed against an organisation
--     that does not employ the applicant.
--
-- THE FIX, AND WHY THIS DIRECTION
-- -------------------------------
--     COALESCE(o.id, d.hr_organization_id)   -- institution first
--
-- staff.institution_id is the authoritative employment fact and is what every
-- other part of the leave module already keys on — the balance view, the leave
-- types, the entitlements. hr_staff_details is an optional HR extension that
-- can drift, and here it has: hr_organizations maps 1:1 to institutions, so an
-- hr_organization_id that disagrees with the institution is a contradiction,
-- not a secondment. The fallback is kept for anyone whose institution has no
-- hr_organizations row.
--
-- BLAST RADIUS, measured rather than assumed: of 759 active staff with a login,
-- this changes the answer for exactly 31 — precisely the set whose
-- hr_staff_details disagrees with their institution — and leaves NOBODY with a
-- null organisation under either form.
--
-- NOT FIXED HERE, deliberately: the 31 hr_staff_details rows still hold the
-- wrong organisation, and the 7 applications already filed under it still name
-- it. This migration stops the wrong value reaching the leave flow; correcting
-- the stored rows is a separate data decision.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_my_hr_context()
 RETURNS TABLE(staff_id uuid, profile_id uuid, hr_organization_id uuid, institution_id uuid, first_name text, last_name text, email text, employee_code text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    s.id,
    s.profile_id,
    -- Institution first. See the header: hr_staff_details drifts, and the rest
    -- of the leave module resolves the organisation from the institution.
    COALESCE(o.id, d.hr_organization_id),
    s.institution_id,
    s.first_name::text,
    s.last_name::text,
    s.email::text,
    COALESCE(d.hr_employee_code, s.staff_id)::text
  FROM public.staff s
  LEFT JOIN public.hr_staff_details d ON d.staff_id = s.id
  LEFT JOIN public.hr_organizations o ON o.institution_id = s.institution_id
  WHERE s.profile_id = auth.uid()
    AND s.is_active
  LIMIT 1;
$function$;

COMMENT ON FUNCTION public.fn_my_hr_context() IS
  'The caller''s own HR identity, self-authorizing (pins to auth.uid(), takes no arguments) and SECURITY DEFINER so it resolves past the hr_* tenant RLS that reads user_hr_access. hr_organization_id comes from the INSTITUTION first and hr_staff_details only as a fallback: the institution is the authoritative employment fact and is what v_hr_leave_balance_src, the leave types and the entitlements all key on, whereas hr_staff_details can drift out of step with it.';
