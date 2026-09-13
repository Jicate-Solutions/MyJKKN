-- 20261203090000_referral_gates_hold_unmeasurable_and_drop_reserved.sql
-- Added: 2026-09-12 — two product rules from the Director (2026-09-12) that
-- REVERSE two behaviours currently live in fn_generate_referral_commissions.
-- FILE ONLY / NOT APPLIED — the operator applies it at merge.
--
-- DEPLOY ORDER — APPLY THIS FILE BEFORE THE PAGE DEPLOYS.
-- -------------------------------------------------------
-- /admission/consultants/referral-rates reads held_no_register and
-- held_no_register_gross with `?? 0`. If the page deploys before this migration
-- is applied, the new Stat renders 0, the explanation block disappears, and the
-- OLD gates keep paying the 110 referrals this file holds. It degrades SILENTLY
-- — there is no error and no empty state to notice. Apply this file AND
-- 20261203092000_worklist_shows_no_register_holds.sql first, then deploy.
--
-- KEEP IN LOCKSTEP WITH
--   supabase/migrations/20261203092000_worklist_shows_no_register_holds.sql
-- GATE 3 below and that file's bucket E must stay the SAME predicate, and
-- GATE 2 and its bucket D likewise. If they drift, the review worklist lists
-- people this generator does not hold, or hides people it does — which is the
-- defect that file was written to repair. That file carries the mirror of this
-- note.
--
-- THIS IS A REVERSAL, AND IT OVERRULES A REASONED DECISION. SAY SO PLAINLY.
-- -----------------------------------------------------------------------
-- 20261017010000_referral_attendance_clearances.sql argued at length, from
-- measured production data, that a section nobody marks must NOT hold a
-- referral. Its author counted 176 learners with no attendance record and found
-- 162 of them sat in sections NOBODY MARKS, and concluded that a blanket hold
-- "would have looked like fraud control while actually measuring which Senior
-- Learners mark attendance". That reasoning was sound and that measurement was
-- honest. The Director has overruled it on 2026-09-12.
--
--   RULE 12 — a section with NO attendance register must HOLD, not pay.
--   RULE 15 — lifecycle_status 'reserved' is NOT enrolled. A reserved seat is
--             held, not joined.
--
-- THE HONEST COST, measured on production 2026-09-12 09:40 IST:
--   580 candidates considered
--   190 paid under the SHIPPED gates
--    80 paid under rules 12 + 15, across 10 consultants
--   110 move to the new held_no_register hold — 95 in sections nobody marks,
--       15 with no section at all
--
-- So 110 of 190 credits stop being paid, and the fault this hold punishes is
-- THE COLLEGE'S failure to mark attendance, not the consultant's. That is the
-- trade the Director accepted: no money leaves on evidence the college never
-- collected. The release path is the answer to the unfairness and is unchanged
-- — referral_attendance_clearances clears BOTH attendance holds, which is why
-- that check appears in both branches below.
--
--    17 of the 580 candidates carry lifecycle_status 'reserved'
--     0 payments are removed by RULE 15 ALONE — 190 − 110 = 80 exactly, so
--       every reserved row was ALREADY held by the attendance gate. Rule 15
--       changes no payment today. It prevents a wrong one the first time a
--       reserved learner IS marked present.
-- (Those figures are that single read plus arithmetic; the pooler password has
--  since rotated, so they are not re-runnable from this file.)
--
-- WHY TWO NAMED HOLDS AND NOT ONE
-- -------------------------------
-- held_attendance keeps its existing name and its existing meaning — a register
-- EXISTS for this learner's section and has never seen them. That is a LEARNER
-- problem, and the shipped UI keys for it must not break. held_no_register is
-- new and is a COLLEGE problem — nobody marks this section at all, or the
-- learner has no section yet. Both block payment. They are separate so a screen
-- can tell an absent learner apart from an unkept register, and so the Director
-- can see, in one number, how much money is stuck behind our own paperwork.
--
-- Body taken VERBATIM from the live definition via pg_get_functiondef() on
-- 2026-09-12 and added to, NOT retyped from migration history: several
-- migrations touch this function and the file history is not the live truth.

