-- Leave/OnDuty submission: authorize learners the way RLS does, and let a
-- failed submission actually roll back.
--
-- 1. fn_seed_application_approvals authorized the caller with
--    `learners_profiles.profile_id = auth.uid()`. That column is NULL for
--    1,488 of 6,765 linked students (2026-09-21) — their account is linked the
--    other way, `profiles.learner_id`, which is what every leave_onduty RLS
--    policy (learners_view_own_applications, learners_delete_own_cancelled)
--    uses. Those learners got 42501 on every submit, whether or not an
--    approval flow existed (edge logs: 12/12 seed calls 403, one learner).
--    Both link directions are now accepted, in the owner check and in the
--    "never seed the applicant as their own approver" guard. Nothing else in
--    the function changes.
--
-- 2. createApplication (browser, learner JWT) rolls a failed submission back
--    with a plain DELETE, but the only DELETE policy admits CANCELLED rows, so
--    a PENDING rollback removed 0 rows without an error. The learner saw the
--    error, retried, and every attempt left a pending application no approver
--    can see (12 in 9 minutes for the learner above). Widening the DELETE
--    policy would let learners delete applications already in approval, so
--    fn_discard_unseeded_application deletes only a provable failed
--    submission: the caller's own, still pending, no approver rows, created in
--    the last 15 minutes. Child rows cascade.
--
-- Both functions are granted to authenticated on purpose (learners call
-- fn_discard_unseeded_application from the browser). Their authorization is
-- ownership by auth.uid(), which the secdef gate deliberately does not count:
-- ci:allow-secdef-authenticated fn_learner_owns_application only answers whether the CALLER (auth.uid()) is linked to the given learner id, so it reveals nothing about anyone else; fn_discard_unseeded_application deletes only a row its WHERE proves is the caller's own (fn_learner_owns_application), still pending, with no approver rows, created in the last 15 minutes; any other id deletes nothing and returns false.

CREATE OR REPLACE FUNCTION public.fn_learner_owns_application(p_learner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
           SELECT 1 FROM profiles p
           WHERE p.id = (SELECT auth.uid()) AND p.learner_id = p_learner_id
         )
      OR EXISTS (
           SELECT 1 FROM learners_profiles lp
           WHERE lp.id = p_learner_id AND lp.profile_id = (SELECT auth.uid())
         );
$function$;

REVOKE ALL ON FUNCTION public.fn_learner_owns_application(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_learner_owns_application(uuid) TO authenticated, service_role;

-- fn_seed_application_approvals: patched IN PLACE on the live definition
-- (2026-09-28). An earlier draft of this file restated the whole body, which
-- would have reverted the 2026-09-27 "skip deactivated approvers" change made
-- after it was written. Only the two ownership checks are rewritten; the
-- block refuses to run if either no longer matches.
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.fn_seed_application_approvals(uuid)'::regprocedure);
  v_new text;
  v_owner_old text := E'EXISTS (
      SELECT 1 FROM learners_profiles lp
      WHERE lp.id = v_app.learner_id
        AND lp.profile_id = (SELECT auth.uid())
    )
    OR is_super_admin()';
  v_owner_new text := E'fn_learner_owns_application(v_app.learner_id)
    OR is_super_admin()';
  v_self_old text := E'IF v_approver IS NOT NULL AND EXISTS (
      SELECT 1 FROM learners_profiles lp
      WHERE lp.id = v_app.learner_id AND lp.profile_id = v_approver
    ) THEN';
  v_self_new text := E'IF v_approver IS NOT NULL AND (
      EXISTS (
        SELECT 1 FROM learners_profiles lp
        WHERE lp.id = v_app.learner_id AND lp.profile_id = v_approver
      )
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = v_approver AND p.learner_id = v_app.learner_id
      )
    ) THEN';
BEGIN
  IF position('fn_learner_owns_application' IN v_def) > 0 THEN
    RETURN; -- already applied
  END IF;
  IF position(v_owner_old IN v_def) = 0 OR position(v_self_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'fn_seed_application_approvals drifted — ownership checks not found, not patching';
  END IF;
  v_new := replace(replace(v_def, v_owner_old, v_owner_new), v_self_old, v_self_new);
  EXECUTE v_new;
END $$;

CREATE OR REPLACE FUNCTION public.fn_discard_unseeded_application(p_application_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM leave_onduty_applications a
  WHERE a.id = p_application_id
    AND a.status = 'pending'
    AND a.created_at > now() - interval '15 minutes'
    AND fn_learner_owns_application(a.learner_id)
    AND NOT EXISTS (
      SELECT 1 FROM leave_onduty_approvals x WHERE x.application_id = a.id
    );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_discard_unseeded_application(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_discard_unseeded_application(uuid) TO authenticated, service_role;
