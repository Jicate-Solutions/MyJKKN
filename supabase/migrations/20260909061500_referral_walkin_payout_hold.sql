-- 20260909061500_referral_walkin_payout_hold.sql
-- Added: 2026-08-17 — the Director's hold on walk-in agency credits, enforced.
--
-- WHY THIS EXISTS
-- ---------------
-- 304 of the 2026-27 agency credits sit on enquiries recorded as walk-ins. The
-- Director ruled they stay out of the payment run until someone confirms each one
-- is genuine: "no money leaves on a credit nobody verified."
--
-- That ruling had no enforcement point. fn_generate_referral_commissions selects
-- candidates from learners_profiles alone — it never joins consultant_lead_attributions
-- and never reads is_verified or the enquiry source. So the day a rate is set, all
-- 304 would have generated alongside everything else, silently. The review screen
-- listed them; nothing stopped them.
--
-- WHY A NEW COLUMN RATHER THAN is_verified
-- ----------------------------------------
-- 279 of the 304 already carry is_verified = true, set by Mr. Dhuraimurugan G across
-- six sessions between 29 May and 21 Jul, plus one by the Joint Managing Director.
-- The Director ruled that all 304 are re-checked under the new regime, so those flags
-- must not release money — but overwriting them would erase a real person's name and
-- dates from the audit trail of a money path. Two columns, two questions:
--   is_verified        — did someone look at this credit?      (answered, May-Jul)
--   payout_cleared_at  — is it released for payment?           (unanswered, all 304)
-- Nothing here pays anyone. Clearing a credit only makes it eligible for a future
-- generate run, which is itself admin-gated, and payout is further steps beyond that.
--
-- SCOPE CHECK (verified against production before writing this):
--   Every walk-in-credited attribution in the system belongs to intake year 2026 —
--   2025-26 has zero. So the year-agnostic hold below cannot freeze the 271 Engineering
--   credits that were settled and loaded on 10 Aug.

-- ---------------------------------------------------------------------------
-- 1. The clearance columns.
-- ---------------------------------------------------------------------------

ALTER TABLE public.consultant_lead_attributions
  ADD COLUMN IF NOT EXISTS payout_cleared_at   timestamptz,
  ADD COLUMN IF NOT EXISTS payout_cleared_by   uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS payout_cleared_note text;

COMMENT ON COLUMN public.consultant_lead_attributions.payout_cleared_at IS
  'Set when a human confirms this credit is genuine and releases it into the payment run (Director ruling, 2026-08-17). NULL = held. Distinct from is_verified, which records only that someone looked.';
COMMENT ON COLUMN public.consultant_lead_attributions.payout_cleared_by IS
  'Who released this credit for payment. Never back-filled — a NULL here with a non-NULL payout_cleared_at would mean the release has no owner.';
COMMENT ON COLUMN public.consultant_lead_attributions.payout_cleared_note IS
  'What the checker confirmed, in their own words. Free text, optional.';

-- Held-row lookup runs once per candidate inside the generator's NOT EXISTS.
CREATE INDEX IF NOT EXISTS idx_cla_payout_held
  ON public.consultant_lead_attributions (admission_id)
  WHERE payout_cleared_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. The generator honours the hold.
