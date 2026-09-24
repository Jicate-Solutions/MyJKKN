-- Show the JKKN ID on the Applications tab — and make it actually resolvable.
--
-- The Applications table had no JKKN ID column at all; the number appeared only
-- in the detail sheet and the export. Both read it through the PostgREST embed
--
--     profile:profiles!course_applications_profile_id_fkey(id, jkkn_identities(jkkn_id))
--
-- which is wrong twice over:
--
--  1. RLS. jkkn_identities_select requires users.jkkn_id.view. Measured
--     2026-09-19: administrator=false, coo=false, course_coordinator=false —
--     ALL THREE roles that hold courses.applications.view. An RLS-blocked embed
--     comes back NULL rather than erroring, so every one of them has been
--     reading "Not issued" for every applicant since the tab shipped. The type's
--     own comment in types/courses.ts claimed the opposite.
--
--  2. Anchors. The embed joins on jkkn_identities.profile_id, which is NULL on
--     all 6,808 learner and 739 team_member rows. Since 20260919120400 an
--     approval can legitimately reuse an existing staff or learner identity, so
--     the embed would read "Not issued" for exactly the people whose number was
--     correctly NOT reissued.
--
-- fn_jkkn_id_of is the sanctioned reader for both problems: SECURITY DEFINER,
-- open to all authenticated BY DESIGN (it returns only the number already
-- printed on the person's card, and the page that calls it has already gated
-- who may see the row), and it walks profile -> learner link -> staff email.
--
-- Exposed as a PostgREST COMPUTED COLUMN rather than a second query: a function
-- taking the table's row type is selectable as `jkkn_id` in the same request,
-- so the list stays one round trip and there is no N+1 over the page.

CREATE OR REPLACE FUNCTION public.jkkn_id(public.course_applications)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT public.fn_jkkn_id_of('profile', $1.profile_id);
$function$;

COMMENT ON FUNCTION public.jkkn_id(public.course_applications) IS
  'PostgREST computed column: the applicant''s JKKN ID, resolved through fn_jkkn_id_of so it works across all three jkkn_identities anchors and does not depend on users.jkkn_id.view, which no course role holds. Select it as `jkkn_id` alongside the row.';

REVOKE ALL ON FUNCTION public.jkkn_id(public.course_applications) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.jkkn_id(public.course_applications) TO authenticated;
