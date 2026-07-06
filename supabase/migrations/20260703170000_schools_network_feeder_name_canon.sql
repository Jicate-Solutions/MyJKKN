-- Schools Network: feeder school-name canonicalization (v3.4)
-- ============================================================================
-- v3.3 deduped feeder names with whitespace collapse only
-- (regexp_replace(trim(lower(x)), '\s+', ' ', 'g')), which left punctuation
-- variants unmerged. Prod example — FOUR separate feeder rows for ONE school:
--   "JKK RANGAMMAL (G)HSS"                          (56 learners)
--   "J K K RANGAMMAL GHSS"                          (27)
--   "JKK RANGAMMAL GHSS"                            (22)
--   "J.K.K.RANGAMMAL GIRLS HIGHER SECONDARY SCHOOL" (5)
--
-- v3.4 makes ONE change: the canonical grouping key becomes lowercase with
-- ALL non-alphanumeric characters stripped:
--
--   regexp_replace(lower(x), '[^a-z0-9]', '', 'g')
--
-- so "JKK RANGAMMAL (G)HSS", "J K K RANGAMMAL GHSS" and
-- "j.k.k. rangammal ghss" all group under "jkkrangammalghss".
--
--   • Display name stays mode() WITHIN GROUP (ORDER BY trim(raw)) — the most
--     common raw spelling (original casing) represents the merged group.
--   • The adopted-school LATERAL join on schools.name uses the SAME key, so
--     an adoption recorded under any punctuation variant still badges the
--     merged row.
--   • EMPTY-KEY GUARD: a name with zero ASCII alphanumerics (e.g. a school
--     name written entirely in Tamil script, which passes the raw
--     length>=6 junk filter) would strip to '' — and every such name would
--     collapse into ONE bogus merged row. To keep exact v3.3 behavior for
--     those rows, the key falls back to the v3.3 whitespace-collapsed form
--     when the stripped key is empty. No cross-keyspace collision is
--     possible: a stripped key is pure [a-z0-9]+ while a fallback key (from
--     a string with no ASCII alphanumerics) contains none.
--   • SCOPE: merging is ASCII-only by design — accented Latin variants
--     ("École" vs "Ecole") do NOT unify (would need the unaccent extension;
--     not worth the dependency for this dataset's naming reality).
--   • Names containing ANY non-ASCII character (Tamil script, mixed-script
--     like "ABC தமிழ்") keep the v3.3 whitespace-collapse key ENTIRELY —
--     stripping would reduce them to garbage ASCII residue keys and merge
--     unrelated schools (round-3 review fix).
--   • The adopted-badge LATERAL reads public.schools org-wide — that table
--     is the module's shared substrate (same org-wide module design the
--     ruling below records for the source tables); the badge is aggregate
--     presence only (a school id the caller can already reach via the
--     module's own list under its RLS).
--   • Asymmetry by design: feeder GROUPING sums counts across a shared key
--     (that is the merge feature; identical-spelling generics already
--     summed in v3.3), while the adopted BADGE is more conservative
--     (location-agreement rule) because a wrong school id is actionable
--     harm and a summed count is informational.
--   • Search matches the space-stripped key, so word boundaries are lost
--     ("tmar" matches "stmarys") — accepted trade-off for
--     punctuation-proof search on this dataset.
--   • Search input is canonicalized with the SAME strip. For stripped input
--     no LIKE-metachar escaping is needed (a pattern reduced to [a-z0-9]
--     cannot contain '%', '_' or '\'); a NON-BLANK input that strips to ''
--     (Tamil-script / symbol-only) falls back to the v3.3 whitespace-collapse
--     form WITH escaping + ESCAPE clause, so it matches the fallback-keyed
--     rows instead of dropping the filter. (Metachars in the SUBJECT never
--     needed escaping.)
--   • Adopted-badge join: if MORE THAN ONE distinct schools row collides on
--     the same canonical key, the match is ambiguous — the row renders as
--     not-adopted (NULL) instead of badging an arbitrary school (review
--     fix; a human disambiguates the school rows).
--
-- Everything else is byte-for-byte v3.3 semantics: junk filters, cycle /
-- prior-cycle derivation, NULL-delta rule, priority/volume ordering, clamps,
-- signature, param defaults and RETURNS TABLE columns (zero code/UI changes).
--
-- DROP + CREATE (not CREATE OR REPLACE) per module convention; the
-- anon/PUBLIC revoke and the Director-ruling COMMENT are re-applied below —
-- a bare DROP silently erases both.

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

  -- v3.4: canonicalize the search input with the SAME strip as the grouping
  -- key. Stripped input needs no LIKE-metachar escaping ('%'/'_'/'\' cannot
  -- survive [a-z0-9]). Review fix: a NON-BLANK search that strips to ''
  -- (Tamil-script or symbol-only input) must NOT silently drop the filter —
  -- it falls back to the v3.3 whitespace-collapse form (escaped), which is
  -- exactly the fallback key Tamil-script feeder rows carry, so Tamil
  -- searches match Tamil rows instead of returning everything.
  v_search := NULLIF(regexp_replace(lower(coalesce(p_search, '')), '[^a-z0-9]', '', 'g'), '');
  IF (v_search IS NULL OR coalesce(p_search, '') ~ '[^[:ascii:]]')
     AND trim(coalesce(p_search, '')) <> '' THEN
    -- Mixed/non-ASCII search routes to the same whitespace-collapse form
    -- non-ASCII NAMES are keyed with (see grouping CASEs) — otherwise a
    -- Tamil search could never match a Tamil-keyed row.
    v_search := replace(replace(replace(
                  regexp_replace(trim(lower(p_search)), '\s+', ' ', 'g'),
                  '\', '\\'), '%', '\%'), '_', '\_');
  END IF;

  RETURN QUERY
  WITH learner_src AS (
    -- v3.4 grouping key: lowercase alphanumerics only, with the v3.3
    -- whitespace-collapsed form as fallback when the strip yields '' (names
    -- with no ASCII alphanumerics keep their v3.3 grouping instead of all
    -- merging into one row).
    SELECT CASE WHEN lp.last_school ~ '[^[:ascii:]]'
             THEN regexp_replace(trim(lower(lp.last_school)), '\s+', ' ', 'g')
             ELSE COALESCE(
               NULLIF(regexp_replace(lower(lp.last_school), '[^a-z0-9]', '', 'g'), ''),
               regexp_replace(trim(lower(lp.last_school)), '\s+', ' ', 'g'))
           END AS name_norm,
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
    SELECT CASE WHEN ml.school_name ~ '[^[:ascii:]]'
             THEN regexp_replace(trim(lower(ml.school_name)), '\s+', ' ', 'g')
             ELSE COALESCE(
               NULLIF(regexp_replace(lower(ml.school_name), '[^a-z0-9]', '', 'g'), ''),
               regexp_replace(trim(lower(ml.school_name)), '\s+', ' ', 'g'))
           END AS name_norm,
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
      -- v3.4: SAME canonicalization on schools.name — an adopted school
      -- recorded under any punctuation/spacing variant must still badge the
      -- merged feeder row.
      LEFT JOIN LATERAL (
        -- Review fix round 2 (MEDIUM, 3/3 consensus): multi-match handling
        -- must separate two cases the canonical key alone cannot:
        --   • variant-DUPLICATE rows of the SAME school (adopted twice under
        --     two spellings) — the badge must SURVIVE → oldest row wins,
        --     matching v3.3 (blanket-NULL here would un-badge real
        --     adoptions and hide them from p_adopted='adopted');
        --   • genuinely DIFFERENT schools colliding on the stripped key —
        --     badging an arbitrary one is wrong → NULL, human disambiguates.
        -- Discriminator: location agreement. Rows that agree on
        -- (district, state) — NULLs agreeing with NULLs — are treated as
        -- duplicates of one school; conflicting locations mean distinct
        -- schools. Undistinguishable all-NULL collisions resolve like v3.3
        -- (oldest), so v3.4 never regresses an existing badge.
        SELECT CASE
                 WHEN count(*) = 1
                   THEN (array_agg(s.id ORDER BY s.created_at))[1]
                 -- NULL-as-wildcard agreement (round-3 review): non-null
                 -- districts must all match, non-null states must all match,
                 -- AND at least one row must carry SOME location evidence.
                 -- Partial-NULL duplicates ('salem' + NULL) keep the badge;
                 -- all-NULL multi-matches have no evidence they are the same
                 -- school → NULL (a false badge on an arbitrary UUID is
                 -- worse than a missing badge).
                 WHEN count(DISTINCT lower(s.district)) FILTER (WHERE s.district IS NOT NULL) <= 1
                  AND count(DISTINCT lower(s.state)) FILTER (WHERE s.state IS NOT NULL) <= 1
                  AND count(*) FILTER (WHERE s.district IS NOT NULL OR s.state IS NOT NULL) > 0
                   THEN (array_agg(s.id ORDER BY s.created_at))[1]
                 ELSE NULL
               END AS id
          FROM public.schools s
         WHERE CASE WHEN s.name ~ '[^[:ascii:]]'
                 THEN regexp_replace(trim(lower(s.name)), '\s+', ' ', 'g')
                 ELSE COALESCE(
                   NULLIF(regexp_replace(lower(s.name), '[^a-z0-9]', '', 'g'), ''),
                   regexp_replace(trim(lower(s.name)), '\s+', ' ', 'g'))
               END = mg.name_norm
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
-- the v3.4 provenance line.
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
were deliberately kept OUT (their RLS is ownership-scoped).
v3.4 (2026-07-03): canonical grouping key = lowercase alphanumerics only (punctuation/spacing variants merge).';
