-- One-off remediation: BOOBALAN A holds TWO lifetime JKKN IDs.
--
--   635500-1  jkkn_identities.team_member_id = dc0fb7c7  (staff, issued 2026-08-27)
--             profile 7f6836fd  boobalan.a@jkkn.ac.in    (super_admin, 2024-11-11)
--
--   789537-1  jkkn_identities.profile_id = 7ea5fbfb      (issued 2026-08-19 by a
--             profile 7ea5fbfb  a.boobalzen003@gmail.com  course approval)
--
-- Same human. The second number, profile and login exist only because
-- fn_course_approve_application could not see the team_member anchor — the bug
-- fixed by 20260919120100 / 20260919120200 / 20260919120400.
--
-- 789537-1 is RETIRED, never deleted: a JKKN ID is never re-used, and it may
-- already be printed on a card or quoted in an email. Profile 7ea5fbfb is
-- deactivated rather than dropped, because it backs a real auth.users row and
-- deleting auth users blind from a migration is not safe.
--
-- The re-pointed enrollments become participant_type='staff', which
-- course_enrollments_identity_chk defines as carrying NEITHER learner_id NOR
-- external_participant_id — a staff enrolment is not an external-participant
-- enrolment. The event_external_participants row survives and is re-linked in
-- step 3, and application_id still ties each enrollment back to its origin.
--
-- Every step asserts its own row count. A silent zero-row UPDATE is exactly how
-- a remediation passes while changing nothing.

DO $do$
DECLARE
  v_dead uuid := '7ea5fbfb-b1ed-4ae7-bc27-0023e74a5daa';  -- course-created profile
  v_real uuid := '7f6836fd-24b5-477b-8892-a04a77552700';  -- BOOBALAN A's real account
  v_n      int;
  v_before int;
  v_after  int;
BEGIN
  SELECT count(*) INTO v_before FROM public.jkkn_identities;

  -- Guard: the target must hold no enrollment on any course the dead profile is
  -- on, or course_enrollments_person_uniq (course_event_id, profile_id) would
  -- reject the move halfway through.
  IF EXISTS (
    SELECT 1
      FROM public.course_enrollments a
      JOIN public.course_enrollments b
        ON b.course_event_id = a.course_event_id AND b.profile_id = v_real
     WHERE a.profile_id = v_dead
  ) THEN
    RAISE EXCEPTION 'Both profiles are enrolled on the same course; merge by hand.';
  END IF;

  UPDATE public.course_enrollments
     SET profile_id = v_real,
         participant_type = 'staff',
         learner_id = NULL,
         external_participant_id = NULL
   WHERE profile_id = v_dead;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 3 THEN RAISE EXCEPTION 'Expected 3 enrollments to re-point, moved %', v_n; END IF;

  UPDATE public.course_applications SET profile_id = v_real WHERE profile_id = v_dead;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 3 THEN RAISE EXCEPTION 'Expected 3 applications to re-point, moved %', v_n; END IF;

  UPDATE public.event_external_participants SET linked_profile_id = v_real WHERE linked_profile_id = v_dead;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'Expected 1 external-participant link to re-point, moved %', v_n; END IF;

  UPDATE public.jkkn_identities
     SET retired_at = now(),
         retired_reason = 'Duplicate of 635500-1 — same person (BOOBALAN A). Issued 2026-08-19 by a course approval that could not see the team_member anchor; see migration 20260919120400.'
   WHERE btrim(jkkn_id) = '789537-1' AND retired_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'Expected to retire exactly 1 identity, retired %', v_n; END IF;

  DELETE FROM public.user_roles WHERE user_id = v_dead;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'Expected 1 user_roles row to remove, removed %', v_n; END IF;

  UPDATE public.profiles
     SET is_external_participant = false, is_active = false
   WHERE id = v_dead;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'Expected to deactivate exactly 1 profile, updated %', v_n; END IF;

  -- The register must be the same size: retired, not deleted.
  SELECT count(*) INTO v_after FROM public.jkkn_identities;
  IF v_after <> v_before THEN
    RAISE EXCEPTION 'Register changed size (% -> %). A number must never be deleted.', v_before, v_after;
  END IF;

  -- And the real account must now be the one the course data resolves to.
  IF public.fn_jkkn_id_of('profile', v_real) IS DISTINCT FROM '635500-1' THEN
    RAISE EXCEPTION 'After the merge the real account resolves to %, expected 635500-1',
      coalesce(public.fn_jkkn_id_of('profile', v_real), '(null)');
  END IF;
END;
$do$;
