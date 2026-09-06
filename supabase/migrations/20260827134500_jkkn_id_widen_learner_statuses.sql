-- ============================================================================
-- JKKN ID: widen learner issuance to reserved/account/graduated/alumni
-- ============================================================================
-- Director-side decision 2026-08-27 (after the 6,034-number backfill): a
-- learner now receives their permanent number at RESERVED — the moment a seat
-- is held and onboarding begins — rather than at admitted/active. 'account',
-- 'graduated' and 'alumni' are included so any record entering those states
-- unissued is picked up. Enquiry-stage statuses (enquiry, enquiry_submitted,
-- pending, approved, waitlisted, rejected) remain excluded: 21,976 enquiries
-- produced 2,477 admissions, and numbers are never spent at enquiry.
--
-- Two parts:
--   1. The auto-issue trigger's WHEN clause gains the four statuses.
--   2. A one-off issuance for the ~1,564 existing learners already in those
--      states, using EXACTLY the trigger's guard order: already-issued → skip;
--      exact-email match to a team-member identity → UPGRADE that row to
--      person_kind='both' (a graduate who joined the team keeps their one
--      number); phone-overlap with an unlinked team-member identity → WITHHELD
--      for a human (phone is parent-grade evidence, and the staff side is
--      already issued, so minting the learner side would create the permanent
--      two-numbers error); otherwise allocate. issued_by stays NULL = system.
-- ============================================================================

-- 1. Widen the trigger.
DROP TRIGGER IF EXISTS trg_jkkn_auto_issue_learner ON public.learners_profiles;
CREATE TRIGGER trg_jkkn_auto_issue_learner
  AFTER INSERT OR UPDATE OF lifecycle_status ON public.learners_profiles
  FOR EACH ROW
  WHEN (NEW.lifecycle_status::text IN ('reserved', 'account', 'admitted', 'active', 'graduated', 'alumni'))
  EXECUTE FUNCTION public.tg_jkkn_auto_issue_learner();

-- 2. One-off issuance for the existing cohort.
DO $$
DECLARE
  r          record;
  v_matches  int;
  v_match_id uuid;
  v_issued   int := 0;
  v_upgraded int := 0;
  v_withheld int := 0;
BEGIN
  FOR r IN
    SELECT lp.id,
           ARRAY(
             SELECT lower(btrim(e))
               FROM unnest(ARRAY[lp.student_email, lp.college_email]) AS e
              WHERE e IS NOT NULL AND btrim(e) <> ''
           ) AS emails,
           NULLIF(right(regexp_replace(coalesce(lp.student_mobile, ''), '[^0-9]', '', 'g'), 10), '') AS ph
      FROM public.learners_profiles lp
     WHERE lp.lifecycle_status::text IN ('reserved', 'account', 'graduated', 'alumni')
       AND NOT EXISTS (SELECT 1 FROM public.jkkn_identities ji WHERE ji.learner_profile_id = lp.id)
     ORDER BY lp.id
  LOOP
    -- Phone-overlap withhold: the matched team member already holds a number,
    -- so if this is the same human, minting here is unrecoverable.
    IF r.ph IS NOT NULL AND length(r.ph) = 10 AND EXISTS (
         SELECT 1
           FROM public.jkkn_identities ji
           JOIN public.staff st ON st.id = ji.team_member_id
          WHERE ji.learner_profile_id IS NULL
            AND right(regexp_replace(coalesce(st.phone, ''), '[^0-9]', '', 'g'), 10) = r.ph
       )
    THEN
      v_withheld := v_withheld + 1;
      RAISE NOTICE 'WITHHELD phone-overlap learner=%', r.id;
      CONTINUE;
    END IF;

    -- Email upgrade: same rule and order as tg_jkkn_auto_issue_learner.
    v_matches := 0; v_match_id := NULL;
    IF array_length(r.emails, 1) IS NOT NULL THEN
      SELECT count(*), min(ji.id::text)::uuid
        INTO v_matches, v_match_id
        FROM public.jkkn_identities ji
        JOIN public.staff st ON st.id = ji.team_member_id
       WHERE ji.learner_profile_id IS NULL
         AND (lower(btrim(coalesce(st.institution_email, ''))) = ANY (r.emails)
           OR lower(btrim(coalesce(st.email, '')))             = ANY (r.emails));
    END IF;

    IF v_matches = 1 THEN
      UPDATE public.jkkn_identities
         SET learner_profile_id = r.id, person_kind = 'both'
       WHERE id = v_match_id;
      v_upgraded := v_upgraded + 1;
      CONTINUE;
    ELSIF v_matches > 1 THEN
      v_withheld := v_withheld + 1;
      RAISE NOTICE 'WITHHELD ambiguous-email learner=% (% matches)', r.id, v_matches;
      CONTINUE;
    END IF;

    PERFORM public.fn_jkkn_allocate('learner', r.id, NULL, NULL, NULL);
    v_issued := v_issued + 1;
  END LOOP;

  RAISE NOTICE 'jkkn widen-statuses backfill: issued=% upgraded_to_both=% withheld=%',
    v_issued, v_upgraded, v_withheld;
END $$;
