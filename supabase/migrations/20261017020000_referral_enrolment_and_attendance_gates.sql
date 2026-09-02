-- 20261017020000_referral_enrolment_and_attendance_gates.sql
-- Added: 2026-09-01 — the generator stops paying for people who never took the
-- seat, and holds those a marked register has never seen.
--
-- Companion to 20261017010000 (the clearance table + release RPC).
--
-- THE QUESTION THIS ANSWERS
--   "Before referral charges are paid, do we check the candidate is regular and
--    has been coming to college?"  Answer, before this migration: NO. Not in the
--   generator, the payout batch, the four-stage advance, the walk-in release, or
--   reconciliation — the strings 'attendance', 'lifecycle_status' and 'dropout'
--   appeared in none of them.
--
-- TWO GATES, DIFFERENT FORCE, MATCHED TO EVIDENCE QUALITY
--
--   1. ENROLMENT — HARD BLOCK. lifecycle_status is a fact the platform owns and
--      needs no attendance to trust. An ALLOW-LIST, deliberately, not a block
--      list: 13 statuses are in use and the column is an enum that will grow, so
--      a new status must fail CLOSED (unpaid, noticed) rather than fall through
--      to payment. Enrolled = took the seat: active, admitted, reserved,
--      graduated. ('reserved' earns its place — every reserved BDS learner
--      checked had paid.) Everything else — enquiry, enquiry_submitted, account,
--      approved, waitlisted, rejected, inactive, exited, withdrawal_pending —
--      is not a person who joined.
--      Self-healing: the generator skips already-transacted rows, so a learner
--      whose status later becomes active is picked up by the next run.
--
--   2. ATTENDANCE — HOLD, releasable, and ONLY where the section is marked.
--      Measured before writing: of 247 payable referrals, 62 were marked present,
--      9 appeared on a register and never were, 14 sit in a marked section but
--      never appear on its roster, and 162 sit in a section NOBODY MARKS. They
--      span 28 sections of which only 15 are marked at all. A blanket filter
--      would block 176 people, 162 of them for their college's marking gap, not
--      their own conduct. Scoping the hold to marked sections holds 23.
--
-- Attendance lives as per-section JSONB (student_attendance.attendance_data), so
-- it is unpacked ONCE into a temp table rather than re-scanned per candidate.
--
-- Held rows stay COUNTED and VALUED in the summary — never silently dropped —
-- so a dry run shows what is frozen and what it is worth. Blocked (not enrolled)
-- rows are reported too, for the same reason.

CREATE OR REPLACE FUNCTION public.fn_generate_referral_commissions(
  p_year integer,
  p_dry_run boolean DEFAULT true,
  p_consultant_ids uuid[] DEFAULT NULL::uuid[],
  p_created_by uuid DEFAULT NULL::uuid
)
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
  -- this list cannot be judged, so is never held.
  CREATE TEMP TABLE _marked ON COMMIT DROP AS
  SELECT DISTINCT section_id
    FROM public.student_attendance
   WHERE attendance_date >= make_date(p_year, 7, 1)
     AND section_id IS NOT NULL;
  CREATE INDEX ON _marked (section_id);

  CREATE TEMP TABLE _gen ON COMMIT DROP AS
  SELECT lp.id AS learner_profile_id, lp.institution_id, lp.program_id,
         ec.id AS consultant_id, ec.name AS consultant_name,
         (nullif(ec.bank_account_number,'') IS NOT NULL AND nullif(ec.pan_number,'') IS NOT NULL) AS payable,
         r.flat_amount AS gross,
         round(r.flat_amount * r.tds_percent/100.0, 2) AS tds,
         r.flat_amount - round(r.flat_amount * r.tds_percent/100.0, 2) AS net,
         -- GATE 1 — enrolment. Allow-list; anything unrecognised is NOT enrolled.
         (lp.lifecycle_status::text IN ('active','admitted','reserved','graduated')) AS enrolled,
         -- GATE 2 — attendance, only where the register exists, and not released.
         (
           lp.section_id IS NOT NULL
           AND EXISTS (SELECT 1 FROM _marked m WHERE m.section_id = lp.section_id)
           AND NOT EXISTS (SELECT 1 FROM _att a WHERE a.sid = lp.id AND a.ever_present)
           AND NOT EXISTS (SELECT 1 FROM public.referral_attendance_clearances c
                            WHERE c.learner_profile_id = lp.id AND c.academic_year = p_year)
         ) AS held_attendance,
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
      -- All three gates live here. A row must be enrolled AND not held by either.
      FOR rec IN SELECT * FROM _gen
                  WHERE enrolled AND NOT held_walkin AND NOT held_attendance LOOP
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
    -- The Director's walk-in hold. Key names unchanged for the existing UI.
    'held_walkin', (SELECT count(*) FROM _gen WHERE enrolled AND held_walkin),
    'held_gross', COALESCE((SELECT sum(gross) FROM _gen WHERE enrolled AND held_walkin),0),
    'eligible', (SELECT count(*) FROM _gen WHERE enrolled AND NOT held_walkin AND NOT held_attendance),
    'payable_now', (SELECT count(*) FROM _gen WHERE enrolled AND NOT held_walkin AND NOT held_attendance AND payable),
    'blocked_no_bank', (SELECT count(*) FROM _gen WHERE enrolled AND NOT held_walkin AND NOT held_attendance AND NOT payable),
    'total_gross', COALESCE((SELECT sum(gross) FROM _gen WHERE enrolled AND NOT held_walkin AND NOT held_attendance),0),
    'total_tds',   COALESCE((SELECT sum(tds)   FROM _gen WHERE enrolled AND NOT held_walkin AND NOT held_attendance),0),
    'total_net',   COALESCE((SELECT sum(net)   FROM _gen WHERE enrolled AND NOT held_walkin AND NOT held_attendance),0),
    'rows_written', v_inserted,
    'by_agency', COALESCE((SELECT jsonb_agg(x ORDER BY (x->>'net')::numeric DESC) FROM (
        SELECT jsonb_build_object('agency',consultant_name,
               'referrals',count(*) FILTER (WHERE enrolled AND NOT held_walkin AND NOT held_attendance),
               'held',count(*) FILTER (WHERE enrolled AND (held_walkin OR held_attendance)),
               'not_enrolled',count(*) FILTER (WHERE NOT enrolled),
               'net',COALESCE(sum(net) FILTER (WHERE enrolled AND NOT held_walkin AND NOT held_attendance),0),
               'payable',bool_and(payable)) x
          FROM _gen GROUP BY consultant_name, consultant_id) s),'[]'::jsonb)
  ) INTO v_summary;

  RETURN v_summary;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_generate_referral_commissions(integer, boolean, uuid[], uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_generate_referral_commissions(integer, boolean, uuid[], uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_generate_referral_commissions(integer, boolean, uuid[], uuid) IS
  'Turns attributed consultant referrals into pending commission rows behind three gates: enrolment (allow-list on lifecycle_status, hard block), attendance (held where the section is marked and the learner was never present, releasable via fn_clear_referral_attendance_hold), and the walk-in payout hold. Blocked and held rows are counted and valued but never written. Admin-gated.';