-- ---------------------------------------------------------------------------
-- Held rows are still COUNTED and still reported, so a dry run shows the Director
-- exactly what is frozen and what it is worth. They are simply never inserted.

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
  -- SECURITY DEFINER bypasses RLS, so gate explicitly. A dry run computes only, but
  -- a real run writes money rows — both require an admission-edit admin.
  IF NOT (is_super_admin() OR is_admin()) THEN
    RAISE EXCEPTION 'Not authorised to generate referral commissions';
  END IF;

  -- Re-callable within a single transaction: ON COMMIT DROP only fires at COMMIT, so a
  -- second call in the same txn would otherwise collide on the existing _gen relation.
  DROP TABLE IF EXISTS _gen;

  -- candidate rows: CONSULTANT referrals for the year that resolve to an active agency,
  -- have a programme, are NOT already transacted, and have a resolvable rate.
  --
  -- held_walkin marks a candidate whose enquiry was recorded as a walk-in and whose
  -- credit nobody has released yet. It is computed, not filtered, so the preview can
  -- report the frozen population instead of hiding it.
  CREATE TEMP TABLE _gen ON COMMIT DROP AS
  SELECT lp.id AS learner_profile_id, lp.institution_id, lp.program_id,
         ec.id AS consultant_id, ec.name AS consultant_name,
         (nullif(ec.bank_account_number,'') IS NOT NULL AND nullif(ec.pan_number,'') IS NOT NULL) AS payable,
         r.flat_amount AS gross,
         round(r.flat_amount * r.tds_percent/100.0, 2) AS tds,
         r.flat_amount - round(r.flat_amount * r.tds_percent/100.0, 2) AS net,
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
    -- Insert row-by-row, NOT as a set. The shared trigger_set_transaction_number
    -- derives the next number as MAX(existing)+1 per institution; in a single bulk
    -- INSERT every row sees the same pre-statement snapshot and collides on
    -- TXN-000001. Separate statements let each row see the prior ones. (The trigger
    -- also has a concurrency race under parallel writers — pre-existing, out of scope;
    -- generation is a single admin-run operation.)
    DECLARE rec record;
    BEGIN
      -- The hold lives here: a held credit is never written, on a dry run or a real one.
      FOR rec IN SELECT * FROM _gen WHERE NOT held_walkin LOOP
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

  -- 'candidates' stays the total found, so the number never shrinks silently.
  -- Everything describing money that would MOVE is scoped to the eligible set;
  -- the held population is reported separately and with its own value.
  SELECT jsonb_build_object(
    'dry_run', p_dry_run,
    'academic_year', p_year,
    'candidates', (SELECT count(*) FROM _gen),
    'held_walkin', (SELECT count(*) FROM _gen WHERE held_walkin),
    'held_gross', COALESCE((SELECT sum(gross) FROM _gen WHERE held_walkin),0),
    'eligible', (SELECT count(*) FROM _gen WHERE NOT held_walkin),
    'payable_now', (SELECT count(*) FROM _gen WHERE NOT held_walkin AND payable),
    'blocked_no_bank', (SELECT count(*) FROM _gen WHERE NOT held_walkin AND NOT payable),
    'total_gross', COALESCE((SELECT sum(gross) FROM _gen WHERE NOT held_walkin),0),
    'total_tds',   COALESCE((SELECT sum(tds)   FROM _gen WHERE NOT held_walkin),0),
    'total_net',   COALESCE((SELECT sum(net)   FROM _gen WHERE NOT held_walkin),0),
    'rows_written', v_inserted,
    'by_agency', COALESCE((SELECT jsonb_agg(x ORDER BY (x->>'net')::numeric DESC) FROM (
        SELECT jsonb_build_object('agency',consultant_name,
               'referrals',count(*) FILTER (WHERE NOT held_walkin),
               'held',count(*) FILTER (WHERE held_walkin),
               'net',COALESCE(sum(net) FILTER (WHERE NOT held_walkin),0),
               'payable',bool_and(payable)) x
          FROM _gen GROUP BY consultant_name, consultant_id) s),'[]'::jsonb)
  ) INTO v_summary;

  RETURN v_summary;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_generate_referral_commissions(integer, boolean, uuid[], uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_generate_referral_commissions(integer, boolean, uuid[], uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_generate_referral_commissions(integer, boolean, uuid[], uuid) IS
  'Turns attributed consultant referrals into pending commission rows. Honours the walk-in payout hold: a candidate whose enquiry was recorded as a walk-in and whose credit has no payout_cleared_at is counted and reported but never written. Admin-gated.';

-- ---------------------------------------------------------------------------
-- 3. Releasing one credit.
-- ---------------------------------------------------------------------------
-- Gated on admission.leads.edit rather than admin-only: the Director asked for 304
-- credits to be confirmed one at a time, and the enquiry desk that owns this data is
-- who does that work. The clearance itself moves no money — generation and payout are
-- separately gated behind admin.

CREATE OR REPLACE FUNCTION public.fn_clear_walkin_credit_for_payout(
  p_attribution_id uuid,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_row public.consultant_lead_attributions%ROWTYPE; v_actor uuid := auth.uid();
BEGIN
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('admission.leads.edit')) THEN
    RAISE EXCEPTION 'Not authorised to release referral credits for payment';
  END IF;

  SELECT * INTO v_row FROM public.consultant_lead_attributions WHERE id = p_attribution_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- Write-once, like fn_link_referral_referrer: releasing an already-released credit
  -- must not quietly re-stamp who owns the decision.
  IF v_row.payout_cleared_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_cleared',
                              'cleared_at', v_row.payout_cleared_at);
  END IF;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'A release must have a named owner; no authenticated user on this call';
  END IF;

  UPDATE public.consultant_lead_attributions
     SET payout_cleared_at   = now(),
         payout_cleared_by   = v_actor,
         payout_cleared_note = NULLIF(btrim(p_note), '')
   WHERE id = p_attribution_id;

  RETURN jsonb_build_object('ok', true, 'attribution_id', p_attribution_id, 'cleared_at', now());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_clear_walkin_credit_for_payout(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_clear_walkin_credit_for_payout(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.fn_clear_walkin_credit_for_payout(uuid, text) IS
  'Releases ONE walk-in agency credit into the payment run after a human confirms it is genuine (Director ruling, 2026-08-17). Write-once: a second call returns already_cleared rather than re-stamping the owner. Moves no money by itself.';
