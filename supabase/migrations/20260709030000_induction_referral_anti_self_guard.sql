-- ============================================================================
-- Harden fn_induction_submit_referral against self-referral / fake referrals.
-- ----------------------------------------------------------------------------
-- Finding 2026-07-09 (loop-integrity audit): 18 of 19 induction referrals for
-- event d0d995a9 were self-referrals — freshers "referring" their own identity
-- (own JKKN student email / own name) with a spare phone number. The old guard
-- only blocked a prospect phone matching the referrer's OWN registered mobile,
-- so a different number sailed through. Because a self/existing-student prospect
-- can never JOIN as a new admission, every such row is dead fuel for the
-- induction cohort loop (decision-13: the loop must not be gameable).
--
-- New rule: a referral prospect must be a genuinely NEW external person. Block
-- when the prospect is the referrer themselves or an already-existing JKKN
-- account/student. Low-false-positive checks only (a real external applicant has
-- none of these). Preserves the L3 referral-desk auto-assign untouched.
-- Applied to prod via Management API; recorded in a PR.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_induction_submit_referral(p_event_id uuid, p_first_name text, p_phone text, p_last_name text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_program_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_learner  UUID;
  v_inst     UUID;
  v_my_name  TEXT;
  v_my_phone TEXT;
  v_my_email TEXT;   -- referrer's own account email (profiles) — for anti-self
  v_phone    TEXT;
  v_digits   TEXT;
  v_email    TEXT;   -- normalized prospect email
  v_lead     UUID;
  v_existing UUID;
  v_count    INTEGER;
  v_desk     UUID;   -- referral-desk owner (from platform_policies), NULL = unassigned
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_referral: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_referral: not a learner'; END IF;

  -- must be enrolled in THIS induction; the lead lands in the induction's institution
  SELECT ip.institution_id INTO v_inst
  FROM public.induction_enrollment ie
  JOIN public.induction_programs ip ON ip.event_id = ie.event_id
  WHERE ie.event_id = p_event_id AND ie.learner_id = v_learner;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_referral: not enrolled in this induction'; END IF;

  -- L3 weld: resolve the configured referral-desk owner (NULL ⇒ leave unassigned)
  v_desk := NULLIF(public.fn_get_policy_text('admission.referral_desk.owner_id', NULL), '')::uuid;

  SELECT NULLIF(btrim(COALESCE(lp.first_name,'') || ' ' || COALESCE(lp.last_name,'')), ''),
         lp.student_mobile
    INTO v_my_name, v_my_phone
  FROM public.learners_profiles lp WHERE lp.id = v_learner;

  -- referrer's own account email (for the anti-self-email check)
  SELECT p.email INTO v_my_email FROM public.profiles p WHERE p.learner_id = v_learner;

  -- validate prospect
  IF btrim(COALESCE(p_first_name,'')) = '' THEN
    RAISE EXCEPTION 'fn_induction_submit_referral: prospect name is required';
  END IF;
  v_phone  := btrim(COALESCE(p_phone,''));
  v_digits := regexp_replace(v_phone, '\D', '', 'g');
  v_email  := lower(btrim(COALESCE(p_email,'')));
  IF length(v_digits) < 10 THEN
    RAISE EXCEPTION 'fn_induction_submit_referral: a valid phone number is required';
  END IF;
  IF v_my_phone IS NOT NULL AND regexp_replace(v_my_phone, '\D', '', 'g') = v_digits THEN
    RAISE EXCEPTION 'fn_induction_submit_referral: you cannot refer your own number';
  END IF;

  -- ── Anti-self-referral / anti-existing-student (loop-integrity, 2026-07-09) ──
  -- A referral must be a genuinely NEW external prospect. Block the referrer
  -- themselves and anyone who already has a JKKN account/student record — they
  -- can never become a NEW admission (the KPI the induction loop measures).
  IF v_email <> '' THEN
    IF v_my_email IS NOT NULL AND v_email = lower(v_my_email) THEN
      RAISE EXCEPTION 'fn_induction_submit_referral: you cannot refer your own email address';
    END IF;
    IF v_email ~ '@jkkn\.a[cn]\.in$' THEN
      RAISE EXCEPTION 'fn_induction_submit_referral: that is a JKKN student email — refer someone applying from OUTSIDE, not an existing student';
    END IF;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(email) = v_email) THEN
      RAISE EXCEPTION 'fn_induction_submit_referral: this person already has a JKKN account — refer someone new';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.learners_profiles
             WHERE regexp_replace(COALESCE(student_mobile,''), '\D', '', 'g') = v_digits) THEN
    RAISE EXCEPTION 'fn_induction_submit_referral: this number already belongs to a JKKN student — refer someone new';
  END IF;
  IF v_my_name IS NOT NULL
     AND length(split_part(lower(v_my_name), ' ', 1)) >= 3
     AND split_part(lower(btrim(p_first_name)), ' ', 1) = split_part(lower(v_my_name), ' ', 1) THEN
    RAISE EXCEPTION 'fn_induction_submit_referral: the prospect cannot share your own first name — refer a different person';
  END IF;

  -- dedupe: same prospect phone already referred by this fresher → return existing
  SELECT al.id INTO v_existing
  FROM public.admission_leads al
  WHERE al.referred_by_id = v_learner
    AND regexp_replace(al.phone, '\D', '', 'g') = v_digits
  ORDER BY al.created_at DESC
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    v_lead := v_existing;
  ELSE
    INSERT INTO public.admission_leads
      (institution_id, first_name, last_name, phone, email,
       source, funnel_stage, referral_type, referred_by_id, referred_by_name,
       program_id, notes,
       assigned_counselor_id, assigned_at)
    VALUES
      (v_inst, btrim(p_first_name), NULLIF(btrim(COALESCE(p_last_name,'')), ''), v_phone,
       NULLIF(v_email, ''),
       'referral'::lead_source, 'new'::funnel_stage, 'student', v_learner, v_my_name,
       p_program_id, NULLIF(btrim(COALESCE(p_note,'')), ''),
       -- L3 weld: auto-assign to the referral desk (assigned_counselor_id → profiles;
       -- counselor_id is left NULL — it FKs admission_counselors, and the desk is not one)
       v_desk, CASE WHEN v_desk IS NOT NULL THEN now() ELSE NULL END)
    RETURNING id INTO v_lead;
  END IF;

  -- recompute the effort gate — count only LIVE referrals (a quarantined/junk
  -- lead in 'lost' does not count toward the fresher's referral outcome).
  SELECT count(*) INTO v_count
  FROM public.admission_leads al
  WHERE al.referred_by_id = v_learner
    AND al.source = 'referral'::lead_source
    AND al.funnel_stage <> 'lost'::funnel_stage;

  INSERT INTO public.induction_completion
      (event_id, learner_id, institution_id, referrals_submitted, outcome_complete)
  VALUES (p_event_id, v_learner, v_inst, v_count, v_count >= 1)
  ON CONFLICT (event_id, learner_id) DO UPDATE
    SET referrals_submitted = EXCLUDED.referrals_submitted,
        outcome_complete    = EXCLUDED.referrals_submitted >= 1,
        updated_at          = now();

  RETURN jsonb_build_object(
    'lead_id', v_lead,
    'action', CASE WHEN v_existing IS NOT NULL THEN 'duplicate' ELSE 'created' END,
    'referrals_submitted', v_count,
    'outcome_complete', v_count >= 1
  );
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_submit_referral(uuid, text, text, text, text, uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_submit_referral(uuid, text, text, text, text, uuid, text) TO authenticated;
