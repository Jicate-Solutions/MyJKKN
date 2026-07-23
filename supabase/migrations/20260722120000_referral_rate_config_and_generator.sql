-- Referral payment machine — rate config + commission generator
-- Created 2026-07-22. Spec: SPECS.md §6 F4+F5+F6. Decisions D3/D15/D20/D28.
--
-- WHY A NEW RATE TABLE (not consultant_commission_structures / referral_reward_configs):
--   D3 = "one flat rate per course/institution, the same for every agency". The existing
--   consultant_commission_structures has course granularity but consultant_id is NOT NULL —
--   it models per-agency NEGOTIATED deals (milestones, volume tiers), which is the wrong
--   scope for a universal rate. referral_reward_configs is universal but is the PERKS rail
--   (feeds referral_rewards with redeemed_at/expires_at), not the cash rail. A universal
--   flat cash rate that feeds consultant_commission_transactions has no correct home, so
--   this small purpose-built table is the honest model, not a parallel mechanism.
--
-- The generator (fn_generate_referral_commissions) is the ONE thing nothing in the system
-- does today: turn an attributed referral into a commission transaction. It defaults to a
-- DRY RUN (compute + preview, write nothing) — matching D20 (approving never auto-pays) and
-- D15 (never auto-fires). Scope = CONSULTANT (agency) referrals only, the cash rail / wave 1
-- (D7). Faculty go to payroll (F7), students are excluded (D4).

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Fix a pre-existing bug in the shared transaction-number trigger.
--    It derived the next number as MAX(existing)+1 SCOPED TO institution_id, but the
--    unique constraint on transaction_number is GLOBAL. So the first transaction of
--    every institution got TXN-000001 and collided across institutions. It never
--    surfaced only because the ledger has always been empty (0 rows ever). This
--    breaks the manual commission-entry path too, not just the generator. Fix =
--    number globally (there is no existing data to preserve). The global unique
--    index remains the integrity backstop against the (rare, pre-existing) race
--    between two concurrent writers.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trigger_set_transaction_number()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE next_seq integer;
BEGIN
  IF NEW.transaction_number IS NULL THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(transaction_number,'[^0-9]','','g'),'')::integer),0) + 1
      INTO next_seq FROM consultant_commission_transactions;   -- global, not per-institution
    NEW.transaction_number := 'TXN-' || LPAD(next_seq::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Rate config — flat amount by (institution, optional programme), universal
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.referral_rate_config (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year  integer NOT NULL,                 -- 2025 = "2025-26" intake, etc.
  institution_id uuid REFERENCES public.institutions(id),   -- NULL = every institution
  program_id     uuid REFERENCES public.programs(id),       -- NULL = every programme in scope
  flat_amount    numeric NOT NULL CHECK (flat_amount >= 0), -- gross rupees per admission
  tds_percent    numeric NOT NULL DEFAULT 0 CHECK (tds_percent >= 0 AND tds_percent <= 100),
  notes          text,
  is_active      boolean NOT NULL DEFAULT true,
  created_by     uuid REFERENCES public.profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
-- one active rate per (year, institution, programme) scope
CREATE UNIQUE INDEX IF NOT EXISTS uq_referral_rate_scope
  ON public.referral_rate_config (academic_year, COALESCE(institution_id,'00000000-0000-0000-0000-000000000000'::uuid), COALESCE(program_id,'00000000-0000-0000-0000-000000000000'::uuid))
  WHERE is_active;

ALTER TABLE public.referral_rate_config ENABLE ROW LEVEL SECURITY;
-- Read aligns with the page/sidebar permission (commissions.view) so a user never
-- sees the page then gets RLS-denied on its data. Writing rates is money config →
-- admin-only.
DROP POLICY IF EXISTS referral_rate_config_read ON public.referral_rate_config;
CREATE POLICY referral_rate_config_read ON public.referral_rate_config
  FOR SELECT USING (is_super_admin() OR is_admin() OR user_has_permission('admission.consultants.commissions.view'));
DROP POLICY IF EXISTS referral_rate_config_write ON public.referral_rate_config;
CREATE POLICY referral_rate_config_write ON public.referral_rate_config
  FOR ALL USING (is_super_admin() OR is_admin())
  WITH CHECK (is_super_admin() OR is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Rate resolver — most-specific wins: (inst+prog) > (inst) > (prog) > global
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_resolve_referral_rate(
  p_year integer, p_institution_id uuid, p_program_id uuid)
RETURNS public.referral_rate_config
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.referral_rate_config
   WHERE academic_year = p_year AND is_active
     AND (institution_id IS NULL OR institution_id = p_institution_id)
     AND (program_id     IS NULL OR program_id     = p_program_id)
   ORDER BY (institution_id IS NOT NULL)::int + (program_id IS NOT NULL)::int DESC,
            (program_id IS NOT NULL)::int DESC
   LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_resolve_referral_rate(integer,uuid,uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_resolve_referral_rate(integer,uuid,uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Generator — attributed CONSULTANT referrals → commission transactions.
--    DRY RUN by default: computes and returns a preview, writes nothing.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_generate_referral_commissions(
  p_year integer,
  p_dry_run boolean DEFAULT true,
  p_consultant_ids uuid[] DEFAULT NULL,   -- NULL = all; else limit to these agencies (D27 small group)
  p_created_by uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_summary jsonb; v_inserted integer := 0;
BEGIN
  -- SECURITY DEFINER bypasses RLS, so gate explicitly. A dry run computes only, but
  -- a real run writes money rows — both require an admission-edit admin.
  IF NOT (is_super_admin() OR is_admin()) THEN
    RAISE EXCEPTION 'Not authorised to generate referral commissions';
  END IF;

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
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_generate_referral_commissions(integer,boolean,uuid[],uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_generate_referral_commissions(integer,boolean,uuid[],uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_generate_referral_commissions(integer,boolean,uuid[],uuid) IS
  'Generates pending commission transactions from attributed CONSULTANT referrals for a year. DRY RUN by default (writes nothing). Skips already-transacted learners and referrals with no resolvable rate. Faculty (payroll) and students (excluded) are out of scope.';
