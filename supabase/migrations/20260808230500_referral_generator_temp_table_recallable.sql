-- Migration: fn_generate_referral_commissions — make the temp table re-callable within one txn
-- Added: 2026-08-02 — rank 6 robustness fix.
--
-- Bug: the function does `CREATE TEMP TABLE _gen ON COMMIT DROP`. ON COMMIT DROP only drops at
--   COMMIT, so a SECOND call inside the SAME transaction fails with "relation _gen already exists".
--   The production UI is unaffected (Preview and Generate are separate requests = separate txns),
--   but any batch/test harness that calls the function twice in one txn crashes.
-- Fix: `DROP TABLE IF EXISTS _gen;` immediately before the CREATE. Nothing else changes — the money
--   logic (candidate selection, rate resolution, row-by-row insert, summary) is byte-for-byte identical.
--
-- NOTE: This migration intentionally does NOT add the "still-studying" enrolment filter. That check
--   (recent student_attendance Present OR session_feedback) belongs to end-of-term reconciliation, not
--   to fresh-admission commission generation: as of 2026-08-02, 0 of the 522 linked 2026-27 consultant
--   referrals have any attendance/feedback signal (the academic year has barely begun), so the filter
--   would hold 100% of payments. Wiring it here is a Director policy decision, parked separately.

CREATE OR REPLACE FUNCTION public.fn_generate_referral_commissions(p_year integer, p_dry_run boolean DEFAULT true, p_consultant_ids uuid[] DEFAULT NULL::uuid[], p_created_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_summary jsonb; v_inserted integer := 0;
BEGIN
  -- SECURITY DEFINER bypasses RLS, so gate explicitly. A dry run computes only, but
  -- a real run writes money rows — both require an admission-edit admin.
  IF NOT (is_super_admin() OR is_admin()) THEN
    RAISE EXCEPTION 'Not authorised to generate referral commissions';
  END IF;

  -- Re-callable within a single transaction: ON COMMIT DROP only fires at COMMIT, so a
  -- second call in the same txn would otherwise collide on the existing _gen relation.
  DROP TABLE IF EXISTS _gen;

  -- candidate rows: 2025/26 CONSULTANT referrals that resolve to an active agency,
  -- have a programme, are NOT already transacted, and have a resolvable rate.
  CREATE TEMP TABLE _gen ON COMMIT DROP AS
  SELECT lp.id AS learner_profile_id, lp.institution_id, lp.program_id,
         ec.id AS consultant_id, ec.name AS consultant_name,
         (nullif(ec.bank_account_number,'') IS NOT NULL AND nullif(ec.pan_number,'') IS NOT NULL) AS payable,
         r.flat_amount AS gross,
         round(r.flat_amount * r.tds_percent/100.0, 2) AS tds,
         r.flat_amount - round(r.flat_amount * r.tds_percent/100.0, 2) AS net
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
    -- Insert row-by-row, NOT as a set. The shared trigger_set_transaction_number
    -- derives the next number as MAX(existing)+1 per institution; in a single bulk
    -- INSERT every row sees the same pre-statement snapshot and collides on
    -- TXN-000001. Separate statements let each row see the prior ones. (The trigger
    -- also has a concurrency race under parallel writers — pre-existing, out of scope;
    -- generation is a single admin-run operation.)
    DECLARE rec record;
    BEGIN
      FOR rec IN SELECT * FROM _gen LOOP
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
    'payable_now', (SELECT count(*) FROM _gen WHERE payable),
    'blocked_no_bank', (SELECT count(*) FROM _gen WHERE NOT payable),
    'total_gross', COALESCE((SELECT sum(gross) FROM _gen),0),
    'total_tds',   COALESCE((SELECT sum(tds)   FROM _gen),0),
    'total_net',   COALESCE((SELECT sum(net)   FROM _gen),0),
    'rows_written', v_inserted,
    'by_agency', COALESCE((SELECT jsonb_agg(x ORDER BY (x->>'net')::numeric DESC) FROM (
        SELECT jsonb_build_object('agency',consultant_name,'referrals',count(*),
               'net',sum(net),'payable',bool_and(payable)) x
          FROM _gen GROUP BY consultant_name, consultant_id) s),'[]'::jsonb)
  ) INTO v_summary;

  RETURN v_summary;
END $function$;

-- Re-assert the anon lock. CREATE OR REPLACE preserves the existing ACL (this function
-- was already locked by 20260722120000), so this is idempotent — but MyJKKN policy
-- requires every SECDEF-function migration to carry an explicit anon REVOKE.
REVOKE EXECUTE ON FUNCTION public.fn_generate_referral_commissions(integer, boolean, uuid[], uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_generate_referral_commissions(integer, boolean, uuid[], uuid) TO authenticated;
