-- 20261104010000_referral_attribution_page_by_year.sql
-- Added: 2026-09-04 — /admission/consultants/referrals can be filtered by
-- admission year without silently losing 9% of the rows.
--
-- WHY THIS IS AN RPC AND NOT A POSTGREST FILTER
-- ---------------------------------------------
-- A referral's learner is reachable by TWO different paths, as the header of
-- consultant-service.ts already warns (BUG-003877 follow-up):
--     referral_source 'auto_sync_lead'    → admission_id set, learner via the LEAD
--     referral_source 'auto_sync_learner' → admission_id NULL, learner via the
--                                           attribution's own learner_profile_id
-- The admission year hangs off the learner, so it is reachable by both paths too.
--
-- Measured on production before writing this:
--     1,842 attributions
--     1,676 carry their own learner_profile_id
--       166 (9%) DO NOT and are reachable only through the lead
--         0 have neither
--
-- So a PostgREST embedded filter with `!inner` on either single path would drop
-- 166 real rows without a word — precisely the failure that comment exists to
-- prevent. COALESCE across both paths is only expressible in SQL, so the year
-- filter lives here.
--
-- WHAT IT RETURNS, AND WHY SO LITTLE
-- ----------------------------------
-- Just the ids for one page, plus the total. The caller then fetches those ids
-- with its EXISTING rich select, so every embed, the resolveReferralLearner
-- helper, the verification actions and the row rendering stay exactly as they
-- are. Only the year-aware paging moves into SQL. Twenty ids fit comfortably in
-- a query string; the 566 ids of a whole year would not.
--
-- Read-only and STABLE, so it cannot write.

CREATE OR REPLACE FUNCTION public.fn_referral_attribution_page(
  p_year             integer DEFAULT NULL,
  p_consultant_id    uuid    DEFAULT NULL,
  p_institution_id   uuid    DEFAULT NULL,
  p_attribution_type text    DEFAULT NULL,
  p_is_verified      boolean DEFAULT NULL,
  p_page             integer DEFAULT 1,
  p_limit            integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_ids jsonb; v_total integer; v_offset integer;
BEGIN
  -- SECURITY DEFINER bypasses RLS, so the gate is explicit.
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('admission.consultants.view')
          OR user_has_permission('admission.leads.view')) THEN
    RAISE EXCEPTION 'Not authorised to view referral attributions';
  END IF;

  v_offset := GREATEST(COALESCE(p_page, 1) - 1, 0) * GREATEST(COALESCE(p_limit, 20), 1);

  WITH resolved AS (
    SELECT a.id,
           a.created_at,
           -- The year, via whichever path this row actually has.
           ay.year AS admission_year
      FROM public.consultant_lead_attributions a
      LEFT JOIN public.admission_leads al ON al.id = a.admission_id
      LEFT JOIN public.learners_profiles lp
             ON lp.id = COALESCE(a.learner_profile_id, al.learner_profile_id)
      LEFT JOIN public.admission_years ay ON ay.id = lp.admission_year_id
     WHERE (p_year IS NULL OR ay.year = p_year)
       AND (p_consultant_id IS NULL OR a.consultant_id = p_consultant_id)
       AND (p_institution_id IS NULL OR a.institution_id = p_institution_id)
       AND (p_attribution_type IS NULL OR a.attribution_type::text = p_attribution_type)
       AND (p_is_verified IS NULL OR COALESCE(a.is_verified, false) = p_is_verified)
  )
  SELECT COALESCE(jsonb_agg(t.id ORDER BY t.created_at DESC), '[]'::jsonb),
         (SELECT count(*) FROM resolved)
    INTO v_ids, v_total
  FROM (
    SELECT id, created_at FROM resolved
     ORDER BY created_at DESC
     LIMIT GREATEST(COALESCE(p_limit, 20), 1) OFFSET v_offset
  ) t;

  RETURN jsonb_build_object(
    'ids',   COALESCE(v_ids, '[]'::jsonb),
    'total', COALESCE(v_total, 0),
    'page',  GREATEST(COALESCE(p_page, 1), 1),
    'limit', GREATEST(COALESCE(p_limit, 20), 1),
    -- Years that actually carry an attribution, newest first. Derived, so a new
    -- intake year appears the day its first referral lands.
    -- Attributions whose year cannot be resolved at all: 158 today, of which 157
    -- have NO learner behind either path and 1 has a learner with no intake year.
    -- They are reachable under "All admission years" but appear in no single-year
    -- view, so the count is returned rather than left as a silent shortfall — a
    -- year view that quietly omits 158 rows is indistinguishable from data loss.
    'unassigned', (
      SELECT count(*)
        FROM public.consultant_lead_attributions a2
        LEFT JOIN public.admission_leads al2 ON al2.id = a2.admission_id
        LEFT JOIN public.learners_profiles lp2
               ON lp2.id = COALESCE(a2.learner_profile_id, al2.learner_profile_id)
       WHERE lp2.admission_year_id IS NULL
    ),
    'years', COALESCE((
      SELECT jsonb_agg(y ORDER BY y DESC) FROM (
        SELECT DISTINCT ay.year AS y
          FROM public.consultant_lead_attributions a
          LEFT JOIN public.admission_leads al ON al.id = a.admission_id
          LEFT JOIN public.learners_profiles lp
                 ON lp.id = COALESCE(a.learner_profile_id, al.learner_profile_id)
          JOIN public.admission_years ay ON ay.id = lp.admission_year_id
      ) s), '[]'::jsonb)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_referral_attribution_page(integer, uuid, uuid, text, boolean, integer, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_referral_attribution_page(integer, uuid, uuid, text, boolean, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.fn_referral_attribution_page(integer, uuid, uuid, text, boolean, integer, integer) IS
  'One page of referral-attribution ids filtered by admission year, resolving the learner through BOTH paths (own learner_profile_id, or via the lead) because 166 of 1,842 rows have only the lead path and an embedded !inner filter would drop them. Returns ids + total + the years that carry attributions. STABLE, so it cannot write.';
