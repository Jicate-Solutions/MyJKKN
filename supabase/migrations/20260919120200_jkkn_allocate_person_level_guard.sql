-- ═══════════════════════════════════════════════════════════════════════════
-- 3. fn_jkkn_allocate — make the lifetime guard PERSON-level
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The existing three-anchor check is kept verbatim and the bridges are added
-- after it, in BOTH directions, so no lane — present or future — can mint a
-- second number for somebody already in the register.
--
-- Blast radius, deliberately checked:
--   • tg_jkkn_auto_issue_associate already pre-checks these same bridges, so
--     it sees no change at all.
--   • All three auto-issue triggers are EXCEPTION WHEN OTHERS ⇒ RAISE WARNING,
--     so a newly-caught collision degrades to a skipped issuance and a warning
--     in the log — never a failed admission, hire or role grant.
--   • fn_jkkn_issue_manual's per-row Issue button on /users/jkkn-id will now
--     refuse for a person who already holds a number through another bridge.
--     That is the intended outcome and the one visible change outside Courses.

CREATE OR REPLACE FUNCTION public.fn_jkkn_allocate(
  p_person_kind text,
  p_learner_profile_id uuid,
  p_team_member_id uuid,
  p_profile_id uuid,
  p_issued_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_attempt   int;
  v_six       text;
  v_candidate text;
  v_id        uuid;
  v_existing  text;
BEGIN
  -- One person, one number, for life. Refuse a second — the whole design
  -- rests on a learner who returns as a team member keeping the number they
  -- already have. (The partial unique indexes enforce this too; this check
  -- exists to fail with a sentence a human can act on.)
  SELECT jkkn_id INTO v_existing
    FROM public.jkkn_identities
   WHERE (p_learner_profile_id IS NOT NULL AND learner_profile_id = p_learner_profile_id)
      OR (p_team_member_id     IS NOT NULL AND team_member_id     = p_team_member_id)
      OR (p_profile_id         IS NOT NULL AND profile_id         = p_profile_id)
   LIMIT 1;

  -- The three anchors above are mutually exclusive columns, so that check only
  -- ever compared the ONE anchor it was handed. A profile-anchored call was
  -- therefore blind to every learner and team_member row — 96% of the register
  -- — which is exactly how a course approval minted a second lifetime number
  -- for a staff member who already had one. Walk the bridges as well.
  IF v_existing IS NULL AND p_profile_id IS NOT NULL THEN
    v_existing := public.fn_jkkn_id_of('profile', p_profile_id);
  END IF;

  IF v_existing IS NULL AND p_learner_profile_id IS NOT NULL THEN
    SELECT ji.jkkn_id INTO v_existing
      FROM public.jkkn_identities ji
      JOIN public.profiles pr ON pr.id = ji.profile_id
     WHERE pr.learner_id = p_learner_profile_id
     LIMIT 1;
  END IF;

  IF v_existing IS NULL AND p_team_member_id IS NOT NULL THEN
    -- Empty-string emails can never match: without the <> '' guard every staff
    -- row with no address would collide with every profile with no address.
    SELECT ji.jkkn_id INTO v_existing
      FROM public.jkkn_identities ji
      JOIN public.profiles pr ON pr.id = ji.profile_id
      JOIN public.staff st ON st.id = p_team_member_id
     WHERE btrim(coalesce(pr.email, '')) <> ''
       AND lower(btrim(pr.email)) IN (
             lower(btrim(coalesce(st.institution_email, ''))),
             lower(btrim(coalesce(st.email, '')))
           )
     LIMIT 1;
  END IF;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'This person already holds JKKN ID %. A person is issued one number for life; to record a new capacity, update person_kind on the existing row.', btrim(v_existing)
      USING ERRCODE = '23505';
  END IF;

  FOR v_attempt IN 1..20 LOOP
    -- 100000..999999 inclusive: random() is [0,1), so floor(random()*900000)
    -- is 0..899999.
    v_six       := (100000 + floor(random() * 900000))::int::text;
    v_candidate := v_six || '-' || public.fn_jkkn_id_check_digit(v_six);

    INSERT INTO public.jkkn_identities (
      jkkn_id, person_kind, learner_profile_id, team_member_id, profile_id, issued_by
    )
    VALUES (
      v_candidate, p_person_kind, p_learner_profile_id, p_team_member_id, p_profile_id, p_issued_by
    )
    ON CONFLICT (jkkn_id) DO NOTHING
    RETURNING id INTO v_id;

    -- ON CONFLICT covers only a number collision. A one-person-one-number
    -- violation is a different unique index and is left to raise.
    IF v_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok',          true,
        'identity_id', v_id,
        'jkkn_id',     v_candidate,
        'person_kind', p_person_kind,
        'attempts',    v_attempt
      );
    END IF;
  END LOOP;

  RAISE EXCEPTION 'Could not find an unused JKKN ID in 20 attempts. The 900,000-number pool is close to exhausted or something is wrong.'
    USING ERRCODE = '53400';
END;
$function$;

-- NO SIGNED-IN CALLER AT ALL, which is the lock this function already carries
-- live ({postgres, service_role}). Minting a lifetime number is a trigger and
-- operator path; nothing reaches it from a user session, and a SECURITY DEFINER
-- allocator that any authenticated user could call would hand out permanent
-- identity. service_role keeps EXECUTE independently, so the auto-issue
-- triggers, the cron and fn_jkkn_issue_manual are unaffected.
REVOKE EXECUTE ON FUNCTION public.fn_jkkn_allocate(text, uuid, uuid, uuid, uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_jkkn_allocate(text, uuid, uuid, uuid, uuid) TO service_role;
