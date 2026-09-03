-- 20260909062000_consultant_payout_readiness.sql
-- Added: 2026-08-17 — which agencies cannot be paid, and which of those matter.
--
-- WHY THIS EXISTS
-- ---------------
-- 129 of the 152 active agencies are missing a bank account number or a PAN, and
-- fn_generate_referral_commissions marks any such agency unpayable. That number has
-- been quoted as the job to do. Read against the referral data it is the wrong job:
--
--   129 blocked agencies
--    ├─ 113 have ZERO 2026-27 referrals — nobody is owed them anything, and
--    │      collecting a PAN from them buys nothing
--    └─  16 are holding up 36 real referrals
--
-- So this RPC does not return "the 129". It returns every agency with the count of
-- referrals riding on it, ordered by that count, so the desk phones the sixteen that
-- matter first and never has to guess which of a 129-row list is worth an afternoon.
--
-- IFSC is reported even though the generator does not test it: the generator only
-- decides whether a commission ROW may exist, while an actual bank transfer needs the
-- IFSC too. Today no agency has a bank account without an IFSC, so this is a guard
-- against a future gap rather than a live one — it costs one column to keep honest.
--
-- Read-only and STABLE, so it cannot write. Filling the missing details happens on
-- the agency's own edit screen, which already owns that form and its permissions.

CREATE OR REPLACE FUNCTION public.fn_consultant_payout_readiness(p_year integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_rows jsonb;
BEGIN
  -- SECURITY DEFINER bypasses RLS, so the gate is explicit. Same permission as the
  -- rest of the commission machinery this screen serves.
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('admission.consultants.commissions.view')) THEN
    RAISE EXCEPTION 'Not authorised to view agency payout readiness';
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x_referrals DESC, x_name), '[]'::jsonb)
    INTO v_rows
  FROM (
    SELECT
      COALESCE(r.n, 0) AS x_referrals,
      ec.name          AS x_name,
      jsonb_build_object(
        'consultant_id',  ec.id,
        'name',           ec.name,
        'contact_person', NULLIF(btrim(ec.contact_person), ''),
        'email',          NULLIF(btrim(ec.email), ''),
        'phone',          NULLIF(btrim(ec.phone), ''),
        -- Referrals for the year counted the SAME way the generator counts
        -- candidates, so this screen and the payment run cannot disagree.
        'referrals',      COALESCE(r.n, 0),
        'missing',        (
          CASE WHEN NULLIF(btrim(ec.bank_account_number), '') IS NULL
               THEN jsonb_build_array('Bank account') ELSE '[]'::jsonb END
          || CASE WHEN NULLIF(btrim(ec.pan_number), '') IS NULL
               THEN jsonb_build_array('PAN') ELSE '[]'::jsonb END
          || CASE WHEN NULLIF(btrim(ec.bank_ifsc), '') IS NULL
               THEN jsonb_build_array('IFSC') ELSE '[]'::jsonb END
        ),
        -- The generator's own test, reproduced exactly: bank account AND PAN.
        -- IFSC is reported but does not decide this flag, because it does not
        -- decide the generator's either.
        'generator_ready',
          (NULLIF(btrim(ec.bank_account_number), '') IS NOT NULL
           AND NULLIF(btrim(ec.pan_number), '') IS NOT NULL)
      ) AS x
    FROM public.education_consultants ec
    LEFT JOIN (
      SELECT lp.referred_by_id AS cid, count(*) AS n
        FROM public.learners_profiles lp
        JOIN public.admission_years ay ON ay.id = lp.admission_year_id AND ay.year = p_year
       WHERE lp.referral_type = 'consultant'
         AND lp.referred_by_id IS NOT NULL
         AND lp.program_id IS NOT NULL
       GROUP BY 1
    ) r ON r.cid = ec.id
    WHERE ec.status = 'active'
  ) s;

  RETURN jsonb_build_object(
    'academic_year', p_year,
    'generated_at',  now(),
    'agencies',      v_rows,
    -- The headline the screen leads with. blocked_idle is called out separately
    -- because it is the difference between a 16-agency phone list and a 129-row
    -- data-cleanup project that would move no money.
    'summary', jsonb_build_object(
      'total',                  jsonb_array_length(v_rows),
      'ready',                  (SELECT count(*) FROM jsonb_array_elements(v_rows) e
                                  WHERE (e->>'generator_ready')::boolean),
      'blocked',                (SELECT count(*) FROM jsonb_array_elements(v_rows) e
                                  WHERE NOT (e->>'generator_ready')::boolean),
      'blocked_with_referrals', (SELECT count(*) FROM jsonb_array_elements(v_rows) e
                                  WHERE NOT (e->>'generator_ready')::boolean
                                    AND (e->>'referrals')::int > 0),
      'blocked_idle',           (SELECT count(*) FROM jsonb_array_elements(v_rows) e
                                  WHERE NOT (e->>'generator_ready')::boolean
                                    AND (e->>'referrals')::int = 0),
      'referrals_stuck',        (SELECT COALESCE(sum((e->>'referrals')::int), 0)
                                   FROM jsonb_array_elements(v_rows) e
                                  WHERE NOT (e->>'generator_ready')::boolean)
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_consultant_payout_readiness(integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_consultant_payout_readiness(integer) TO authenticated;

COMMENT ON FUNCTION public.fn_consultant_payout_readiness(integer) IS
  'Every active agency with the referrals riding on it and the payout details it is missing, ordered by referrals so the chase starts where the money is stuck. Reproduces fn_generate_referral_commissions'' payable test exactly (bank account AND PAN). STABLE, so it cannot write. Gated on admission.consultants.commissions.view or admin.';
