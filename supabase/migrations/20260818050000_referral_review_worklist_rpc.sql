-- ─────────────────────────────────────────────────────────────────────────────
-- Referral review worklist — ONE read RPC behind the /admission/consultants/
-- review-worklist screen. Created 2026-08-10.
--
-- WHY THIS EXISTS
--   Three populations of 2026-27 consultant credits were found by audit and have
--   never had a home in the UI. They are findings, not accusations, and none of
--   them is payable today: referral_rate_config holds no active 2026 rate and
--   consultant_commission_transactions has never held a row, so
--   fn_generate_referral_commissions resolves no rate and writes nothing. This
--   RPC exists so the Director can LOOK at all three on one screen BEFORE any
--   rate is switched on — the moment a rate is set, these rows stop being
--   curiosities and start being money.
--
--   A. walkin_credited    — the enquiry (admission_leads) is recorded as
--                           source='walk_in' yet an agency is credited on it.
--                           A walk-in CAN be genuinely agency-referred (the
--                           person walks in because an agency sent them), so
--                           this is a data-controls question about how the two
--                           fields are captured, never a claim about anyone.
--                           `days_after_enquiry` is carried through because it
--                           is the whole diagnostic: 0 means the agency was
--                           entered at enquiry creation, not attached later.
--   B. unlinked           — learners_profiles.referral_type='consultant' with
--                           referred_by_id IS NULL. The generator's candidate
--                           set requires referred_by_id IS NOT NULL, so these
--                           are skipped in silence and whoever is owed is never
--                           recorded. The LINKING screen is a separate change
--                           (PR #2793, /admission/consultants/unlinked-referrals);
--                           this RPC only counts and lists them.
--   C. no_enquiry_trail   — a credit with no admission_leads row behind it at
--                           all. Defined here by the ABSENCE of an enquiry, not
--                           by referral_source — 'auto_sync_learner' is what the
--                           2026-27 rows happen to carry, and hardcoding it
--                           would hide a trail-less credit that arrives by some
--                           other route later. referral_source is returned as
--                           data so the screen can still show it.
--
-- WHAT IT IS NOT
--   Read-only, and STABLE so that is structurally enforced rather than merely
--   promised: a STABLE function cannot write. No approve, no verify, no rate,
--   no commission, no payment. Nothing here changes a single row.
--
-- Year scoping matches fn_generate_referral_commissions exactly — the join to
-- admission_years (p_year 2026 = the 2026-27 intake). Any other definition of
-- "this year" would list a different population from the one the generator will
-- actually act on, which is the specific thing this screen must not do.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_referral_review_worklist(p_year integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_walkin   jsonb;
  v_unlinked jsonb;
  v_orphan   jsonb;
BEGIN
  -- SECURITY DEFINER bypasses RLS, so the gate is explicit. Read-only screen →
  -- the read permission of the enquiry desk that owns this data.
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('admission.leads.view')) THEN
    RAISE EXCEPTION 'Not authorised to view the referral review worklist';
  END IF;

  -- A. Agency credited on an enquiry recorded as a walk-in.
  SELECT COALESCE(jsonb_agg(x ORDER BY x_created_at DESC), '[]'::jsonb)
    INTO v_walkin
  FROM (
    SELECT
      a.created_at AS x_created_at,
      jsonb_build_object(
        'attribution_id',      a.id,
        'learner_profile_id',  lp.id,
        'admission_lead_id',   al.id,
        'learner_name',        COALESCE(NULLIF(btrim(concat_ws(' ', lp.first_name, lp.last_name)), ''),
                                        NULLIF(btrim(al.full_name), '')),
        'programme',           pr.program_name,
        'institution',         inst.name,
        'agency_name',         ec.name,
        'credit_created_at',   a.created_at,
        'is_verified',         COALESCE(a.is_verified, false),
        'verified_by_name',    vp.full_name,
        'enquiry_source',      al.source::text,
        'enquiry_created_at',  al.created_at,
        'referral_source',     a.referral_source,
        -- 0 = the agency was on the enquiry the day it was created.
        'days_after_enquiry',  CASE
                                 WHEN al.created_at IS NULL OR a.created_at IS NULL THEN NULL
                                 ELSE floor(EXTRACT(EPOCH FROM (a.created_at - al.created_at)) / 86400)::int
                               END
      ) AS x
    FROM public.consultant_lead_attributions a
    JOIN public.admission_leads       al   ON al.id   = a.admission_id
    JOIN public.education_consultants ec   ON ec.id   = a.consultant_id
    LEFT JOIN public.learners_profiles lp  ON lp.id   = COALESCE(a.learner_profile_id, al.learner_profile_id)
    LEFT JOIN public.admission_years   ay  ON ay.id   = COALESCE(lp.admission_year_id, al.admission_year_id)
    LEFT JOIN public.programs          pr  ON pr.id   = lp.program_id
    LEFT JOIN public.institutions      inst ON inst.id = COALESCE(lp.institution_id, al.institution_id)
    LEFT JOIN public.profiles          vp  ON vp.id   = a.verified_by
    WHERE al.source::text = 'walk_in'
      AND ay.year = p_year
  ) s;

  -- B. referral_type says consultant, but no agency is linked, so the generator
  --    silently skips the row and nobody owed is ever recorded.
  SELECT COALESCE(jsonb_agg(x ORDER BY x_created_at DESC), '[]'::jsonb)
    INTO v_unlinked
  FROM (
    SELECT
      lp.created_at AS x_created_at,
      jsonb_build_object(
        'attribution_id',      NULL,
        'learner_profile_id',  lp.id,
        'admission_lead_id',   al.id,
        'learner_name',        NULLIF(btrim(concat_ws(' ', lp.first_name, lp.last_name)), ''),
        'programme',           pr.program_name,
        'institution',         inst.name,
        -- No agency is linked — this is the free-text name that was typed, when
        -- one was. NULL here means not even a name survives.
        'agency_name',         NULLIF(btrim(lp.referred_by_name), ''),
        'credit_created_at',   lp.created_at,
        'is_verified',         NULL,
        'verified_by_name',    NULL,
        'enquiry_source',      al.source::text,
        'enquiry_created_at',  al.created_at,
        'referral_source',     NULL,
        'days_after_enquiry',  NULL
      ) AS x
    FROM public.learners_profiles lp
    JOIN public.admission_years ay   ON ay.id   = lp.admission_year_id
    LEFT JOIN public.admission_leads al  ON al.learner_profile_id = lp.id
    LEFT JOIN public.programs        pr  ON pr.id   = lp.program_id
    LEFT JOIN public.institutions    inst ON inst.id = lp.institution_id
    WHERE ay.year = p_year
      AND lp.referral_type   = 'consultant'
      AND lp.referred_by_id IS NULL
  ) s;

  -- C. A credit with no enquiry behind it at all.
  SELECT COALESCE(jsonb_agg(x ORDER BY x_created_at DESC), '[]'::jsonb)
    INTO v_orphan
  FROM (
    SELECT
      a.created_at AS x_created_at,
      jsonb_build_object(
        'attribution_id',      a.id,
        'learner_profile_id',  lp.id,
        'admission_lead_id',   NULL,
        'learner_name',        NULLIF(btrim(concat_ws(' ', lp.first_name, lp.last_name)), ''),
        'programme',           pr.program_name,
        'institution',         inst.name,
        'agency_name',         ec.name,
        'credit_created_at',   a.created_at,
        'is_verified',         COALESCE(a.is_verified, false),
        'verified_by_name',    vp.full_name,
        'enquiry_source',      NULL,
        'enquiry_created_at',  NULL,
        'referral_source',     a.referral_source,
        'days_after_enquiry',  NULL
      ) AS x
    FROM public.consultant_lead_attributions a
    JOIN public.education_consultants ec   ON ec.id   = a.consultant_id
    JOIN public.learners_profiles     lp   ON lp.id   = a.learner_profile_id
    JOIN public.admission_years       ay   ON ay.id   = lp.admission_year_id
    LEFT JOIN public.programs         pr   ON pr.id   = lp.program_id
    LEFT JOIN public.institutions     inst ON inst.id = lp.institution_id
    LEFT JOIN public.profiles         vp   ON vp.id   = a.verified_by
    WHERE ay.year = p_year
      AND a.admission_id IS NULL
      AND NOT EXISTS (
            SELECT 1 FROM public.admission_leads al2
             WHERE al2.learner_profile_id = a.learner_profile_id)
  ) s;

  RETURN jsonb_build_object(
    'academic_year',        p_year,
    'generated_at',         now(),
    'walkin_credited',      v_walkin,
    'unlinked',             v_unlinked,
    'no_enquiry_trail',     v_orphan,
    'counts', jsonb_build_object(
      'walkin_credited',  jsonb_array_length(v_walkin),
      'unlinked',         jsonb_array_length(v_unlinked),
      'no_enquiry_trail', jsonb_array_length(v_orphan)
    ),
    -- The money position, read live rather than asserted in prose, so the
    -- screen's "nothing here is payable" banner can never go stale.
    'money_position', jsonb_build_object(
      'active_rate_count',
        (SELECT count(*) FROM public.referral_rate_config
          WHERE academic_year = p_year AND is_active),
      'commission_row_count',
        (SELECT count(*) FROM public.consultant_commission_transactions)
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_referral_review_worklist(integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_referral_review_worklist(integer) TO authenticated;

COMMENT ON FUNCTION public.fn_referral_review_worklist(integer) IS
  'Read-only review worklist for consultant credits in an intake year: agency credited on a walk-in enquiry, referral_type=consultant with no agency linked, and credits with no enquiry behind them. STABLE, so it cannot write. Gated on admission.leads.view (or admin). Year scoping matches fn_generate_referral_commissions.';