CREATE OR REPLACE FUNCTION public.fn_generate_referral_commissions(p_year integer, p_dry_run boolean DEFAULT true, p_consultant_ids uuid[] DEFAULT NULL::uuid[], p_created_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_summary jsonb; v_inserted integer := 0;
BEGIN
  IF NOT (is_super_admin() OR is_admin()) THEN
    RAISE EXCEPTION 'Not authorised to generate referral commissions';
  END IF;

  DROP TABLE IF EXISTS _gen;
  DROP TABLE IF EXISTS _att;
  DROP TABLE IF EXISTS _marked;

  -- Attendance signal, unpacked ONCE. Scoped from 1 July of the intake year:
  -- earlier marks belong to a previous cohort's sessions.
  CREATE TEMP TABLE _att ON COMMIT DROP AS
  SELECT (stu->>'student_id')::uuid AS sid,
         bool_or(stu->>'status' ILIKE 'present') AS ever_present
    FROM public.student_attendance sa,
         LATERAL jsonb_each(sa.attendance_data) AS per(k, v),
         LATERAL jsonb_array_elements(v->'students') AS stu
   WHERE sa.attendance_date >= make_date(p_year, 7, 1)
     AND jsonb_typeof(v->'students') = 'array'
   GROUP BY 1;
  CREATE INDEX ON _att (sid);

  -- Which sections anyone is marking at all. A learner in a section absent from
  -- this list cannot be judged — and from 2026-09-12 (rule 12) that is a HOLD,
  -- not a pass. See held_no_register below.
  --
  -- "MARKED" REQUIRES A ROW THAT CARRIES LEARNERS, not merely a row.
  -- attendance_data is JSONB NOT NULL DEFAULT '{}' (setup/01_tables.sql:765), so
  -- the earlier test — any student_attendance row for the section — let ONE EMPTY
  -- ROW make a section count as a kept register. That is MONEY-NEUTRAL: gates 2
  -- and 3 are exact complements, so such a learner was held either way, only
  -- under the wrong name. But it charged a COLLEGE failure to the LEARNER, and
  -- the learner-vs-college split is the one distinction the Director asked to be
  -- able to see, so it is tightened rather than merely documented.
  --
  -- The old `AND section_id IS NOT NULL` guard was a no-op and is dropped:
  -- student_attendance.section_id is `UUID NOT NULL` (setup/01_tables.sql:763).
  --
  -- This predicate is mirrored inline, expression for expression, in buckets D
  -- and E of 20261203092000_worklist_shows_no_register_holds.sql.
  CREATE TEMP TABLE _marked ON COMMIT DROP AS
  SELECT DISTINCT sa.section_id
    FROM public.student_attendance sa
   WHERE sa.attendance_date >= make_date(p_year, 7, 1)
     AND EXISTS (SELECT 1 FROM jsonb_each(sa.attendance_data) AS per(k, v)
                  WHERE jsonb_typeof(v->'students') = 'array'
                    AND jsonb_array_length(v->'students') > 0);
  CREATE INDEX ON _marked (section_id);

  CREATE TEMP TABLE _gen ON COMMIT DROP AS
  SELECT lp.id AS learner_profile_id, lp.institution_id, lp.program_id,
         ec.id AS consultant_id, ec.name AS consultant_name,
         (nullif(ec.bank_account_number,'') IS NOT NULL AND nullif(ec.pan_number,'') IS NOT NULL) AS payable,
         r.flat_amount AS gross,
         round(r.flat_amount * r.tds_percent/100.0, 2) AS tds,
         r.flat_amount - round(r.flat_amount * r.tds_percent/100.0, 2) AS net,
         -- GATE 1 — enrolment. Allow-list; anything unrecognised is NOT enrolled.
         -- RULE 15 (Director, 2026-09-12): 'reserved' REMOVED from this list. A
         -- reserved seat is held, not joined, so it cannot earn a referral.
         (lp.lifecycle_status::text IN ('active','admitted','graduated')) AS enrolled,
         -- GATE 2 — attendance, where the register EXISTS, and not released.
         -- Unchanged: a register exists for this learner's section and has
         -- never seen them. A learner problem.
         (
           lp.section_id IS NOT NULL
           AND EXISTS (SELECT 1 FROM _marked m WHERE m.section_id = lp.section_id)
           AND NOT EXISTS (SELECT 1 FROM _att a WHERE a.sid = lp.id AND a.ever_present)
           AND NOT EXISTS (SELECT 1 FROM public.referral_attendance_clearances c
                            WHERE c.learner_profile_id = lp.id AND c.academic_year = p_year)
         ) AS held_attendance,
         -- GATE 3 — RULE 12 (Director, 2026-09-12), NEW, and a reversal.
         -- Nobody marks this learner's section at all, or the learner has no
         -- section yet. A COLLEGE problem, not a learner one, and not the
         -- consultant's doing — but no money leaves on evidence we never
         -- collected. Released by the SAME clearance table as gate 2, which is
         -- why that check appears in both branches.
         -- MIRRORED by bucket E of 20261203092000_worklist_shows_no_register_
         -- holds.sql, which is the screen that lets an admin release these. Keep
         -- the two predicates identical — 15 of the 110 held here have NO
         -- section at all and can never be freed by marking a register.
         (
           (lp.section_id IS NULL
            OR NOT EXISTS (SELECT 1 FROM _marked m WHERE m.section_id = lp.section_id))
           AND NOT EXISTS (SELECT 1 FROM _att a WHERE a.sid = lp.id AND a.ever_present)
           AND NOT EXISTS (SELECT 1 FROM public.referral_attendance_clearances c
                            WHERE c.learner_profile_id = lp.id AND c.academic_year = p_year)
         ) AS held_no_register,
         -- The Director's walk-in hold (20260909061500), unchanged.
         EXISTS (
           SELECT 1
             FROM public.consultant_lead_attributions a
             JOIN public.admission_leads al ON al.id = a.admission_id
            WHERE COALESCE(a.learner_profile_id, al.learner_profile_id) = lp.id
              AND al.source::text = 'walk_in'
              AND a.payout_cleared_at IS NULL
         ) AS held_walkin
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id AND ay.year = p_year
    JOIN education_consultants ec ON ec.id = lp.referred_by_id AND ec.status = 'active'
    CROSS JOIN LATERAL public.fn_resolve_referral_rate(p_year, lp.institution_id, lp.program_id) r
   WHERE lp.referral_type = 'consultant'
     AND lp.referred_by_id IS NOT NULL
     AND lp.program_id IS NOT NULL
     AND r.id IS NOT NULL
     AND (p_consultant_ids IS NULL OR ec.id = ANY(p_consultant_ids))
     AND NOT EXISTS (SELECT 1 FROM consultant_commission_transactions t
                      WHERE t.learner_profile_id = lp.id);

  IF NOT p_dry_run THEN
    -- Row-by-row, NOT as a set: trigger_set_transaction_number derives the next
    -- number as MAX(existing)+1 per institution, so a bulk INSERT collides.
    DECLARE rec record;
    BEGIN
      -- All four gates live here. A row must be enrolled AND held by none.
      FOR rec IN SELECT * FROM _gen
                  WHERE enrolled AND NOT held_walkin AND NOT held_attendance AND NOT held_no_register LOOP
        INSERT INTO consultant_commission_transactions
          (institution_id, consultant_id, learner_profile_id, transaction_type,
           commission_basis_amount, gross_amount, tds_percentage, tds_amount, other_deductions,
           net_amount, status, created_by)
        VALUES (rec.institution_id, rec.consultant_id, rec.learner_profile_id, 'referral_commission',
                rec.gross, rec.gross, NULL, rec.tds, 0, rec.net, 'pending', p_created_by);
        v_inserted := v_inserted + 1;
      END LOOP;
    END;
  END IF;

  SELECT jsonb_build_object(
    'dry_run', p_dry_run,
    'academic_year', p_year,
    'candidates', (SELECT count(*) FROM _gen),
    -- Gate 1: never took the seat. Blocked outright, not held.
    'blocked_not_enrolled', (SELECT count(*) FROM _gen WHERE NOT enrolled),
    'blocked_not_enrolled_gross', COALESCE((SELECT sum(gross) FROM _gen WHERE NOT enrolled),0),
    -- Gate 2: a marked register has never seen them. Releasable.
    'held_attendance', (SELECT count(*) FROM _gen WHERE enrolled AND NOT held_walkin AND held_attendance),
    'held_attendance_gross', COALESCE((SELECT sum(gross) FROM _gen WHERE enrolled AND NOT held_walkin AND held_attendance),0),
    -- Gate 3 (rule 12): nobody marks the section, or there is no section at all.
    -- Releasable through the same clearance path as gate 2.
    'held_no_register', (SELECT count(*) FROM _gen WHERE enrolled AND NOT held_walkin AND held_no_register),
    'held_no_register_gross', COALESCE((SELECT sum(gross) FROM _gen WHERE enrolled AND NOT held_walkin AND held_no_register),0),
    -- The Director's walk-in hold. Key names unchanged for the existing UI.
    'held_walkin', (SELECT count(*) FROM _gen WHERE enrolled AND held_walkin),
    'held_gross', COALESCE((SELECT sum(gross) FROM _gen WHERE enrolled AND held_walkin),0),
    'eligible', (SELECT count(*) FROM _gen WHERE enrolled AND NOT held_walkin AND NOT held_attendance AND NOT held_no_register),
    'payable_now', (SELECT count(*) FROM _gen WHERE enrolled AND NOT held_walkin AND NOT held_attendance AND NOT held_no_register AND payable),
    'blocked_no_bank', (SELECT count(*) FROM _gen WHERE enrolled AND NOT held_walkin AND NOT held_attendance AND NOT held_no_register AND NOT payable),
    'total_gross', COALESCE((SELECT sum(gross) FROM _gen WHERE enrolled AND NOT held_walkin AND NOT held_attendance AND NOT held_no_register),0),
    'total_tds',   COALESCE((SELECT sum(tds)   FROM _gen WHERE enrolled AND NOT held_walkin AND NOT held_attendance AND NOT held_no_register),0),
    'total_net',   COALESCE((SELECT sum(net)   FROM _gen WHERE enrolled AND NOT held_walkin AND NOT held_attendance AND NOT held_no_register),0),
    'rows_written', v_inserted,
    'by_agency', COALESCE((SELECT jsonb_agg(x ORDER BY (x->>'net')::numeric DESC) FROM (
        SELECT jsonb_build_object('agency',consultant_name,
               'referrals',count(*) FILTER (WHERE enrolled AND NOT held_walkin AND NOT held_attendance AND NOT held_no_register),
               'held',count(*) FILTER (WHERE enrolled AND (held_walkin OR held_attendance OR held_no_register)),
               'not_enrolled',count(*) FILTER (WHERE NOT enrolled),
               'net',COALESCE(sum(net) FILTER (WHERE enrolled AND NOT held_walkin AND NOT held_attendance AND NOT held_no_register),0),
               'payable',bool_and(payable)) x
          FROM _gen GROUP BY consultant_name, consultant_id) s),'[]'::jsonb)
  ) INTO v_summary;

  RETURN v_summary;
END $function$;

COMMENT ON FUNCTION public.fn_generate_referral_commissions(integer, boolean, uuid[], uuid) IS
  'Generates pending consultant referral commissions for one intake year. Four gates: enrolment (hard block; ''reserved'' is NOT enrolled from 2026-09-12), attendance where a register exists (hold), no register kept at all (hold, rule 12, 2026-09-12), and the walk-in payout hold. Both attendance holds are released by referral_attendance_clearances.';

-- SECURITY DEFINER — restate the lock in the same file that replaces the
-- function. Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE to anon on every
-- new function, separate from PUBLIC, so an explicit revoke is the only way to
-- be sure anon cannot call this. (CLAUDE.md, mandatory since 2026-06-06.)
REVOKE EXECUTE ON FUNCTION public.fn_generate_referral_commissions(integer, boolean, uuid[], uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_generate_referral_commissions(integer, boolean, uuid[], uuid) TO authenticated;
