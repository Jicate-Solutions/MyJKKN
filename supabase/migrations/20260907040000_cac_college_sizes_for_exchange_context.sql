-- ============================================================================
-- 2026-09-07 · College sizes, so an exchange imbalance reads as context
--
-- APPLIED TO PRODUCTION 2026-08-14 and ledger-recorded as 20260907040000.
-- This file is the record of that change, not a pending instruction.
--
-- WHY THIS EXISTS. The council decided that give/receive must be shown with the
-- size of each college alongside it. Without size, the cluster's single largest
-- collaboration figure reads as an accusation: one college receives 93% of all
-- cross-campus teaching, which looks like a college that cannot staff itself.
-- With size it reads as what it is — the smallest teaching college in the
-- cluster being covered by two larger siblings, which is the behaviour a cluster
-- exists to produce.
--
-- WHY A DEFINER FUNCTION AND NOT A CLIENT-SIDE COUNT. Counting
-- `learners_profiles` from the browser returns the VIEWER'S slice, not the
-- cluster. That precise bug was fixed here on 2026-08-01: a council member
-- scoped to one college was shown 0 cross-campus bookings while the cluster held
-- 78, and every absence on the page became unreadable. Sizes must arrive by the
-- same definer route as every other figure in that section, or the page goes
-- back to meaning two different things depending on who is looking.
--
-- THE GUARD. Identical to fn_cac_cluster_totals(), including COALESCE on BOTH
-- predicates. This is not defensive padding: a guard helper returning NULL makes
-- the whole condition NULL, `NOT NULL` is NULL, the IF never fires, and the
-- function hands the cluster to an unauthorised caller. Leaving either predicate
-- bare is the failure.
--
-- REFUSAL IS EXPLICIT. An unauthorised caller gets 42501 with a message naming
-- what was refused, never an empty array — an empty array is indistinguishable
-- from a cluster with no colleges in it.
--
-- SIZE MEANS ACTIVE LEARNERS. `lifecycle_status = 'active'`, which is 4,825 of
-- the 7,242 learner rows. Graduated and enquiry-stage rows are not the size of a
-- college today. Note this makes JKKN College of Education 0 — it has 40 learner
-- rows and none active — which is honest and is why the UI must render sizes
-- through the same no-bare-zero guard as everything else on the page.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_cac_college_sizes()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR COALESCE(public.user_has_permission('accreditation.cac.view'), false)
  ) THEN
    RAISE EXCEPTION 'Not authorised to read Cluster Academic Council college sizes'
      USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'iqac_code'), '[]'::jsonb) INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'institution_id', i.id,
      'institution_name', i.name,
      'iqac_code', i.iqac_code,
      'active_learners', count(lp.id) FILTER (WHERE lp.lifecycle_status::text = 'active')
    ) AS x
    FROM institutions i
    LEFT JOIN learners_profiles lp ON lp.institution_id = i.id
    WHERE i.iqac_code IS NOT NULL
    GROUP BY i.id, i.name, i.iqac_code
  ) s;

  RETURN v_result;
END;
$fn$;

-- Supabase's default ALTER DEFAULT PRIVILEGES grants EXECUTE on every new
-- function to `anon` directly, separately from PUBLIC. Revoking PUBLIC alone
-- leaves it callable by any unauthenticated client holding the anon key, which
-- is embedded in every page bundle.
REVOKE EXECUTE ON FUNCTION public.fn_cac_college_sizes() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cac_college_sizes() TO authenticated;
