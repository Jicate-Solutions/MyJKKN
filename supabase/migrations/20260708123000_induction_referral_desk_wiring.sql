-- ============================================================================
-- L3 weld — route induction referral leads to a working "referral desk" owner
-- ----------------------------------------------------------------------------
-- Problem: fn_induction_submit_referral deposits referrals into admission_leads
-- with source='referral', which is deliberately excluded from counselors' auto
-- pull — but NO handler was designated, so all such leads sit unowned at 'new'
-- and never get worked. Joins stay 0, which starves the induction cohort loop
-- (L4) and the feeder/seat half of L5.
--
-- Decision (Director, 2026-07-08): a single dedicated referral desk =
--   coo@jkkn.ac.in  (auth uid 1b84aed1-253d-4021-8aad-1723ab5aa0a7).
--
-- Four parts, one transaction:
--   (1) grant the COO role the two admission rights it needs to WORK + DELEGATE
--       referral leads (only 1 user holds this role — coo@jkkn.ac.in).
--   (2) a config row for the desk owner (canonical config-table-pattern) so the
--       desk can be re-pointed later WITHOUT a code change.
--   (3) auto-route: fn_induction_submit_referral now stamps the desk owner on
--       every new referral it creates (falls back to unassigned if unset).
--   (4) back-assign the existing unowned referral leads to the desk.
-- Fully reversible. Applied to prod via Management API + recorded in a PR.
-- ============================================================================
BEGIN;

-- (1) Grant COO the ability to edit a lead + delegate to counselors ----------
UPDATE public.custom_roles
SET permissions = permissions
      || jsonb_build_object('admission.leads.edit', true,
                            'admission.counselors.team.manage', true),
    updated_at = now()
WHERE role_key = 'coo';

-- (2) Config row: who is the referral desk (change this row to re-point) ------
INSERT INTO public.platform_policies
  (policy_key, scope_type, data_type, value, description,
   is_active, publication_state, published_at)
SELECT 'admission.referral_desk.owner_id', 'global', 'string',
       to_jsonb('1b84aed1-253d-4021-8aad-1723ab5aa0a7'::text),
       'Auth user id of the admission "referral desk" that owns induction-sourced '
       || 'referral leads (source=referral). Set to the COO account 2026-07-08.',
       true, 'published', now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
  WHERE policy_key = 'admission.referral_desk.owner_id' AND scope_type = 'global'
);

-- (3) Auto-route future referrals to the desk owner --------------------------
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
  v_phone    TEXT;
  v_digits   TEXT;
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

  -- validate prospect
  IF btrim(COALESCE(p_first_name,'')) = '' THEN
    RAISE EXCEPTION 'fn_induction_submit_referral: prospect name is required';
  END IF;
  v_phone  := btrim(COALESCE(p_phone,''));
  v_digits := regexp_replace(v_phone, '\D', '', 'g');
  IF length(v_digits) < 10 THEN
    RAISE EXCEPTION 'fn_induction_submit_referral: a valid phone number is required';
  END IF;
  IF v_my_phone IS NOT NULL AND regexp_replace(v_my_phone, '\D', '', 'g') = v_digits THEN
    RAISE EXCEPTION 'fn_induction_submit_referral: you cannot refer your own number';
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
       NULLIF(btrim(COALESCE(p_email,'')), ''),
       -- referral_type is constrained to {consultant,student,faculty}; a fresher is a
       -- STUDENT referrer (the induction-specific identity is referred_by_id below).
       'referral'::lead_source, 'new'::funnel_stage, 'student', v_learner, v_my_name,
       p_program_id, NULLIF(btrim(COALESCE(p_note,'')), ''),
       -- L3 weld: auto-assign to the referral desk (assigned_counselor_id → profiles;
       -- counselor_id is left NULL — it FKs admission_counselors, and the desk is not one)
       v_desk, CASE WHEN v_desk IS NOT NULL THEN now() ELSE NULL END)
    RETURNING id INTO v_lead;
  END IF;

  -- recompute the effort gate from the source of truth (no counter drift)
  SELECT count(*) INTO v_count
  FROM public.admission_leads al
  WHERE al.referred_by_id = v_learner AND al.source = 'referral'::lead_source;

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

-- (4) Back-assign the existing unowned induction referral leads to the desk ---
UPDATE public.admission_leads
SET assigned_counselor_id = '1b84aed1-253d-4021-8aad-1723ab5aa0a7',
    assigned_at           = now()
WHERE source = 'referral'::lead_source
  AND assigned_counselor_id IS NULL
  AND referred_by_id IN (
    SELECT learner_id FROM public.induction_enrollment
    WHERE event_id = 'd0d995a9-8ab4-4ee8-a90b-e63f42a29d46'
  );

COMMIT;
