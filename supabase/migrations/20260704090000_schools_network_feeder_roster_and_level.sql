-- Schools Network: feeder learner roster + UG/PG level split
-- =====================================================================
-- Two additive changes, both backing the feeder drill-down UI
-- (clickable school names → detail page "Enrolled Learners" tab; the
-- un-adopted quick-preview popup; and the two-section School(UG)/College(PG)
-- feeder discovery).
--
-- 1. NEW fn_schools_network_school_learners(p_school_name, p_degree_type)
--    — the student roster behind the "Enrolled Learners" tab and the
--      un-adopted quick-preview popup. Returns the individual learners whose
--      canonical last_school key matches p_school_name, using the EXACT v3.4
--      canonical key (all spelling variants merge → the roster length matches
--      the panel's enrolled_count; verified 106 for "JKK RANGAMMAL (G)HSS").
--    — PII scoping (IMPORTANT, differs from the aggregate feeder fn): the
--      feeder fn is org-wide by Director ruling BECAUSE it exposes only school
--      names + counts (no PII). This fn returns learner PII (name, register
--      no, program, admission year), so it is scoped per-institution via
--      role_has_institution_access(): super_admin / admin / scope='all' see
--      every institution's learners (matching the org-wide panel count);
--      scope='own' roles (outreach_coordinator, program_lead) see only their
--      own institution's slice. The panel stays org-wide aggregate; the
--      roster respects tenant boundaries — the same aggregate-vs-PII line the
--      Director ruling drew.
--    — Shows ALL years; learners with no admission year carry year_known=false
--      so the UI can label them "Year not recorded" (product decision: the
--      roster length must match the panel count, which counts undated learners
--      too).
--
-- 2. fn_schools_network_feeders gains an 8th param p_degree_type
--    (NULL | 'ug' | 'pg') so the panel renders two sections:
--    "Feeder Schools (UG)" and "Feeder Colleges (PG)". When set, only enrolled
--    learners of that JKKN program level are counted (marketing leads have no
--    degree level, so they are excluded from a typed section). p_degree_type
--    IS NULL is BYTE-FOR-BYTE the v3.4 behaviour (default path unchanged: the
--    LEFT JOIN adds no rows, the NULL guard removes no rows) — verified after
--    apply: total 3,242, Rangammal 106. A feeder that fed BOTH levels appears
--    in both sections with its respective per-level count (product decision).
--
-- Everything in fn_schools_network_feeders other than the 3 additive edits
-- (degrees LEFT JOIN + p_degree_type guard in learner_src; p_degree_type guard
-- in marketing_src; the new 8th param) is byte-for-byte v3.4. The canonical
-- key, adopted-badge LATERAL, cycle derivation, NULL-delta rule, ordering,
-- clamps and RETURNS TABLE columns are unchanged.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Learner roster fn (NEW)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_schools_network_school_learners(
  p_school_name text,
  p_degree_type text DEFAULT NULL
)
RETURNS TABLE(
  learner_id uuid,
  learner_name text,
  register_number text,
  program_name text,
  degree_type text,
  admission_year int,
  year_known boolean,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
BEGIN
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('schools_network.schools.view')) THEN
    RAISE EXCEPTION 'permission denied for schools_network.schools.view'
      USING ERRCODE = '42501';
  END IF;

  -- Canonical key IDENTICAL to fn_schools_network_feeders v3.4 (KEEP IN SYNC:
  -- if the feeder key ever changes, this must change in the same migration or
  -- the roster length silently diverges from the panel count).
  v_key := CASE WHEN p_school_name ~ '[^[:ascii:]]'
             THEN regexp_replace(trim(lower(p_school_name)), '\s+', ' ', 'g')
             ELSE COALESCE(
               NULLIF(regexp_replace(lower(p_school_name), '[^a-z0-9]', '', 'g'), ''),
               regexp_replace(trim(lower(p_school_name)), '\s+', ' ', 'g'))
           END;

  RETURN QUERY
  WITH roster AS (
    SELECT lp.id AS learner_id,
           NULLIF(trim(concat_ws(' ', lp.first_name, lp.last_name)), '') AS learner_name,
           lp.register_number::text AS register_number,
           COALESCE(pr.display_name, pr.program_name)::text AS program_name,
           d.degree_type::text AS degree_type,
           ay.year AS admission_year,
           (ay.year IS NOT NULL) AS year_known
      FROM public.learners_profiles lp
      LEFT JOIN public.admission_years ay ON ay.id = lp.admission_year_id
      LEFT JOIN public.degrees d ON d.id = lp.degree_id
      LEFT JOIN public.programs pr ON pr.id = lp.program_id
     WHERE lp.last_school IS NOT NULL
       AND length(trim(lp.last_school)) >= 6
       AND lower(lp.last_school) NOT LIKE '%unknown%'
       AND lower(trim(lp.last_school)) NOT IN ('nil','na','n/a','-','nothing')
       AND (CASE WHEN lp.last_school ~ '[^[:ascii:]]'
              THEN regexp_replace(trim(lower(lp.last_school)), '\s+', ' ', 'g')
              ELSE COALESCE(
                NULLIF(regexp_replace(lower(lp.last_school), '[^a-z0-9]', '', 'g'), ''),
                regexp_replace(trim(lower(lp.last_school)), '\s+', ' ', 'g'))
            END) = v_key
       AND (p_degree_type IS NULL OR d.degree_type = p_degree_type)
       -- PII tenant scoping (see header). SECURITY DEFINER bypasses RLS, so
       -- the scope check is explicit here. role_has_institution_access() is
       -- the module-standard scope fn (super_admin/admin/scope=all → true for
       -- all; scope=own → own institution + granted access only).
       --
       -- NULL-institution guard: role_has_institution_access(NULL) returns TRUE
       -- unconditionally ("system-wide records"), so a bare call would hand a
       -- NULL-institution learner's PII to EVERY scoped viewer — a cross-tenant
       -- leak (advisory review 2026-07-04, 3-lens consensus). Only org-wide
       -- viewers (super_admin / admin) see NULL-institution rows, so the admin
       -- roster length still matches the org-wide panel (the "roster == panel"
       -- invariant); scope='own' viewers treat NULL as inaccessible. Under-
       -- showing a NULL row to a non-admin is safe (never a leak); over-showing
       -- PII is not.
       AND (
         is_super_admin()
         OR is_admin()
         OR (lp.institution_id IS NOT NULL AND role_has_institution_access(lp.institution_id))
       )
  )
  SELECT r.learner_id, r.learner_name, r.register_number, r.program_name,
         r.degree_type, r.admission_year, r.year_known,
         count(*) OVER () AS total_count
    FROM roster r
   ORDER BY r.admission_year DESC NULLS LAST, r.learner_name NULLS LAST
   -- Defensive cap on an otherwise-unbounded PII payload (advisory review).
   -- total_count is a window count over the full roster CTE (computed before
   -- LIMIT), so it stays exact for the panel-match invariant; the real per-
   -- school max is < 200, so this never truncates live data.
   LIMIT 2000;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_schools_network_school_learners(text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_schools_network_school_learners(text, text) TO authenticated;

COMMENT ON FUNCTION public.fn_schools_network_school_learners(text, text) IS
'Learner roster for one feeder school/college. Canonical-key match IDENTICAL to
fn_schools_network_feeders v3.4 so the roster length matches the panel
enrolled_count. Returns learner PII (name, register no, program, admission
year) — so UNLIKE the org-wide aggregate feeder fn it is scoped per institution
via role_has_institution_access(): super_admin/admin/scope=all see every
institution; scope=own roles (outreach_coordinator, program_lead) see only
their own. p_degree_type NULL|ug|pg filters by the JKKN program level the
learner joined. Shows all years; year_known=false = admission year not recorded
(UI labels "Year not recorded"). Bounded by schools_network.schools.view.';

-- ---------------------------------------------------------------------
-- 2. fn_schools_network_feeders v3.5 — add p_degree_type (UG/PG split)
--    (v3.4 body, 3 additive edits only — see header)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_schools_network_feeders(text, text, text, int, int);
DROP FUNCTION IF EXISTS public.fn_schools_network_feeders(text, text, text, int, int, text, int);

CREATE FUNCTION public.fn_schools_network_feeders(
  p_search text DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_adopted text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_sort text DEFAULT 'volume',
  p_cycle_year int DEFAULT NULL,
  p_degree_type text DEFAULT NULL   -- v3.5: NULL=all | 'ug' | 'pg' (level split)
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

  v_prior := (
    SELECT max(ay.year)
      FROM public.admission_years ay
     WHERE ay.year < v_cycle
       AND ay.year >= 2000
       AND EXISTS (SELECT 1 FROM public.learners_profiles lp2
                    WHERE lp2.admission_year_id = ay.id)
  );

  v_search := NULLIF(regexp_replace(lower(coalesce(p_search, '')), '[^a-z0-9]', '', 'g'), '');
  IF (v_search IS NULL OR coalesce(p_search, '') ~ '[^[:ascii:]]')
     AND trim(coalesce(p_search, '')) <> '' THEN
    v_search := replace(replace(replace(
                  regexp_replace(trim(lower(p_search)), '\s+', ' ', 'g'),
                  '\', '\\'), '%', '\%'), '_', '\_');
  END IF;

  RETURN QUERY
  WITH learner_src AS (
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
      -- v3.5: degree level for the UG/PG split. LEFT JOIN (1:0/1:1 on the
      -- single degree_id FK) so the NULL-p_degree_type path adds no rows.
      LEFT JOIN public.degrees d ON d.id = lp.degree_id
     WHERE lp.last_school IS NOT NULL
       AND length(trim(lp.last_school)) >= 6
       AND lower(lp.last_school) NOT LIKE '%unknown%'
       AND lower(trim(lp.last_school)) NOT IN ('nil','na','n/a','-','nothing')
       -- v3.5: level filter. NULL = every learner (v3.4 behaviour). 'ug'/'pg'
       -- counts only enrolled learners of that JKKN program level.
       AND (p_degree_type IS NULL OR d.degree_type = p_degree_type)
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
      -- v3.5: marketing leads carry no JKKN program level, so a typed section
      -- (ug/pg) shows enrolled feeders only. NULL path = v3.4 (leads included).
     WHERE p_degree_type IS NULL
       AND ml.school_name IS NOT NULL
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
        SELECT CASE
                 WHEN count(*) = 1
                   THEN (array_agg(s.id ORDER BY s.created_at))[1]
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

REVOKE EXECUTE ON FUNCTION public.fn_schools_network_feeders(text, text, text, int, int, text, int, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_schools_network_feeders(text, text, text, int, int, text, int, text) TO authenticated;

-- Carry the Director ruling forward VERBATIM (DROP erased it), + v3.5 line.
COMMENT ON FUNCTION public.fn_schools_network_feeders(text, text, text, int, int, text, int, text) IS
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
v3.4 (2026-07-03): canonical grouping key = lowercase alphanumerics only (punctuation/spacing variants merge).
v3.5 (2026-07-04): adds p_degree_type (NULL|ug|pg) for the two-section
School(UG)/College(PG) discovery. NULL is byte-for-byte v3.4. When set, counts
only enrolled learners of that JKKN program level (leads excluded — no level);
a feeder that fed both levels appears in both sections. Still aggregate/org-wide
— PII learner rosters live in fn_schools_network_school_learners, which is
tenant-scoped.';
