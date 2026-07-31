-- 2026-07-31 — Gemba corrections: three behaviours the first cut got wrong.
-- Amends fn_gemba_observation_record from #2673 (live md5 0852cf2f691bdb4ac2568e31ffd76475).
--
-- All three were found by the Director reading back what had been built, not by a gate.
--
-- C1 — A POSTED ASSOCIATE IS NOT "SELF-RECORDING". This is the important one.
-- is_self_recorded was derived as "holds a role on this board OR is posted to it".
-- The second half is exactly backwards. A posted MBA associate is the INDEPENDENT
-- observer this whole design rests on -- a learner placed in the department precisely
-- to look at it. Marking them self-recorded labels the strongest available evidence as
-- the weakest. And it was not a corner case: hr_additional_roles currently holds 0
-- current role-holders against 26 active postings, so the posting branch was the ONLY
-- branch that could fire. Every associate visit was being stamped self-recorded, and a
-- genuine self-visit was not even possible.
-- Now: self-recorded means the observer holds a current role on that board -- the
-- department's own team member checking their own department. Nothing else.
--
-- C2 — YOU MUST BE POSTED TO THE DEPARTMENT YOU VISIT.
-- The first cut gated on cohort membership alone, so any associate could vouch for any
-- of the 14 departments, including one they had never entered. A record of "someone
-- went and looked" is worth nothing if the someone was never there.
-- Officers (improvement.area_role.assign) and super admins keep their own lane.
--
-- C3 — A FINDING OF "DIFFERS" REMOVES THE OFFICIAL BADGE, IMMEDIATELY.
-- The first cut only ever WROTE official_at, on a 'matches'. A later visit finding the
-- document wrong left the badge standing until it lapsed, so the platform kept calling
-- a document official after being told to its face that it was not -- the same defect
-- shipped on 2026-07-30, where an org chart read "Approved" directly above text saying
-- it was not ready. The most recent evidence wins.

