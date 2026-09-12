-- Campus Living — a warden can read the LEARNER behind an allocation in their
-- own block. Follow-up to 20260909160000_campus_living_block_scope_is_a_scope.sql,
-- which fixed hostel_allocations and hostel_beds but stopped one table short.
--
-- THE BUG THIS FIXES
-- ------------------
-- After 20260909160000 a chief warden could read all 861 allocation rows in her
-- blocks — and the Allocations table was STILL empty.
--
-- getAllAllocations embeds the learner and their academic record:
--
--   learner:profiles!hostel_allocations_learner_id_fkey(
--     …, academic:learners_profiles!profiles_learner_id_fkey(lifecycle_status, …))
--
-- and then filters in JS:
--
--   const s = a?.learner?.academic?.lifecycle_status;
--   return !!s && CL_ROSTER_STATUSES.includes(s);
--
-- PostgREST applies RLS to EMBEDDED tables too. profiles was readable (7,633
-- rows) but learners_profiles returned ZERO, so `academic` came back null,
-- `lifecycle_status` was undefined, and the roster filter dropped every one of
-- the 861 rows. 861 → 0, with no error anywhere: the request succeeded, the
-- embed was simply null.
--
-- The cause is the same institution-vs-block wall one table further in.
-- learners_profiles_select_policy reads:
--
--   institution_id = ANY(<institutions the caller can access>)
--   AND (learners.admissions.view OR learners.profiles.view OR learners.view)
--
-- The KEY half already passes — a chief warden holds learners.view. It is the
-- institution half that fails: her only accessible institution is JKKN Main
-- Office, which has no learners at all. See
-- feedback_block_grant_is_a_scope_never_and_it_with_institution.
--
-- THE SCOPE THIS GRANTS
-- ---------------------
-- Deliberately narrow: a learner is readable to a block-scoped caller ONLY if
-- they hold an allocation in a block that caller has a live grant on. Not their
-- college, not the hostel — the specific blocks. ~450 learners for a chief
-- warden today, out of 7,388. All allocation statuses count, because the table
-- shows past allocations under its Status dropdown and a past resident's row
-- must still render a name.
--
-- Callers with no block grant are unaffected: fn_cl_my_block_ids() is empty for
-- them, so the new branch's array is empty and the containment test is false.

CREATE OR REPLACE FUNCTION public.fn_cl_my_block_learner_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  -- Returns an empty array rather than raising when the caller has no
  -- campus-living access: this runs inside learners_profiles' RLS policy, where
  -- a raise would turn "no rows" into a hard 42501 on every learner query made
  -- by anyone outside the module. Positive-form guard with an explicit ELSE so a
  -- NULL auth.role() falls closed.
  --
  -- hostel_allocations.learner_id is a profiles.id; the academic record is
  -- learners_profiles.id, reached through profiles.learner_id. Two disjoint key
  -- spaces (see reference_learners_profiles_id_disjoint_from_profiles_id).
  SELECT CASE
    WHEN COALESCE((SELECT auth.role()), '') = 'service_role'
      OR (SELECT is_super_admin())
      OR (SELECT user_has_permission('campus_living.view'))
    THEN COALESCE(
      (SELECT array_agg(DISTINCT p.learner_id)
         FROM hostel_allocations ha
         JOIN profiles p ON p.id = ha.learner_id
        WHERE p.learner_id IS NOT NULL
          AND ha.block_id = ANY (public.fn_cl_my_block_ids())),
      ARRAY[]::uuid[])
    ELSE ARRAY[]::uuid[]
  END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_my_block_learner_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cl_my_block_learner_ids() TO authenticated;

COMMENT ON FUNCTION public.fn_cl_my_block_learner_ids() IS
  'learners_profiles.id for every learner holding an allocation in a block the caller has a live user_block_access grant on. Empty array when the caller holds no grant. Caller derived from auth.uid(); never parameterised.';

-- Rewritten in place rather than added as a second policy: multiple permissive
-- policies are ORed but ALL of them are evaluated per candidate row. Every
-- existing branch is carried over verbatim; only the last one is new.
DROP POLICY IF EXISTS learners_profiles_select_policy ON public.learners_profiles;

CREATE POLICY learners_profiles_select_policy ON public.learners_profiles
FOR SELECT
USING (
  (SELECT is_super_admin())
  OR (
    institution_id = ANY (
      (SELECT array_agg(i.id) FROM institutions i WHERE role_has_institution_access(i.id))::uuid[]
    )
    AND (
      (SELECT user_has_permission('learners.admissions.view'))
      OR (SELECT user_has_permission('learners.profiles.view'))
      OR (SELECT user_has_permission('learners.view'))
    )
  )
  OR student_email = (SELECT profiles.email FROM profiles WHERE profiles.id = (SELECT auth.uid()))
  OR college_email = (SELECT profiles.email FROM profiles WHERE profiles.id = (SELECT auth.uid()))
  -- NEW: the learner behind an allocation in a block the caller holds. Scalar
  -- subquery so the id set is one InitPlan for the whole query rather than a
  -- lookup per candidate row.
  OR (
    (SELECT user_has_permission('campus_living.allocations.view'))
    AND (SELECT public.fn_cl_my_block_learner_ids()) @> ARRAY[learners_profiles.id]
  )
);
