-- 20261017030000_worklist_shows_attendance_holds.sql
-- Added: 2026-09-01 — the review worklist gains a fourth bucket so an attendance
-- hold can actually be released.
--
-- 20261017020000 taught the generator to hold a referral whose learner a MARKED
-- register has never recorded present. Without this the hold would be invisible:
-- nobody could see who was held or clear them, which is the dead end the walk-in
-- hold deliberately avoided.
--
-- Listed here ONLY where the section is marked — identical scoping to the
-- generator, so the screen and the payment run cannot disagree. A learner in a
-- section nobody marks is not judged, not held, and not shown.
--
-- Still STABLE, so it still cannot write. Releasing is
-- fn_clear_referral_attendance_hold, write-once.

CREATE OR REPLACE FUNCTION public.fn_referral_review_worklist(p_year integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_walkin   jsonb;
  v_unlinked jsonb;
  v_orphan   jsonb;
  v_held     integer;
  v_cleared  integer;
  v_att      jsonb;
BEGIN
  -- SECURITY DEFINER bypasses RLS, so the gate is explicit. Read-only screen →
  -- the read permission of the enquiry desk that owns this data.
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('admission.leads.view')) THEN
    RAISE EXCEPTION 'Not authorised to view the referral review worklist';
  END IF;

  -- A. Agency credited on an enquiry recorded as a walk-in.
  --    Held (payout_cleared_at IS NULL) first, then newest credit first.
  SELECT COALESCE(jsonb_agg(x ORDER BY x_held DESC, x_created_at DESC), '[]'::jsonb)
    INTO v_walkin
  FROM (
    SELECT
      a.created_at AS x_created_at,
      (a.payout_cleared_at IS NULL) AS x_held,
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
                               END,
        -- The hold. NULL payout_cleared_at means this credit cannot enter a
        -- payment run, whatever is_verified says about it.
        'payout_cleared_at',   a.payout_cleared_at,
        'payout_cleared_by_name', cp.full_name,
        'payout_cleared_note', a.payout_cleared_note
      ) AS x
    FROM public.consultant_lead_attributions a
    JOIN public.admission_leads       al   ON al.id   = a.admission_id
    JOIN public.education_consultants ec   ON ec.id   = a.consultant_id
    LEFT JOIN public.learners_profiles lp  ON lp.id   = COALESCE(a.learner_profile_id, al.learner_profile_id)
    LEFT JOIN public.admission_years   ay  ON ay.id   = COALESCE(lp.admission_year_id, al.admission_year_id)
    LEFT JOIN public.programs          pr  ON pr.id   = lp.program_id
    LEFT JOIN public.institutions      inst ON inst.id = COALESCE(lp.institution_id, al.institution_id)
    LEFT JOIN public.profiles          vp  ON vp.id   = a.verified_by
    LEFT JOIN public.profiles          cp  ON cp.id   = a.payout_cleared_by
    WHERE al.source::text = 'walk_in'
      AND ay.year = p_year
  ) s;

  -- B. referral_type says consultant, but no agency is linked, so the generator
  --    silently skips the row and nobody owed is ever recorded. The linking screen
  --    (/admission/consultants/unlinked-referrals) shipped with PR #2793 and is live.
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
        'days_after_enquiry',  NULL,
        'payout_cleared_at',   NULL,
        'payout_cleared_by_name', NULL,
        'payout_cleared_note', NULL
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
        'days_after_enquiry',  NULL,
        'payout_cleared_at',   NULL,
        'payout_cleared_by_name', NULL,
        'payout_cleared_note', NULL
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

  -- D. Enrolled, agency-linked referrals whose section IS being marked and whom
  --    that register has never once recorded present. Held out of the payment run
  --    by fn_generate_referral_commissions until someone releases each.
  --    Scoped to MARKED sections on purpose: a learner in a section nobody marks
  --    cannot be judged and is never listed here.
  SELECT COALESCE(jsonb_agg(x ORDER BY x_name), '[]'::jsonb)
    INTO v_att
  FROM (
    SELECT
      NULLIF(btrim(concat_ws(' ', lp.first_name, lp.last_name)), '') AS x_name,
      jsonb_build_object(
        'attribution_id',      NULL,
        'learner_profile_id',  lp.id,
        'admission_lead_id',   NULL,
        'learner_name',        NULLIF(btrim(concat_ws(' ', lp.first_name, lp.last_name)), ''),
        'programme',           pr.program_name,
        'institution',         inst.name,
        'agency_name',         ec.name,
        'credit_created_at',   lp.created_at,
        'is_verified',         NULL,
        'verified_by_name',    NULL,
        'enquiry_source',      NULL,
        'enquiry_created_at',  NULL,
        'referral_source',     NULL,
        'days_after_enquiry',  NULL,
        'payout_cleared_at',   NULL,
        'payout_cleared_by_name', NULL,
        'payout_cleared_note', NULL,
        'lifecycle_status',    lp.lifecycle_status::text
      ) AS x
    FROM public.learners_profiles lp
    JOIN public.admission_years ay ON ay.id = lp.admission_year_id AND ay.year = p_year
    JOIN public.education_consultants ec ON ec.id = lp.referred_by_id AND ec.status = 'active'
    LEFT JOIN public.programs pr      ON pr.id  = lp.program_id
    LEFT JOIN public.institutions inst ON inst.id = lp.institution_id
    WHERE lp.referral_type = 'consultant'
      AND lp.referred_by_id IS NOT NULL
      AND lp.lifecycle_status::text IN ('active','admitted','reserved','graduated')
      AND lp.section_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.student_attendance sa
                   WHERE sa.section_id = lp.section_id
                     AND sa.attendance_date >= make_date(p_year, 7, 1))
      AND NOT EXISTS (
        SELECT 1 FROM public.student_attendance sa,
             LATERAL jsonb_each(sa.attendance_data) AS per(k, v),
             LATERAL jsonb_array_elements(v->'students') AS stu
         WHERE sa.attendance_date >= make_date(p_year, 7, 1)
           AND jsonb_typeof(v->'students') = 'array'
           AND (stu->>'student_id')::uuid = lp.id
           AND stu->>'status' ILIKE 'present')
      AND NOT EXISTS (SELECT 1 FROM public.referral_attendance_clearances c
                       WHERE c.learner_profile_id = lp.id AND c.academic_year = p_year)
  ) s;

  -- How much of the checking job is left, counted the same way the generator counts it.
  SELECT count(*) FILTER (WHERE a.payout_cleared_at IS NULL),
         count(*) FILTER (WHERE a.payout_cleared_at IS NOT NULL)
    INTO v_held, v_cleared
  FROM public.consultant_lead_attributions a
  JOIN public.admission_leads al ON al.id = a.admission_id
  LEFT JOIN public.learners_profiles lp ON lp.id = COALESCE(a.learner_profile_id, al.learner_profile_id)
  LEFT JOIN public.admission_years   ay ON ay.id = COALESCE(lp.admission_year_id, al.admission_year_id)
  WHERE al.source::text = 'walk_in' AND ay.year = p_year;

  RETURN jsonb_build_object(
    'academic_year',        p_year,
    'generated_at',         now(),
    'walkin_credited',      v_walkin,
    'unlinked',             v_unlinked,
    'no_enquiry_trail',     v_orphan,
    'attendance_held',      v_att,
    'counts', jsonb_build_object(
      'walkin_credited',  jsonb_array_length(v_walkin),
      'unlinked',         jsonb_array_length(v_unlinked),
      'no_enquiry_trail', jsonb_array_length(v_orphan),
      'attendance_held',  jsonb_array_length(v_att)
    ),
    -- The Director's hold, as a progress bar rather than a promise.
    'hold', jsonb_build_object(
      'held',    COALESCE(v_held, 0),
      'cleared', COALESCE(v_cleared, 0),
      'total',   COALESCE(v_held, 0) + COALESCE(v_cleared, 0)
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
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_referral_review_worklist(integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_referral_review_worklist(integer) TO authenticated;

COMMENT ON FUNCTION public.fn_referral_review_worklist(integer) IS
  'Read-only review worklist for consultant credits in an intake year: agency credited on a walk-in enquiry (with its payout-hold state), referral_type=consultant with no agency linked, credits with no enquiry behind them, and referrals held because a MARKED register has never recorded the learner present. STABLE, so it cannot write. Gated on admission.leads.view or admin.';

