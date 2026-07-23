-- ============================================================================
-- COHORT CORE — Phase 7 · M6 activation: SF100 stretch-goal treatment read
-- Created: 2026-07-06  (P0 #2 — make the moat's A/B a REAL differential)
-- ============================================================================
-- WHY: Until now the experiment arm was a LABEL only — control and treatment
--   teams had identical experiences, so causal_lift = mean(treatment) − mean(control)
--   differenced two groups that were treated the same → pure noise. The moat could
--   never learn. This RPC powers the FIRST real treatment: treatment-arm teams are
--   shown a STRETCH paying-user goal (program target + a promotable delta), so the
--   arms genuinely differ. The score still measures each team against the common
--   program target, so causal_lift now answers a real question: "does showing a
--   higher goal cause teams to acquire more real paying users?" If yes, the
--   feed-forward proposer promotes paid_user_target_delta program-wide (loop closes).
--
-- WHY A DEFINER RPC (not a client RLS read): the team dashboard is a browser client
--   under the team's own RLS, which is NOT guaranteed to grant a team member SELECT
--   on cohort_memberships / cohorts. A silent RLS null would make the treatment
--   INVISIBLE with no error → a hollow experiment. This owner-gated DEFINER read
--   guarantees the value resolves, while exposing nothing beyond the caller's own
--   team goal (a non-sensitive display number).
--
-- OWNERSHIP: owner-only. The caller must be an event_team_member of the
--   enrollment's registration. Admins have their own dashboards, so there is NO
--   is_admin() bypass here (avoids widening the systemic hardcoded-role surface).
--
-- TIER: TIER-1 (new STABLE DEFINER fn; anon REVOKEd; DROPS-NOTHING; IDEMPOTENT).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_my_sf100_goal(p_enrollment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owns            boolean;
  v_program_target  int;
  v_arm             text;
  v_delta           int := 0;
  v_effective       int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('scored', false, 'reason', 'unauthenticated');
  END IF;

  -- OWNERSHIP GATE — the caller must be an ACCEPTED member of this enrollment's
  -- team. status='accepted' excludes 'pending' invitees (not yet on the team) and
  -- 'declined' (left the team) — neither should read the team's arm/goal.
  SELECT EXISTS (
    SELECT 1
      FROM public.event_team_members tm
      JOIN public.sf100_enrollments e ON e.registration_id = tm.registration_id
     WHERE e.id = p_enrollment_id
       AND tm.profile_id = auth.uid()
       AND tm.status = 'accepted'
  ) INTO v_owns;

  IF NOT COALESCE(v_owns, false) THEN
    RETURN jsonb_build_object('scored', false, 'reason', 'not your enrollment');
  END IF;

  -- Canonical program goal for the whole cohort (0/NULL → the "Solve for 100"
  -- default of 100). Scored denominator is ALWAYS this program target for BOTH
  -- arms — the stretch below only changes what the treatment arm is SHOWN.
  SELECT COALESCE(NULLIF(p.paid_user_target, 0), 100)
    INTO v_program_target
    FROM public.sf100_enrollments e
    JOIN public.sf100_programs p ON p.id = e.program_id
   WHERE e.id = p_enrollment_id;
  v_program_target := COALESCE(v_program_target, 100);

  -- This team's arm (from the cohort-spine membership mirror) + the cohort's
  -- tested stretch delta. Un-armed / un-mirrored teams read as 'control'.
  SELECT COALESCE(m.config->>'experiment_arm', 'control'),
         COALESCE((c.config#>>'{experiment,treatment_params,paid_user_target_delta}')::int, 0)
    INTO v_arm, v_delta
    FROM public.cohort_memberships m
    JOIN public.cohorts c ON c.id = m.cohort_id
   WHERE m.member_ref = p_enrollment_id
     AND m.member_type = 'team'
   ORDER BY m.joined_at DESC NULLS LAST
   LIMIT 1;

  v_arm   := COALESCE(v_arm, 'control');
  v_delta := COALESCE(v_delta, 0);

  -- Additive-only: a stretch can only raise the treatment arm's shown goal, never
  -- lower it below the program target (a stretch is a challenge, never a penalty).
  v_effective := v_program_target
                 + CASE WHEN v_arm = 'treatment' THEN GREATEST(v_delta, 0) ELSE 0 END;

  RETURN jsonb_build_object(
    'scored',           true,
    'arm',              v_arm,
    'program_target',   v_program_target,
    'stretch_delta',    CASE WHEN v_arm = 'treatment' THEN GREATEST(v_delta, 0) ELSE 0 END,
    'effective_target', v_effective
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_my_sf100_goal(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_my_sf100_goal(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
