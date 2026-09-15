-- 20261203092000_worklist_shows_no_register_holds.sql
-- Added: 2026-09-13 — the review worklist gains a FIFTH bucket, so the hold that
-- 20261203090000 introduces can actually be released by a human.
-- FILE ONLY / NOT APPLIED — the operator applies it at merge.
--
-- DEPLOY ORDER — APPLY THIS FILE BEFORE THE PAGE DEPLOYS.
-- -------------------------------------------------------
-- Apply BOTH 20261203090000 and this file before the front-end deploys. The
-- screens read the new keys with `?? 0`, so a page that ships ahead of the
-- migration renders an empty bucket and a zero count while the OLD gates keep
-- paying. It degrades SILENTLY — there is no error to notice.
--
-- WHY THIS FILE EXISTS AT ALL
-- ---------------------------
-- 20261203090000 adds GATE 3 (held_no_register): a referral whose section nobody
-- marks, or who has no section at all, is now HELD. Without this file that hold
-- has NO release route a human can reach:
--
--   * fn_referral_review_worklist's bucket D is scoped to sections that ARE
--     marked (20261017030000, bucket D). That is the EXACT LOGICAL COMPLEMENT of
--     gate 3, so the two sets are disjoint BY CONSTRUCTION and not one of the
--     newly-held learners could ever appear there.
--   * fn_clear_referral_attendance_hold WOULD accept them — it keys on
--     (learner_profile_id, academic_year) and knows nothing about sections — but
--     no screen ever called it with those ids.
--   * Marking the register releases most of them, but 15 of the 110 measured on
--     2026-09-12 have NO SECTION AT ALL. There is no register to mark for them.
--     For those, an admin release is the only route that exists.
--
-- KEEP IN LOCKSTEP WITH
--   supabase/migrations/20261203090000_referral_gates_hold_unmeasurable_and_drop_reserved.sql
-- Bucket E below and that file's GATE 3 must stay the SAME predicate. If they
-- drift, the screen lists people the generator does not hold, or hides people it
-- does — which is precisely the defect this file repairs. That file carries the
-- mirror of this note.
--
-- THREE CHANGES, all inside fn_referral_review_worklist:
--
--   1. BUCKET D LOSES 'reserved'. It read
--      IN ('active','admitted','reserved','graduated') while 20261203090000 makes
--      the generator's allow-list ('active','admitted','graduated'). Left alone
--      that is a MONEY defect, not a cosmetic one: a reserved learner in a
--      marked-but-never-present section would keep appearing as a releasable
--      hold while the generator hard-blocks them as not enrolled. An admin
--      releases it; the clearance is WRITE-ONCE per (learner_profile_id,
--      academic_year) — constraint referral_attendance_clearances_once
--      (20261017010000:42) — so when that learner later flips to 'active' the
--      clearance is already spent and they are paid with NOBODY having reviewed
--      their still-absent attendance.
--
--   2. "A REGISTER EXISTS" IS TIGHTENED IN BOTH BUCKETS. The old test was
--      "any student_attendance row for this section in range". attendance_data is
--      JSONB NOT NULL DEFAULT '{}' (setup/01_tables.sql:765), so ONE EMPTY ROW
--      made a section count as a kept register. That is MONEY-NEUTRAL — both
--      branches hold, and D and E are complements, so a learner only ever moves
--      BETWEEN the two — but it pushed those learners into held_attendance (a
--      LEARNER problem) instead of held_no_register (a COLLEGE problem), biasing
--      the one distinction the Director asked to be able to see. The test now
--      requires at least one non-empty students array.
--
--   3. NEW BUCKET E, no_register_held: the learners gate 3 holds, listed so they
--      can be released one at a time through the SAME
--      fn_clear_referral_attendance_hold path bucket D already uses.
--
-- Bucket E matches GATE 3 exactly, which means it does NOT exclude walk-in
-- holds — gate 3 is the column, and the walk-in exclusion is applied later, in
-- the generator's summary. Bucket D has always behaved the same way. A row held
-- BOTH ways still needs its walk-in credit released on bucket A.
--
-- Body reconstructed from 20261017030000_worklist_shows_attendance_holds.sql on
-- jicate/main, NOT from pg_get_functiondef(): the Supabase MCP server is
-- disconnected in this session and no pooler credential is reachable from this
-- machine, so the live definition could not be dumped. 20261017030000 is the
-- LAST of the three migrations that touch this function on jicate/main
-- (20260818050000, 20260909061600, 20261017030000), so it is the best available
-- statement of the live body — but it is a FILE, not the database. A reviewer
-- with pooler access should diff this against pg_get_functiondef() before apply.
--
-- Still STABLE, so it still cannot write. Releasing remains
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
      AND lp.lifecycle_status::text IN ('active','admitted','graduated')
      AND lp.section_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.student_attendance sa
                   WHERE sa.section_id = lp.section_id
                     AND sa.attendance_date >= make_date(p_year, 7, 1)
                     AND EXISTS (SELECT 1 FROM jsonb_each(sa.attendance_data) AS per(k, v)
                                  WHERE jsonb_typeof(v->'students') = 'array'
                                    AND jsonb_array_length(v->'students') > 0))
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
  SELECT COALESCE(jsonb_agg(x ORDER BY x_name), '[]'::jsonb)
    INTO v_noreg
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
        'lifecycle_status',    lp.lifecycle_status::text,
        -- Which of the two reasons it is, so the screen can say "no section yet"
        -- rather than "nobody marks it" for the learners who have no section at
        -- all — those can NEVER be released by marking a register.
        'has_section',         (lp.section_id IS NOT NULL)
      ) AS x
    FROM public.learners_profiles lp
    JOIN public.admission_years ay ON ay.id = lp.admission_year_id AND ay.year = p_year
    JOIN public.education_consultants ec ON ec.id = lp.referred_by_id AND ec.status = 'active'
    LEFT JOIN public.programs pr      ON pr.id  = lp.program_id
    LEFT JOIN public.institutions inst ON inst.id = lp.institution_id
    WHERE lp.referral_type = 'consultant'
      AND lp.referred_by_id IS NOT NULL
      AND lp.lifecycle_status::text IN ('active','admitted','graduated')
      AND (
        lp.section_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM public.student_attendance sa
                        WHERE sa.section_id = lp.section_id
                          AND sa.attendance_date >= make_date(p_year, 7, 1)
                          AND EXISTS (SELECT 1 FROM jsonb_each(sa.attendance_data) AS per(k, v)
                                       WHERE jsonb_typeof(v->'students') = 'array'
                                         AND jsonb_array_length(v->'students') > 0))
      )
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
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_referral_review_worklist(integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_referral_review_worklist(integer) TO authenticated;

COMMENT ON FUNCTION public.fn_referral_review_worklist(integer) IS
  'Read-only review worklist for consultant credits in an intake year: agency credited on a walk-in enquiry (with its payout-hold state), referral_type=consultant with no agency linked, credits with no enquiry behind them, referrals held because a KEPT register has never recorded the learner present, and (from 2026-09-12, rule 12) referrals held because no register is kept for their section at all or they have no section. The last two buckets are exact complements and mirror GATE 2 and GATE 3 of fn_generate_referral_commissions; both release through fn_clear_referral_attendance_hold. STABLE, so it cannot write. Gated on admission.leads.view or admin.';
