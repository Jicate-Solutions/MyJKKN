-- Schools Network: feeder momentum — the measured re-rank that closes the loop
-- ============================================================================
-- Moat-loop gap-closer (2026-07-03). The v2 feeders RPC ranked by ALL-TIME
-- enrolled volume — a popularity list. Nothing measured per-cycle enrollment
-- change, so adopt→invest actions never fed back into the rank (moat-loop
-- audit verdict: NO LOOP — parts 4 and 5 absent). v3 adds the measure and the
-- feed-forward:
--
--   • Per-school admission-cycle yield from learners_profiles.admission_year_id
--     (current cycle vs prior cycle; SAME estimator on both ends — count of
--     cohort-attributed learners whose normalized last_school matches).
--   • cycle_delta = current − prior  (the measured outcome).
--   • cohort_known = learners falling in the two compared cycles (cur+pri)
--     — the delta's actual sample size. Cohort-undated learners (2,190 of
--     6,583) are EXCLUDED — created_at is the digitization date, not the
--     admission date (1,756 learner rows admitted 2025 were created 2026),
--     so it is NOT a valid fallback cohort.
--   • KNOWN SEMANTICS: the current cycle is PARTIAL until admissions close,
--     so early-cycle deltas trend negative and the priority rank approaches
--     prior-cycle-volume order (protect the biggest recent pipelines). This
--     is labeled in the UI ("so far"); a same-day-of-cycle comparison is
--     impossible without per-learner admission dates, which the schema does
--     not carry.
--   • Investment context (sessions/contributions) is deliberately NOT
--     exposed here: their RLS is ownership-scoped (sessions.view AND
--     user_owns_school), so an org-wide aggregate would widen the exposure
--     envelope beyond the recorded Director ruling. Invest→outcome
--     juxtaposition lives on the school detail page under its own gates.
--   • p_sort='priority' → visit-list rank: biggest cycle DROP first
--     (cycle_delta ASC), all-time volume as tiebreak. 'volume' → legacy
--     all-time rank. DB default stays 'volume' so the old deployed route
--     keeps its exact behavior during the migration→deploy window; the API
--     route defaults to 'priority' so the shipped panel IS the re-ranked
--     visit list.
--   • p_cycle_year overrides the active cycle (default: newest plausible
--     admission year that actually has learners — guards against typo years
--     like 2002 and pre-created empty future years zeroing every delta).
--
-- RETURN TYPE CHANGES → DROP + CREATE (CREATE OR REPLACE cannot change OUT
-- columns). The anon/PUBLIC revoke and the Director-ruling COMMENT are
-- re-applied below — a bare DROP silently erases both.

DROP FUNCTION IF EXISTS public.fn_schools_network_feeders(text, text, text, int, int);
DROP FUNCTION IF EXISTS public.fn_schools_network_feeders(text, text, text, int, int, text, int);

