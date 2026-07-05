-- ============================================================================
-- Schools Network — leadership scoreboard
-- 2026-07-05
--
-- A single-call momentum board for directors/admins: are we GAINING or LOSING
-- students from feeder schools this admission cycle vs the prior one, and which
-- individual schools moved the most.
--
-- fn_schools_network_scoreboard(p_cycle_year) RETURNS one json object:
--   { cycle_year, prior_cycle_year, total_current, total_prior, total_delta,
--     adopted_count, feeder_count, gainers:[{school_name,current,prior,delta}],
--     losers:[...] }
--
-- RECONCILIATION INVARIANT — this fn mirrors fn_schools_network_feeders v3.6
-- (migration 20260705080000) exactly so its numbers agree with the feeder panel
-- the user already sees:
--   • canonical key  — IDENTICAL CASE expression (KEEP IN SYNC across all fns).
--   • alias resolve  — LEFT JOIN schools_network_feeder_aliases, GROUP BY the
--                      resolved key, so merged spellings combine here too.
--   • cycle detect   — IDENTICAL v_cycle / v_prior derivation.
--   • feeder universe— the same merged (enrolled ∪ marketing) default-combined
--                      view (no level filter), so feeder_count == the panel's
--                      unfiltered total_count and adopted_count uses the SAME
--                      adopt-match LATERAL.
-- Momentum numbers (current/prior/delta) come only from ENROLLED learners —
-- marketing leads carry no admission year, so they contribute 0 to a cycle and
-- never appear as a gainer/loser.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_schools_network_scoreboard(
  p_cycle_year integer DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '20000'   -- cap the full-universe adopt-match scan (mirrors dupe fn)
AS $$
DECLARE
  v_cycle  int;
  v_prior  int;
  v_result json;
BEGIN
  -- Same permission gate as the feeder panel: view-holders (or admins) only.
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('schools_network.schools.view')) THEN
    RAISE EXCEPTION 'permission denied for schools_network.schools.view'
      USING ERRCODE = '42501';
  END IF;

  -- INTENTIONALLY ORG-WIDE — and this is VERIFIED against precedent, not just an
  -- assertion: the already-live fn_schools_network_feeders (PR #1780) uses the
  -- IDENTICAL gate (is_super_admin()/is_admin()/schools_network.schools.view) and
  -- carries its own explicit "do NOT add an institution filter" comment. Roles
  -- that hold schools.view include scope='own' roles (principal, faculty,
  -- outreach_coordinator, program_lead) — they ALREADY see org-wide feeder data
  -- via that panel. This RPC exposes only school NAMES + COUNTS (NO learner PII),
  -- so a scoped viewer seeing org-wide momentum is the deliberate Director ruling,
  -- not a leak. Adding an institution filter here would fork the board per viewer
  -- and break reconciliation with the (org-wide) feeder panel. If schools.view is
  -- ever re-scoped to be per-institution PII-bearing, revisit this fn too.

  -- ─── Cycle detection — IDENTICAL to fn_schools_network_feeders v3.6 ────────
  v_cycle := COALESCE(
    (SELECT max(ay.year) FROM public.admission_years ay
      WHERE ay.year = p_cycle_year AND ay.year BETWEEN 2000 AND EXTRACT(YEAR FROM now())::int + 1
        AND EXISTS (SELECT 1 FROM public.learners_profiles lp2 WHERE lp2.admission_year_id = ay.id)),
    (SELECT max(ay.year) FROM public.admission_years ay
      WHERE ay.year BETWEEN 2000 AND EXTRACT(YEAR FROM now())::int + 1
        AND EXISTS (SELECT 1 FROM public.learners_profiles lp2 WHERE lp2.admission_year_id = ay.id)));

  v_prior := (SELECT max(ay.year) FROM public.admission_years ay
     WHERE ay.year < v_cycle AND ay.year >= 2000
       AND EXISTS (SELECT 1 FROM public.learners_profiles lp2 WHERE lp2.admission_year_id = ay.id));

  WITH learner_src AS (
    -- enrolled feeders: canonical key + dominant spelling + current/prior cohort
    SELECT COALESCE(al.to_key, base.raw_key) AS name_norm,
           mode() WITHIN GROUP (ORDER BY base.raw_disp) AS name_disp,
           count(*)                                   AS enrolled_n,
           count(*) FILTER (WHERE base.yr = v_cycle)  AS cur_n,
           count(*) FILTER (WHERE base.yr = v_prior)  AS pri_n
      FROM (
        SELECT (CASE WHEN lp.last_school ~ '[^[:ascii:]]'
                  THEN regexp_replace(trim(lower(lp.last_school)), '\s+', ' ', 'g')
                  ELSE COALESCE(
                    NULLIF(regexp_replace(lower(lp.last_school), '[^a-z0-9]', '', 'g'), ''),
                    regexp_replace(trim(lower(lp.last_school)), '\s+', ' ', 'g'))
                END) AS raw_key,
               trim(lp.last_school) AS raw_disp,
               ay.year AS yr
          FROM public.learners_profiles lp
          LEFT JOIN public.admission_years ay ON ay.id = lp.admission_year_id
         WHERE lp.last_school IS NOT NULL
           AND length(trim(lp.last_school)) >= 6
           AND lower(lp.last_school) NOT LIKE '%unknown%'
           AND lower(trim(lp.last_school)) NOT IN ('nil','na','n/a','-','nothing')
      ) base
      LEFT JOIN public.schools_network_feeder_aliases al ON al.from_key = base.raw_key
     GROUP BY COALESCE(al.to_key, base.raw_key)
  ),
  marketing_src AS (
    -- prospect feeders (marketing leads) — no cycle data, so they only widen the
    -- feeder universe (feeder_count / adopted_count), never the momentum totals.
    SELECT COALESCE(al.to_key, base.raw_key) AS name_norm,
           mode() WITHIN GROUP (ORDER BY base.raw_disp) AS name_disp
      FROM (
        SELECT (CASE WHEN ml.school_name ~ '[^[:ascii:]]'
                  THEN regexp_replace(trim(lower(ml.school_name)), '\s+', ' ', 'g')
                  ELSE COALESCE(
                    NULLIF(regexp_replace(lower(ml.school_name), '[^a-z0-9]', '', 'g'), ''),
                    regexp_replace(trim(lower(ml.school_name)), '\s+', ' ', 'g'))
                END) AS raw_key,
               trim(ml.school_name) AS raw_disp
          FROM public.marketing_leads_database ml
         WHERE ml.school_name IS NOT NULL
           AND length(trim(ml.school_name)) >= 6
           AND lower(ml.school_name) NOT LIKE '%unknown%'
           AND lower(trim(ml.school_name)) NOT IN ('nil','na','n/a','-','nothing')
      ) base
      LEFT JOIN public.schools_network_feeder_aliases al ON al.from_key = base.raw_key
     GROUP BY COALESCE(al.to_key, base.raw_key)
  ),
  merged AS (
    SELECT coalesce(l.name_norm, m.name_norm) AS name_norm,
           coalesce(l.name_disp, m.name_disp) AS name_disp,
           coalesce(l.enrolled_n, 0)          AS enrolled_n,
           coalesce(l.cur_n, 0)               AS cur_n,
           coalesce(l.pri_n, 0)               AS pri_n
      FROM learner_src l
      FULL OUTER JOIN marketing_src m ON m.name_norm = l.name_norm
  ),
  joined AS (
    -- adopt-match LATERAL — IDENTICAL disambiguation logic to the feeder fn, so
    -- adopted_count agrees with the panel's per-row "In network" badge.
    SELECT mg.name_disp, mg.name_norm, mg.enrolled_n, mg.cur_n, mg.pri_n,
           adopt.id AS adopted_id
      FROM merged mg
      LEFT JOIN LATERAL (
        SELECT CASE
                 WHEN count(*) = 1 THEN (array_agg(s.id ORDER BY s.created_at))[1]
                 WHEN count(DISTINCT lower(s.district)) FILTER (WHERE s.district IS NOT NULL) <= 1
                  AND count(DISTINCT lower(s.state)) FILTER (WHERE s.state IS NOT NULL) <= 1
                  AND count(*) FILTER (WHERE s.district IS NOT NULL OR s.state IS NOT NULL) > 0
                   THEN (array_agg(s.id ORDER BY s.created_at))[1]
                 ELSE NULL
               END AS id
          FROM public.schools s
          LEFT JOIN public.schools_network_feeder_aliases sa
            ON sa.from_key = (CASE WHEN s.name ~ '[^[:ascii:]]'
                                THEN regexp_replace(trim(lower(s.name)), '\s+', ' ', 'g')
                                ELSE COALESCE(
                                  NULLIF(regexp_replace(lower(s.name), '[^a-z0-9]', '', 'g'), ''),
                                  regexp_replace(trim(lower(s.name)), '\s+', ' ', 'g'))
                              END)
         WHERE COALESCE(sa.to_key,
                 CASE WHEN s.name ~ '[^[:ascii:]]'
                   THEN regexp_replace(trim(lower(s.name)), '\s+', ' ', 'g')
                   ELSE COALESCE(
                     NULLIF(regexp_replace(lower(s.name), '[^a-z0-9]', '', 'g'), ''),
                     regexp_replace(trim(lower(s.name)), '\s+', ' ', 'g'))
                 END) = mg.name_norm
      ) adopt ON TRUE
  ),
  scored AS (
    -- per-school delta: NULL (not a mover) ONLY when there's no prior CYCLE at
    -- all (v_prior IS NULL) or the school had zero learners in BOTH compared
    -- years. Note the intended (not accidental) edge behavior:
    --   • prior=0, current>0  → a brand-new feeder this cycle; a real gainer,
    --     it DOES appear in gainers.
    --   • prior>0, current=0  → none enrolled yet in the still-filling cycle; it
    --     CAN appear as a loser. We do NOT hide these — a genuine drop to 0 is
    --     indistinguishable from mid-cycle lag, so hiding would lose real signal.
    -- The page's "so far" framing covers mid-cycle reads.
    SELECT name_disp, name_norm, enrolled_n, cur_n, pri_n, adopted_id,
           CASE WHEN v_prior IS NULL OR (cur_n + pri_n) = 0
                THEN NULL ELSE cur_n - pri_n END AS delta
      FROM joined
  )
  SELECT json_build_object(
    'cycle_year',       v_cycle,
    'prior_cycle_year', v_prior,
    'total_current',    COALESCE(sum(cur_n), 0),
    'total_prior',      COALESCE(sum(pri_n), 0),
    'total_delta',      COALESCE(sum(cur_n), 0) - COALESCE(sum(pri_n), 0),
    'adopted_count',    count(*) FILTER (WHERE adopted_id IS NOT NULL),
    'feeder_count',     count(*),
    'gainers', COALESCE((
      SELECT json_agg(g) FROM (
        SELECT name_disp AS school_name, cur_n AS "current", pri_n AS "prior", delta
          FROM scored
         WHERE delta > 0
         ORDER BY delta DESC, enrolled_n DESC, name_disp, name_norm
         LIMIT 10
      ) g), '[]'::json),
    'losers', COALESCE((
      SELECT json_agg(l) FROM (
        SELECT name_disp AS school_name, cur_n AS "current", pri_n AS "prior", delta
          FROM scored
         WHERE delta < 0
         ORDER BY delta ASC, enrolled_n DESC, name_disp, name_norm
         LIMIT 10
      ) l), '[]'::json)
  )
  INTO v_result
  FROM scored;

  RETURN v_result;
END;
$$;

-- MANDATORY anon lock (CLAUDE.md 2026-06-06): Supabase's default grants anon
-- EXECUTE on every new function, so an explicit REVOKE is required.
REVOKE EXECUTE ON FUNCTION public.fn_schools_network_scoreboard(integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_schools_network_scoreboard(integer) TO authenticated;
