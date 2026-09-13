-- 20261203093000_consultant_directory_enrolled_allow_list.sql
-- Added: 2026-09-13 — the agency directory's "enrolled" count stops overstating
-- the payable set, and its function comment stops claiming something untrue.
-- FILE ONLY / NOT APPLIED — the operator applies it at merge.
--
-- WHAT IS WRONG
-- -------------
-- 20261020010000_consultant_directory_by_admission_year.sql built fn_consultant_
-- directory's 'enrolled' count on IN ('active','admitted','reserved','graduated')
-- and its COMMENT asserts, in those words, "Uses the same enrolled allow-list as
-- fn_generate_referral_commissions". 20261203090000 removes 'reserved' from the
-- generator's allow-list (rule 15, Director, 2026-09-12). The moment that file is
-- applied the comment becomes false and the directory's 'enrolled' overstates the
-- payable population by every reserved learner — 17 of the 580 candidates
-- measured on 2026-09-12.
--
-- This is a DISPLAY count, not a money path: fn_consultant_directory is STABLE
-- and writes nothing. But it is the number the consultants screen offers as the
-- honest replacement for the stored conversion_rate column, and a number whose
-- own comment says it agrees with the payment gate has to actually agree with it.
--
-- WHAT THIS DOES
-- --------------
-- CREATE OR REPLACE with the allow-list aligned and the comment made true. The
-- body is otherwise the 20261020010000 definition unchanged. That is the ONLY
-- migration on jicate/main that touches this function, so it is the best
-- available statement of the live body — the Supabase MCP server is disconnected
-- in this session and no pooler credential is reachable from this machine, so
-- pg_get_functiondef() could not be used to confirm it. A reviewer with pooler
-- access should diff before apply.
--
-- SCREEN COUNTS CHANGE. /admission/consultants shows 'enrolled' per agency and a
-- total; both fall by the number of reserved learners in the selected year.
-- Nothing is paid, refunded or written differently — the payment run already
-- excludes them once 20261203090000 is applied.

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
             -- GATE 1 of fn_generate_referral_commissions, copied exactly.
             -- 'reserved' left OUT from 2026-09-12 (rule 15): a reserved seat is
             -- held, not joined, so it is not enrolled and cannot earn a
             -- referral. Keep this list in step with
             -- 20261203090000_referral_gates_hold_unmeasurable_and_drop_reserved.sql
             -- — a directory that counts people the generator refuses to pay is
             -- how an agency is told it is owed for somebody it is not.
             count(*) FILTER (WHERE lp.lifecycle_status::text
                              IN ('active','admitted','graduated')) AS enrolled
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
  'Agency directory with referral and enrolled counts computed LIVE per intake year (p_year NULL = all years), plus the list of years that carry referrals. Replaces education_consultants.total_leads_referred / conversion_rate for display: the first overstated by 213 and the second is 0 for every agency. ''enrolled'' uses GATE 1 of fn_generate_referral_commissions — active, admitted, graduated; ''reserved'' excluded from 2026-09-12 (rule 15) — so the directory and the payment run count the same population. STABLE, so it cannot write.';