CREATE FUNCTION public.fn_schools_network_feeders(
  p_search text DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_adopted text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_sort text DEFAULT 'volume',
  p_cycle_year int DEFAULT NULL
)
RETURNS TABLE(
  school_name text,
  enrolled_count bigint,
  leads_count bigint,
  sources text[],
  adopted_school_id uuid,
  total_count bigint,
  cycle_year int,
  prior_cycle_year int,
  current_cycle_enrolled bigint,
  prior_cycle_enrolled bigint,
  cycle_delta bigint,
  cohort_known bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text;
  v_sort text;
  v_cycle int;
  v_prior int;
BEGIN
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('schools_network.schools.view')) THEN
    RAISE EXCEPTION 'permission denied for schools_network.schools.view'
      USING ERRCODE = '42501';
  END IF;

  v_sort := CASE WHEN p_sort IN ('priority', 'volume') THEN p_sort ELSE 'volume' END;

  -- Active admission cycle = newest plausible admission year that has
  -- learners. Bounded so garbage years (2002 exists in prod) and empty
  -- future years cannot shift the cycle. A caller-supplied p_cycle_year is
  -- accepted only if it passes the SAME plausibility + has-learners guard —
  -- otherwise it falls back to the derived cycle (prevents a crafted value
  -- like 3000 zeroing every delta in that caller's response).
  v_cycle := COALESCE(
    (SELECT max(ay.year)
       FROM public.admission_years ay
      WHERE ay.year = p_cycle_year
        AND ay.year BETWEEN 2000 AND EXTRACT(YEAR FROM now())::int + 1
        AND EXISTS (SELECT 1 FROM public.learners_profiles lp2
                     WHERE lp2.admission_year_id = ay.id)),
    (SELECT max(ay.year)
       FROM public.admission_years ay
      WHERE ay.year BETWEEN 2000 AND EXTRACT(YEAR FROM now())::int + 1
        AND EXISTS (SELECT 1 FROM public.learners_profiles lp2
                     WHERE lp2.admission_year_id = ay.id))
  );

  -- Prior cycle = the next-lower admission year that actually has learners
  -- (NOT literally v_cycle-1: a gap/skipped year would force prior=0 and
  -- inflate every delta).
  v_prior := (
    SELECT max(ay.year)
      FROM public.admission_years ay
     WHERE ay.year < v_cycle
       AND ay.year >= 2000
       AND EXISTS (SELECT 1 FROM public.learners_profiles lp2
                    WHERE lp2.admission_year_id = ay.id)
  );

  -- Escape LIKE metacharacters so a user's % / _ search chars match
  -- literally, and collapse internal whitespace with the SAME normalization
  -- applied to name_norm — otherwise a double-spaced search never matches.
  v_search := CASE WHEN p_search IS NULL OR trim(p_search) = '' THEN NULL
              ELSE replace(replace(replace(
                     regexp_replace(trim(lower(p_search)), '\s+', ' ', 'g'),
                     '\', '\\'), '%', '\%'), '_', '\_') END;

  RETURN QUERY
  WITH learner_src AS (
    SELECT regexp_replace(trim(lower(lp.last_school)), '\s+', ' ', 'g') AS name_norm,
           mode() WITHIN GROUP (ORDER BY trim(lp.last_school)) AS name_disp,
           count(*) AS n,
           count(*) FILTER (WHERE ay.year = v_cycle) AS cur_n,
           count(*) FILTER (WHERE ay.year = v_prior) AS pri_n
      FROM public.learners_profiles lp
      LEFT JOIN public.admission_years ay ON ay.id = lp.admission_year_id
     WHERE lp.last_school IS NOT NULL
       AND length(trim(lp.last_school)) >= 6
       AND lower(lp.last_school) NOT LIKE '%unknown%'
       AND lower(trim(lp.last_school)) NOT IN ('nil','na','n/a','-','nothing')
     GROUP BY 1
  ),
  marketing_src AS (
    SELECT regexp_replace(trim(lower(ml.school_name)), '\s+', ' ', 'g') AS name_norm,
           mode() WITHIN GROUP (ORDER BY trim(ml.school_name)) AS name_disp,
           count(*) AS n
      FROM public.marketing_leads_database ml
     WHERE ml.school_name IS NOT NULL
       AND length(trim(ml.school_name)) >= 6
       AND lower(ml.school_name) NOT LIKE '%unknown%'
       AND lower(trim(ml.school_name)) NOT IN ('nil','na','n/a','-','nothing')
     GROUP BY 1
  ),
  merged AS (
    SELECT coalesce(l.name_norm, m.name_norm) AS name_norm,
           coalesce(l.name_disp, m.name_disp) AS name_disp,
           coalesce(l.n, 0) AS enrolled_n,
           coalesce(m.n, 0) AS leads_n,
           coalesce(l.cur_n, 0) AS cur_n,
           coalesce(l.pri_n, 0) AS pri_n,
           array_remove(ARRAY[
             CASE WHEN l.name_norm IS NOT NULL THEN 'enrolled_learners' END,
             CASE WHEN m.name_norm IS NOT NULL THEN 'marketing_leads' END
           ], NULL) AS srcs
      FROM learner_src l
      FULL OUTER JOIN marketing_src m ON m.name_norm = l.name_norm
  ),
  joined AS (
    SELECT mg.name_disp,
           mg.name_norm,
           mg.enrolled_n,
           mg.leads_n,
           mg.cur_n,
           mg.pri_n,
           mg.srcs,
           adopt.id AS adopted_id
      FROM merged mg
      LEFT JOIN LATERAL (
        SELECT s.id
          FROM public.schools s
         WHERE regexp_replace(trim(lower(s.name)), '\s+', ' ', 'g') = mg.name_norm
         ORDER BY s.created_at
         LIMIT 1
      ) adopt ON TRUE
     WHERE (v_search IS NULL OR mg.name_norm LIKE '%' || v_search || '%' ESCAPE '\')
       AND (p_source IS NULL OR p_source = ANY(mg.srcs))
       AND (p_adopted IS NULL
            OR (p_adopted = 'adopted' AND adopt.id IS NOT NULL)
            OR (p_adopted = 'not_adopted' AND adopt.id IS NULL))
  )
  SELECT j.name_disp,
         j.enrolled_n,
         j.leads_n,
         j.srcs,
         j.adopted_id,
         count(*) OVER () AS total_count,
         v_cycle,
         v_prior,
         j.cur_n,
         j.pri_n,
         -- No sample ⇒ no measurement: delta is NULL (not a fake 0) when no
         -- prior cohort year exists (v_prior NULL — single-cohort data or an
         -- early p_cycle_year override) or the school has zero learners in
         -- the two compared cycles. NULL deltas sort AFTER every measured
         -- row under 'priority', so no-signal schools can't masquerade as
         -- measured-flat on the visit list.
         CASE WHEN v_prior IS NULL OR (j.cur_n + j.pri_n) = 0 THEN NULL
              ELSE j.cur_n - j.pri_n END AS cycle_delta,
         j.cur_n + j.pri_n
    FROM joined j
   ORDER BY
     CASE WHEN v_sort = 'priority'
          THEN CASE WHEN v_prior IS NULL OR (j.cur_n + j.pri_n) = 0 THEN NULL
                    ELSE j.cur_n - j.pri_n END
     END ASC NULLS LAST,
     j.enrolled_n DESC, j.leads_n DESC, j.name_disp
   LIMIT greatest(1, least(p_limit, 200))
  OFFSET greatest(0, p_offset);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_schools_network_feeders(text, text, text, int, int, text, int) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_schools_network_feeders(text, text, text, int, int, text, int) TO authenticated;

-- Carry the Director ruling forward VERBATIM (DROP erased it), then append
-- the v3 provenance line.
COMMENT ON FUNCTION public.fn_schools_network_feeders(text, text, text, int, int, text, int) IS
'ORG-WIDE BY DIRECTOR RULING (2026-07-03): intentionally reads across all
institutions despite per-tenant RLS on learners_profiles /
marketing_leads_database. Feeder schools are shared upstream entities serving
every JKKN college; exposure is aggregate school names + counts only (no
learner rows, no PII). Access bounded by schools_network.schools.view.
Deep-review cross-tenant finding acknowledged and accepted by the data owner
— do not "fix" without a new Director decision.
v3 (2026-07-03): adds per-admission-cycle yield columns + p_sort=priority
visit-list ranking (moat-loop feed-forward). Cohort-undated learners are
excluded from cycle_delta; cohort_known = learners in the two compared
cycles (the delta sample). Current cycle is partial until admissions close —
early-cycle deltas trend negative by construction (labeled in the UI).
Prior cycle = next-lower year with learners (gap-year safe); p_cycle_year
is clamped to plausible years with learners. cycle_delta is NULL when
unmeasurable (no prior cohort year, or zero sampled learners) and NULL
deltas rank after measured rows under priority sort. Exposure surface
unchanged from the ruling above:
school names + learner/lead counts only — session/contribution aggregates
were deliberately kept OUT (their RLS is ownership-scoped).';
