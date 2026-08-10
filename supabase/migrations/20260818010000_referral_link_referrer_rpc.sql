-- Migration: fn_link_referral_referrer — write-once linking of an UNLINKED consultant referral
-- Added: 2026-08-02 — powers the "Unlinked Referrals" cleanup screen (rank 3).
--
-- Context: 39 of the 2026-27 consultant-type referrals have referral_type='consultant' but
--   referred_by_id IS NULL, so fn_generate_referral_commissions silently skips them (nobody is paid).
--   This RPC lets an admission admin attach the correct education_consultant, WRITE-ONCE.
--
-- Write-once is load-bearing: the trigger sync_learner_referral_to_attribution DELETEs the prior
--   auto_sync_learner attribution whenever referred_by_id CHANGES. We therefore only ever SET when
--   currently NULL and never overwrite — the `AND referred_by_id IS NULL` in the UPDATE makes this
--   atomic even under a concurrent race (a second writer affects 0 rows).
--
-- Attribution conflict (mirrors enrich D36): a learner may already carry a consultant_lead_attributions
--   row from the lead-sync path while referred_by_id is still NULL. Linking to a DIFFERENT consultant
--   would add a second attribution (double-credit). We do not silently block; we REPORT the conflict in
--   the result so the UI can warn before the admin commits.

CREATE OR REPLACE FUNCTION public.fn_link_referral_referrer(
  p_learner_profile_id uuid,
  p_consultant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_ref_type text;
  v_current  uuid;
  v_rows     int;
  v_conflict uuid;
BEGIN
  -- gate: admission-edit admins only (same gate as fn_enrich_referral_import_batch)
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('admission.leads.edit')) THEN
    RAISE EXCEPTION 'Not authorised to link referrals';
  END IF;

  IF p_consultant_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM education_consultants WHERE id = p_consultant_id AND status = 'active') THEN
    RETURN jsonb_build_object('success', false, 'error', 'consultant_not_found_or_inactive');
  END IF;

  SELECT referral_type, referred_by_id INTO v_ref_type, v_current
    FROM learners_profiles WHERE id = p_learner_profile_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'learner_not_found');
  END IF;
  IF v_ref_type IS DISTINCT FROM 'consultant' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_a_consultant_referral');
  END IF;
  IF v_current IS NOT NULL THEN
    -- write-once: already linked; refuse rather than overwrite (would delete prior attribution)
    RETURN jsonb_build_object('success', false, 'error', 'already_linked',
                              'referred_by_id', v_current);
  END IF;

  -- report (do not block) an existing attribution to a DIFFERENT consultant
  SELECT consultant_id INTO v_conflict
    FROM consultant_lead_attributions
   WHERE learner_profile_id = p_learner_profile_id
     AND consultant_id <> p_consultant_id
   LIMIT 1;

  -- atomic write-once set
  UPDATE learners_profiles
     SET referred_by_id = p_consultant_id
   WHERE id = p_learner_profile_id
     AND referred_by_id IS NULL
     AND referral_type = 'consultant';
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'link_race_lost');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'learner_profile_id', p_learner_profile_id,
    'consultant_id', p_consultant_id,
    'had_conflicting_attribution', v_conflict IS NOT NULL,
    'conflicting_consultant_id', v_conflict
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_link_referral_referrer(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_link_referral_referrer(uuid, uuid) TO authenticated;


-- Read side: list the unlinked consultant-type referrals for a year, with any pre-existing
-- attribution surfaced so the UI can warn on a conflict before linking.
CREATE OR REPLACE FUNCTION public.fn_list_unlinked_consultant_referrals(p_year integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v jsonb;
BEGIN
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('admission.leads.view')
          OR user_has_permission('admission.leads.edit')) THEN
    RAISE EXCEPTION 'Not authorised to view unlinked referrals';
  END IF;

  SELECT COALESCE(jsonb_agg(r ORDER BY r->>'learner_name'), '[]'::jsonb) INTO v
  FROM (
    SELECT jsonb_build_object(
      'learner_profile_id', lp.id,
      'learner_name', nullif(trim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,'')), ''),
      'referred_by_name', lp.referred_by_name,
      'program_id', lp.program_id,
      'program_name', pr.program_name,
      'institution_id', lp.institution_id,
      'institution_name', ins.name,
      'existing_attribution_consultant_id', ca.consultant_id,
      'existing_attribution_consultant_name', ec.name
    ) AS r
    FROM learners_profiles lp
    JOIN admission_years ay  ON ay.id  = lp.admission_year_id AND ay.year = p_year
    LEFT JOIN programs pr     ON pr.id  = lp.program_id
    LEFT JOIN institutions ins ON ins.id = lp.institution_id
    LEFT JOIN LATERAL (
      SELECT a.consultant_id FROM consultant_lead_attributions a
       WHERE a.learner_profile_id = lp.id LIMIT 1
    ) ca ON true
    LEFT JOIN education_consultants ec ON ec.id = ca.consultant_id
    WHERE lp.referral_type = 'consultant'
      AND lp.referred_by_id IS NULL
  ) s;

  RETURN v;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_list_unlinked_consultant_referrals(integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_list_unlinked_consultant_referrals(integer) TO authenticated;