CREATE OR REPLACE FUNCTION public.fn_gemba_observation_record(
  p_area_id     uuid,
  p_artifact_id uuid    DEFAULT NULL,
  p_finding     text    DEFAULT 'matches',
  p_notes       text    DEFAULT NULL,
  p_observed_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_finding   text := lower(btrim(COALESCE(p_finding, '')));
  v_notes     text := NULLIF(btrim(COALESCE(p_notes, '')), '');
  v_when      timestamptz := COALESCE(p_observed_at, now());
  v_posted    boolean;
  v_officer   boolean;
  v_is_self   boolean;
  v_inst      uuid;
  v_idea_inst uuid;
  v_label     text;
  v_days      integer;
  v_idea      uuid;
  v_id        uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'fn_gemba_observation_record: not authenticated' USING ERRCODE = '42501';
  END IF;
  IF v_finding NOT IN ('matches', 'differs') THEN
    RAISE EXCEPTION 'fn_gemba_observation_record: finding must be matches or differs';
  END IF;
  IF v_finding = 'differs' AND v_notes IS NULL THEN
    RAISE EXCEPTION 'fn_gemba_observation_record: say what differed - a finding nobody can act on is not a finding';
  END IF;
  IF v_when > now() THEN
    RAISE EXCEPTION 'fn_gemba_observation_record: a visit cannot be recorded in the future';
  END IF;

  SELECT a.label, a.institution_id, a.gemba_interval_days
    INTO v_label, v_inst, v_days
  FROM public.improvement_areas a WHERE a.id = p_area_id;
  IF v_label IS NULL THEN
    RAISE EXCEPTION 'fn_gemba_observation_record: no such improvement_area %', p_area_id;
  END IF;

  SELECT COALESCE(v_inst, pr.institution_id) INTO v_idea_inst
  FROM public.profiles pr WHERE pr.id = v_uid;

  -- C2: posted to THIS department, and a member of an active cohort. Cohort membership
  -- is read from teaching_enterprise_cohorts so adding a cohort never edits this
  -- function and no role name is hardcoded.
  SELECT EXISTS (
    SELECT 1
      FROM public.mba_associate_postings p
      JOIN public.user_roles ur ON ur.user_id = p.associate_user_id
      JOIN public.custom_roles cr ON cr.id = ur.role_id
     WHERE p.area_id = p_area_id
       AND p.associate_user_id = v_uid
       AND p.is_active
       AND COALESCE(cr.is_active, true)
       AND cr.role_key IN (SELECT c.learner_role_key
                             FROM public.teaching_enterprise_cohorts c
                            WHERE c.is_active)
  ) INTO v_posted;

  v_officer := COALESCE(public.is_super_admin(), false)
            OR COALESCE(public.user_has_permission('improvement.area_role.assign'), false);

  IF NOT (v_posted OR v_officer) THEN
    RAISE EXCEPTION 'fn_gemba_observation_record: only someone posted to % (or an officer) may record a visit there', v_label
      USING ERRCODE = '42501';
  END IF;

  -- C1: self-recorded means the department's OWN team member. A posted associate is an
  -- independent observer and is NOT self-recording.
  SELECT EXISTS (
    SELECT 1 FROM public.hr_additional_roles h
     WHERE h.improvement_area_id = p_area_id
       AND h.is_current
       AND h.staff_id IN (SELECT s.id FROM public.staff s WHERE s.profile_id = v_uid)
  ) INTO v_is_self;

  IF v_finding = 'differs' AND v_idea_inst IS NOT NULL THEN
    INSERT INTO public.improvement_ideas
      (institution_id, area_id, author_id, title, problem, proposed_fix, evidence, status)
    VALUES (
      v_idea_inst, p_area_id, v_uid,
      'Playbook does not match what happens in ' || v_label,
      v_notes,
      'Either correct the playbook to describe what the department actually does, or change the practice to match the playbook. A recorded visit found the two disagree.',
      'Raised automatically from a recorded gemba visit on ' || to_char(v_when, 'DD Mon YYYY') || '.',
      'logged'
    )
    RETURNING id INTO v_idea;
  END IF;

  INSERT INTO public.gemba_observations
    (area_id, artifact_id, institution_id, observed_by, observed_at,
     finding, is_self_recorded, notes, raised_idea_id)
  VALUES
    (p_area_id, p_artifact_id, v_inst, v_uid, v_when,
     v_finding, v_is_self, v_notes, v_idea)
  RETURNING id INTO v_id;

  IF p_artifact_id IS NOT NULL THEN
    IF v_finding = 'matches' THEN
      v_days := COALESCE(
        v_days,
        (SELECT (pp.value #>> '{}')::integer FROM public.platform_policies pp
          WHERE pp.policy_key = 'improvement.gemba_interval_days'
            AND pp.scope_type = 'global' AND COALESCE(pp.is_active, true)
          LIMIT 1),
        365
      );
      UPDATE public.mba_dept_artifacts
         SET official_at    = v_when,
             official_until = v_when + make_interval(days => v_days),
             official_by    = v_uid
       WHERE id = p_artifact_id AND area_id = p_area_id;
    ELSE
      -- C3: the most recent evidence wins. A document the platform has just been told
      -- is wrong does not keep calling itself official.
      UPDATE public.mba_dept_artifacts
         SET official_at    = NULL,
             official_until = NULL,
             official_by    = NULL
       WHERE id = p_artifact_id AND area_id = p_area_id;
    END IF;
  END IF;

  RETURN v_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_gemba_observation_record(uuid, uuid, text, text, timestamptz) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_gemba_observation_record(uuid, uuid, text, text, timestamptz) TO authenticated;

-- ---------------------------------------------------------------------------
-- R8 - post associates to Feedback / SCF.
-- It is the only one of the 14 boards with nobody posted to it, and the only one whose
-- organogram named nobody at all. Under C2 that would make it permanently
-- un-observable: no posting, therefore no visit, therefore never official.
-- Two associates, matching the pattern on the other 13, taken from those posted nowhere.
-- ---------------------------------------------------------------------------
INSERT INTO public.mba_associate_postings (associate_user_id, area_id, is_active)
SELECT u.user_id, a.id, true
FROM (
  SELECT ur.user_id
    FROM public.user_roles ur
    JOIN public.custom_roles cr ON cr.id = ur.role_id
   WHERE cr.role_key = 'mba_associate'
     AND NOT EXISTS (SELECT 1 FROM public.mba_associate_postings p
                      WHERE p.associate_user_id = ur.user_id AND p.is_active)
   ORDER BY ur.user_id
   LIMIT 2
) u
CROSS JOIN (SELECT id FROM public.improvement_areas WHERE label = 'Feedback / SCF') a
WHERE NOT EXISTS (
  SELECT 1 FROM public.mba_associate_postings p
   WHERE p.area_id = a.id AND p.is_active
);
