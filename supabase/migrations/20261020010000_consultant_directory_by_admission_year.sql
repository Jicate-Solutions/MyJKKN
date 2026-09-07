-- 20261020010000_consultant_directory_by_admission_year.sql
-- Added: 2026-09-03 — /admission/consultants can finally be read one intake year
-- at a time, and stops quoting two numbers that are not true.
--
-- WHAT WAS WRONG
-- --------------
-- The agency list rendered three stored columns on education_consultants —
-- total_leads_referred, conversion_rate, total_commission_paid — maintained by
-- triggers and carrying NO year dimension at all. There was nothing to filter by,
-- which is why the screen could not be shown per admission year: the numbers it
-- displays have never had a year attached to them. It even SORTS on
-- total_leads_referred, a lifetime column.
--
-- Measured on production before writing this:
--   * total_leads_referred sums to 1,839 across 186 agencies. The real number of
--     consultant referrals ever recorded is 1,626. The stored aggregate
--     overstates by 213 (13%) and nothing reconciles it.
--   * total_conversions is 0 for ALL 186 agencies, so conversion_rate — a
--     displayed column AND a sort key — is 0 for everyone. It is a dead column
--     presented as a metric.
--   * total_commission_earned / _paid are 0, which IS honest: the commission
--     pipeline has never generated a row.
--
-- Meanwhile the year-wise truth was always derivable and is clean:
--     2026: 566 referrals / 30 agencies      2023: 157 / 38
--     2025: 522 / 36                         2022:  41 / 30
--     2024: 319 / 40                         2021:  12 / 7 · 2020: 8 / 6
--
-- WHAT THIS DOES
-- --------------
-- One STABLE read RPC computing per-agency counts LIVE from learners_profiles,
-- scoped to an intake year (or all years when p_year IS NULL). The list,
-- analytics and referrals screens all read it, so they cannot disagree with each
-- other or drift from the data the way the stored columns did.
--
-- 'enrolled' replaces conversion_rate as the second number, because it is real:
-- it uses the SAME allow-list the payment gate uses (active / admitted /
-- reserved / graduated), so "converted" on this screen and "payable" in the
-- generator mean the same thing.
--
-- The stored columns are left in place and NOT dropped — other code may read
-- them and this change is about what the screen shows. They are simply no longer
-- the source of truth for this screen.

CREATE OR REPLACE FUNCTION public.fn_consultant_directory(
  p_year integer DEFAULT NULL,
  p_institution_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_rows jsonb; v_years jsonb;
BEGIN
  -- SECURITY DEFINER bypasses RLS, so gate explicitly. Same permission that
  -- opens the consultants module.
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('admission.consultants.view')) THEN
    RAISE EXCEPTION 'Not authorised to view the consultant directory';
  END IF;

  -- Every intake year that actually carries a consultant referral, newest first.
  -- Derived, never hardcoded: a new year appears here the day its first referral
  -- is recorded, with no code change.
  SELECT COALESCE(jsonb_agg(y ORDER BY y DESC), '[]'::jsonb)
    INTO v_years
  FROM (
    SELECT DISTINCT ay.year AS y
      FROM public.learners_profiles lp
      JOIN public.admission_years ay ON ay.id = lp.admission_year_id
     WHERE lp.referral_type = 'consultant' AND lp.referred_by_id IS NOT NULL
  ) s;

  SELECT COALESCE(jsonb_agg(x ORDER BY x_referrals DESC, x_name), '[]'::jsonb)
    INTO v_rows
  FROM (
    SELECT
      ec.name AS x_name,
      COALESCE(r.referrals, 0) AS x_referrals,
      jsonb_build_object(
        'consultant_id',  ec.id,
        'name',           ec.name,
        'consultant_type',ec.consultant_type,
        'status',         ec.status,
        'email',          NULLIF(btrim(ec.email), ''),
        'phone',          NULLIF(btrim(ec.phone), ''),
        'contact_person', NULLIF(btrim(ec.contact_person), ''),
        -- Live, year-scoped. Not the stored lifetime column.
        'referrals',      COALESCE(r.referrals, 0),
        -- Same allow-list the payment gate uses, so the two agree.
        'enrolled',       COALESCE(r.enrolled, 0),
        'payout_ready',   (NULLIF(btrim(ec.bank_account_number), '') IS NOT NULL
                           AND NULLIF(btrim(ec.pan_number), '') IS NOT NULL)
      ) AS x
    FROM public.education_consultants ec
    LEFT JOIN (
      SELECT lp.referred_by_id AS cid,
             count(*) AS referrals,
             count(*) FILTER (WHERE lp.lifecycle_status::text
                              IN ('active','admitted','reserved','graduated')) AS enrolled
        FROM public.learners_profiles lp
        JOIN public.admission_years ay ON ay.id = lp.admission_year_id
       WHERE lp.referral_type = 'consultant'
         AND lp.referred_by_id IS NOT NULL
         AND (p_year IS NULL OR ay.year = p_year)
         AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
       GROUP BY 1
    ) r ON r.cid = ec.id
  ) s;

  RETURN jsonb_build_object(
    'academic_year', p_year,          -- NULL = all years
    'generated_at',  now(),
    'years',         v_years,
    'agencies',      v_rows,
    'summary', jsonb_build_object(
      'agencies_total',    jsonb_array_length(v_rows),
      -- Agencies that actually sent someone in the selected year. The list shows
      -- every agency so a zero is visible, but THIS is the meaningful count.
      'agencies_active',   (SELECT count(*) FROM jsonb_array_elements(v_rows) e
                             WHERE (e->>'referrals')::int > 0),
      'referrals',         (SELECT COALESCE(sum((e->>'referrals')::int),0) FROM jsonb_array_elements(v_rows) e),
      'enrolled',          (SELECT COALESCE(sum((e->>'enrolled')::int),0) FROM jsonb_array_elements(v_rows) e),
      'payout_ready',      (SELECT count(*) FROM jsonb_array_elements(v_rows) e
                             WHERE (e->>'payout_ready')::boolean)
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_consultant_directory(integer, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_consultant_directory(integer, uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_consultant_directory(integer, uuid) IS
  'Agency directory with referral and enrolled counts computed LIVE per intake year (p_year NULL = all years), plus the list of years that carry referrals. Replaces education_consultants.total_leads_referred / conversion_rate for display: the first overstated by 213 and the second is 0 for every agency. Uses the same enrolled allow-list as fn_generate_referral_commissions. STABLE, so it cannot write.';
