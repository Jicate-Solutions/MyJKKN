-- 20270418090000_review_worklist_read_attendance_once.sql
-- Added: 2026-09-30 — the Referral Review Worklist loads again.
--
-- WHY THIS EXISTS
-- ---------------
-- /admission/consultants/review-worklist showed every list EMPTY ("No walk-in
-- enquiries carry an agency credit in 2026–27") while 352 walk-in claims were
-- waiting. fn_referral_review_worklist(2026) took 88 seconds; the authenticated
-- role's statement limit is 8, so PostgREST returned 500 and the page drew nothing.
-- The newly named release owner (Isvarya, Director ruling 2026-09-27) could not
-- see a single claim to release.
--
-- The cost was buckets D and E (attendance holds): each candidate learner ran a
-- correlated NOT EXISTS that re-expanded every attendance register since 1 July
-- (10,485 rows / 54 MB of JSON) — once per learner, twice over. Both buckets now
-- share ONE pass that builds two sets (who was marked present; which sections keep
-- a register) and join against them.
--
-- SAME ANSWER: rehearsed on production 2026-09-30 as the release owner — the new
-- body returned in 2.2 s under an 8 s limit, and every list (walkin_credited 352,
-- unlinked 41, no_enquiry_trail 6, attendance_held 20, no_register_held 78), the
-- counts, the hold and money_position were byte-identical to the old body's output
-- (only generated_at differs). Signature, STABLE, SECURITY DEFINER, the permission
-- gate and every other bucket are unchanged — this is the live body with the D/E
-- block replaced. GATE 3 in 20261203090000 is untouched; its predicate is the same.

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
  v_noreg    jsonb;
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
        -- one was. NULL means not even a name survives.
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
  --    that register has never once recorded present. A LEARNER problem. Held out
  --    of the payment run by fn_generate_referral_commissions GATE 2 until
  --    someone releases each.
  --
  --    'reserved' is NOT in the allow-list from 2026-09-12 (rule 15) — it must
  --    match the generator's GATE 1 or this screen offers a release for somebody
  --    the generator blocks outright, and the write-once clearance is burned.
  --
  --    "A register exists" now requires a row carrying at least one learner, not
  --    merely a row. Same expression as the generator's _marked temp table.
  -- E. NEW (rule 12, 2026-09-12). Enrolled, agency-linked referrals nobody can
  --    measure: NO register is kept for their section at all, or they have not
  --    been placed in a section. A COLLEGE problem, not a learner one — but from
  --    2026-09-12 it HOLDS, so it has to be visible and releasable.
  --
  --    This WHERE clause is the inline form of GATE 3 in
  --    20261203090000_referral_gates_hold_unmeasurable_and_drop_reserved.sql.
  --    The two must stay identical. Bucket D is its exact complement, so every
  --    unmeasured, uncleared referral lands in exactly one of D or E — never
  --    both, never neither.
  --    D and E are computed in ONE statement (2026-09-30). Each used to test every
  --    candidate learner with a correlated NOT EXISTS that re-expanded every
  --    attendance register since 1 July — 10,485 rows / 54 MB of JSON — once per
  --    learner, so the whole RPC ran past the 8-second statement limit and the
  --    review screen showed every list empty. The two facts it needs are now built
  --    once as sets (who was marked present; which sections keep a register) and
  --    joined against. Same predicates, same buckets: D = section keeps a register,
  --    E = no section or a section with no register. A learner id is compared as
  --    canonical text (lower, trimmed) instead of casting every stored id to uuid.
  WITH present AS MATERIALIZED (
    SELECT DISTINCT lower(btrim(stu->>'student_id')) AS sid
      FROM public.student_attendance sa,
           LATERAL jsonb_each(sa.attendance_data) AS per(k, v),
           LATERAL jsonb_array_elements(v->'students') AS stu
     WHERE sa.attendance_date >= make_date(p_year, 7, 1)
       AND jsonb_typeof(v->'students') = 'array'
       AND stu->>'status' ILIKE 'present'
  ),
  kept AS MATERIALIZED (
    SELECT DISTINCT sa.section_id
      FROM public.student_attendance sa
     WHERE sa.attendance_date >= make_date(p_year, 7, 1)
       AND sa.section_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM jsonb_each(sa.attendance_data) AS per(k, v)
                    WHERE jsonb_typeof(v->'students') = 'array'
                      AND jsonb_array_length(v->'students') > 0)
  ),
  cand AS (
    SELECT
      NULLIF(btrim(concat_ws(' ', lp.first_name, lp.last_name)), '') AS x_name,
      (lp.section_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM kept k WHERE k.section_id = lp.section_id)) AS is_kept,
      lp.section_id IS NOT NULL AS has_section,
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
      AND lp.lifecycle_status::text IN ('active','admitted','graduated')
      AND NOT EXISTS (SELECT 1 FROM present p WHERE p.sid = lp.id::text)
      AND NOT EXISTS (SELECT 1 FROM public.referral_attendance_clearances c
                       WHERE c.learner_profile_id = lp.id AND c.academic_year = p_year)
  )
  SELECT COALESCE(jsonb_agg(x ORDER BY x_name) FILTER (WHERE is_kept), '[]'::jsonb),
         -- E carries has_section so the screen can say "no section yet" rather
         -- than "nobody marks it" — those can NEVER be released by a register.
         COALESCE(jsonb_agg(x || jsonb_build_object('has_section', has_section)
                            ORDER BY x_name) FILTER (WHERE NOT is_kept), '[]'::jsonb)
    INTO v_att, v_noreg
  FROM cand;

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
    'no_register_held',     v_noreg,
    'counts', jsonb_build_object(
      'walkin_credited',  jsonb_array_length(v_walkin),
      'unlinked',         jsonb_array_length(v_unlinked),
      'no_enquiry_trail', jsonb_array_length(v_orphan),
      'attendance_held',  jsonb_array_length(v_att),
      'no_register_held', jsonb_array_length(v_noreg)
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
$function$
;

REVOKE EXECUTE ON FUNCTION public.fn_referral_review_worklist(integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_referral_review_worklist(integer) TO authenticated;
