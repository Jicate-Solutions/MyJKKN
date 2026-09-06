-- ============================================================================
-- Schools Network — feeder tidy (merge duplicates) + roster paging + 'other' level
-- 2026-07-05
--
-- Three approved builds sit on top of the feeder discovery + roster fns:
--   1. MERGE DUPLICATES  — a non-destructive alias map links two "same school,
--      different spelling" canonical keys. The feeder + roster fns resolve every
--      key through this map BEFORE grouping, so merged spellings combine counts
--      and rosters everywhere. Empty map ⇒ output byte-identical to today.
--      Undo = delete the alias row. Suggestions come from trigram similarity.
--   2. ROSTER PAGING     — fn_schools_network_school_learners gains p_limit/
--      p_offset (total_count window stays exact for the panel-match invariant).
--   3. 'OTHER' LEVEL     — p_degree_type='other' selects every learner whose
--      JKKN degree level is neither 'ug' nor 'pg' (incl. NULL/unrecorded), so
--      the always-on "Other levels" discovery section is never a blind spot.
--
-- Canonical key is IDENTICAL to fn_schools_network_feeders v3.4/3.5 (KEEP IN
-- SYNC across all four fns and the schools adopt-match).
-- ============================================================================

-- Trigram similarity for the duplicate-suggestion RPC. Standard Supabase
-- extension; installed into the `extensions` schema (Supabase convention) so
-- it must be schema-qualified as extensions.similarity(...).
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ─── 1. Alias map (non-destructive merge) ───────────────────────────────────
-- from_key (a duplicate canonical key) links INTO to_key (the primary it joins).
-- from_key is UNIQUE: each duplicate resolves to exactly one primary. The link
-- RPC keeps the map FLAT (one hop) by re-pointing dependents on merge.
CREATE TABLE IF NOT EXISTS public.schools_network_feeder_aliases (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_key         text NOT NULL UNIQUE,
  to_key           text NOT NULL,
  from_name_sample text,          -- a human spelling, for the Unlink list UI
  to_name_sample   text,
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sn_feeder_alias_no_self CHECK (from_key <> to_key)
);

ALTER TABLE public.schools_network_feeder_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sn_feeder_alias_select ON public.schools_network_feeder_aliases;
-- Reads for view-permission holders (the fns are SECURITY DEFINER and read it
-- internally regardless; this only governs the Unlink-list direct SELECT).
-- Admin-only read: the merge map is an admin-tool artifact (see link RPC), so
-- match its actors — not the broader schools.view audience (advisory review LOW).
CREATE POLICY sn_feeder_alias_select ON public.schools_network_feeder_aliases
  FOR SELECT USING (is_super_admin() OR is_admin());
-- No INSERT/UPDATE/DELETE policy → all writes go through the SECDEF link/unlink
-- RPCs (which enforce schools.edit). anon gets nothing.
GRANT SELECT ON public.schools_network_feeder_aliases TO authenticated;
REVOKE ALL ON public.schools_network_feeder_aliases FROM anon;

-- ─── 2. Merge / unmerge RPCs (schools.edit) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_schools_network_link_feeders(
  p_from_key  text,
  p_to_key    text,
  p_from_name text DEFAULT NULL,
  p_to_name   text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_primary text;
BEGIN
  -- ADMIN-ONLY (advisory review 2026-07-05 HIGH): a merge re-groups the
  -- ORG-WIDE feeder panel (Director ruling: the panel is an org-wide aggregate),
  -- so it is an org-wide action. A scope='own' coordinator holding schools.edit
  -- must NOT be able to silently re-group every tenant's counts. Gate to admins.
  IF NOT (is_super_admin() OR is_admin()) THEN
    RAISE EXCEPTION 'permission denied — merging feeder duplicates is admin-only'
      USING ERRCODE = '42501';
  END IF;
  IF p_from_key IS NULL OR p_to_key IS NULL OR btrim(p_from_key) = ''
     OR btrim(p_to_key) = '' OR p_from_key = p_to_key THEN
    RAISE EXCEPTION 'invalid merge keys';
  END IF;

  -- Serialize merges (rare admin action) so two concurrent merges on overlapping
  -- keys can't race the resolve→check→insert (advisory review MEDIUM: TOCTOU).
  PERFORM pg_advisory_xact_lock(hashtext('schools_network_feeder_merge'));

  -- Resolve the target to its ultimate primary.
  v_primary := COALESCE(
    (SELECT to_key FROM public.schools_network_feeder_aliases WHERE from_key = p_to_key),
    p_to_key);
  IF v_primary = p_from_key THEN
    RAISE EXCEPTION 'circular merge';
  END IF;
  -- Keep the map STRICTLY one hop so every unlink is a clean reverse. Blocking a
  -- source that is itself a primary (other keys merged INTO it) replaces the old
  -- flatten-UPDATE, which rewrote dependents and made chained merges
  -- irreversible (advisory review HIGH: A→B then B→C stranded A on C after
  -- unlinking B). A source with no dependents strands nothing on unlink.
  IF EXISTS (SELECT 1 FROM public.schools_network_feeder_aliases WHERE to_key = p_from_key) THEN
    RAISE EXCEPTION 'this school is already the target of other merges — unlink those first';
  END IF;
  -- Reject re-pointing an existing merge to a NEW target. Without this, a direct
  -- API POST could map A→C while A→B exists, silently un-merging A from B
  -- (advisory review LOW). Re-sending the SAME target stays idempotent below.
  IF EXISTS (SELECT 1 FROM public.schools_network_feeder_aliases
              WHERE from_key = p_from_key AND to_key <> v_primary) THEN
    RAISE EXCEPTION 'this school is already merged into a different school — unlink it first';
  END IF;

  INSERT INTO public.schools_network_feeder_aliases
    (from_key, to_key, from_name_sample, to_name_sample, created_by)
  VALUES (p_from_key, v_primary, p_from_name, p_to_name, auth.uid())
  ON CONFLICT (from_key) DO UPDATE
    SET to_key = EXCLUDED.to_key,
        from_name_sample = EXCLUDED.from_name_sample,
        to_name_sample = EXCLUDED.to_name_sample,
        created_by = EXCLUDED.created_by,
        created_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_schools_network_link_feeders(text, text, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_schools_network_link_feeders(text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_schools_network_unlink_feeder(p_from_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (is_super_admin() OR is_admin()) THEN
    RAISE EXCEPTION 'permission denied — unmerging feeder duplicates is admin-only'
      USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.schools_network_feeder_aliases WHERE from_key = p_from_key;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_schools_network_unlink_feeder(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_schools_network_unlink_feeder(text) TO authenticated;

-- ─── 3. Duplicate suggestions (trigram + first-2-char blocking) ─────────────
CREATE OR REPLACE FUNCTION public.fn_schools_network_feeder_dupe_suggestions(
  p_limit int DEFAULT 50
)
RETURNS TABLE(
  from_key text, from_name text, from_count bigint,
  to_key   text, to_name   text, to_count   bigint,
  similarity real
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
SET statement_timeout TO '15000'   -- cap the trigram scan (advisory review LOW)
AS $$
BEGIN
  -- Admin-only: this feeds the admin-only merge tool (see link RPC).
  IF NOT (is_super_admin() OR is_admin()) THEN
    RAISE EXCEPTION 'permission denied — feeder tidy is admin-only'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH feeders AS (
    -- distinct CURRENT (already alias-resolved) feeder keys + dominant spelling
    -- + count. Because keys are resolved, already-merged pairs never re-suggest.
    SELECT COALESCE(al.to_key, base.raw_key) AS k,
           mode() WITHIN GROUP (ORDER BY base.raw_disp) AS nm,
           count(*) AS n
      FROM (
        SELECT (CASE WHEN lp.last_school ~ '[^[:ascii:]]'
                  THEN regexp_replace(trim(lower(lp.last_school)), '\s+', ' ', 'g')
                  ELSE COALESCE(
                    NULLIF(regexp_replace(lower(lp.last_school), '[^a-z0-9]', '', 'g'), ''),
                    regexp_replace(trim(lower(lp.last_school)), '\s+', ' ', 'g'))
                END) AS raw_key,
               trim(lp.last_school) AS raw_disp
          FROM public.learners_profiles lp
         WHERE lp.last_school IS NOT NULL
           AND length(trim(lp.last_school)) >= 6
           AND lower(lp.last_school) NOT LIKE '%unknown%'
           AND lower(trim(lp.last_school)) NOT IN ('nil','na','n/a','-','nothing')
      ) base
      LEFT JOIN public.schools_network_feeder_aliases al ON al.from_key = base.raw_key
     GROUP BY COALESCE(al.to_key, base.raw_key)
  )
  SELECT a.k, a.nm, a.n, b.k, b.nm, b.n,
         extensions.similarity(a.nm, b.nm) AS sim
    FROM feeders a
    JOIN feeders b
      ON a.k < b.k
     AND left(a.k, 2) = left(b.k, 2)                    -- blocking → performant
     AND extensions.similarity(a.nm, b.nm) > 0.60       -- ↑ from 0.40: fewer false pairs (advisory)
   ORDER BY extensions.similarity(a.nm, b.nm) DESC, (a.n + b.n) DESC
   LIMIT greatest(1, least(p_limit, 200));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_schools_network_feeder_dupe_suggestions(int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_schools_network_feeder_dupe_suggestions(int) TO authenticated;

-- ─── 4. fn_schools_network_feeders — alias-resolve + 'other' level (v3.6) ────
-- Same 8-arg signature (CREATE OR REPLACE). Changes vs v3.5:
--   • learner_src / marketing_src compute the raw canonical key, LEFT JOIN the
--     alias map, and GROUP BY the RESOLVED key (empty map ⇒ identical grouping).
--   • the adopt-match LATERAL resolves the school's canonical key too, so a
--     school adopted under a merged spelling still lights up as "In network".
--   • p_degree_type='other' selects degree_type NOT IN ('ug','pg') OR NULL.
CREATE OR REPLACE FUNCTION public.fn_schools_network_feeders(
  p_search text DEFAULT NULL, p_source text DEFAULT NULL, p_adopted text DEFAULT NULL,
  p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_sort text DEFAULT 'volume',
  p_cycle_year integer DEFAULT NULL, p_degree_type text DEFAULT NULL)
RETURNS TABLE(school_name text, enrolled_count bigint, leads_count bigint, sources text[],
  adopted_school_id uuid, total_count bigint, cycle_year integer, prior_cycle_year integer,
  current_cycle_enrolled bigint, prior_cycle_enrolled bigint, cycle_delta bigint, cohort_known bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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

  -- INTENTIONALLY ORG-WIDE (Director ruling, carried from #1780): the feeder
  -- panel is an aggregate of counts + names with NO learner PII, so every
  -- schools.view holder sees the same org-wide discovery regardless of scope.
  -- Only the PII roster fn (fn_schools_network_school_learners) is tenant-
  -- scoped. Do NOT add an institution filter here — that would fork the panel
  -- per viewer and break the shared discovery model (advisory review MEDIUM:
  -- flagged the count/roster scope asymmetry — it is by design, not a leak).
  v_sort := CASE WHEN p_sort IN ('priority', 'volume') THEN p_sort ELSE 'volume' END;

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

  v_search := NULLIF(regexp_replace(lower(coalesce(p_search, '')), '[^a-z0-9]', '', 'g'), '');
  IF (v_search IS NULL OR coalesce(p_search, '') ~ '[^[:ascii:]]')
     AND trim(coalesce(p_search, '')) <> '' THEN
    v_search := replace(replace(replace(
                  regexp_replace(trim(lower(p_search)), '\s+', ' ', 'g'),
                  '\', '\\'), '%', '\%'), '_', '\_');
  END IF;

  RETURN QUERY
  WITH learner_src AS (
    SELECT COALESCE(al.to_key, base.raw_key) AS name_norm,
           mode() WITHIN GROUP (ORDER BY base.raw_disp) AS name_disp,
           count(*) AS n,
           count(*) FILTER (WHERE base.yr = v_cycle) AS cur_n,
           count(*) FILTER (WHERE base.yr = v_prior) AS pri_n
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
          LEFT JOIN public.degrees d ON d.id = lp.degree_id
         WHERE lp.last_school IS NOT NULL
           AND length(trim(lp.last_school)) >= 6
           AND lower(lp.last_school) NOT LIKE '%unknown%'
           AND lower(trim(lp.last_school)) NOT IN ('nil','na','n/a','-','nothing')
           AND (
             p_degree_type IS NULL
             OR (p_degree_type = 'other' AND (d.degree_type IS NULL OR d.degree_type NOT IN ('ug','pg')))
             OR d.degree_type = p_degree_type
           )
      ) base
      LEFT JOIN public.schools_network_feeder_aliases al ON al.from_key = base.raw_key
     GROUP BY COALESCE(al.to_key, base.raw_key)
  ),
  marketing_src AS (
    SELECT COALESCE(al.to_key, base.raw_key) AS name_norm,
           mode() WITHIN GROUP (ORDER BY base.raw_disp) AS name_disp,
           count(*) AS n
      FROM (
        SELECT (CASE WHEN ml.school_name ~ '[^[:ascii:]]'
                  THEN regexp_replace(trim(lower(ml.school_name)), '\s+', ' ', 'g')
                  ELSE COALESCE(
                    NULLIF(regexp_replace(lower(ml.school_name), '[^a-z0-9]', '', 'g'), ''),
                    regexp_replace(trim(lower(ml.school_name)), '\s+', ' ', 'g'))
                END) AS raw_key,
               trim(ml.school_name) AS raw_disp
          FROM public.marketing_leads_database ml
         WHERE p_degree_type IS NULL      -- leads have no level → typed sections exclude them
           AND ml.school_name IS NOT NULL
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
    SELECT mg.name_disp, mg.name_norm, mg.enrolled_n, mg.leads_n, mg.cur_n, mg.pri_n, mg.srcs,
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
     WHERE (v_search IS NULL OR mg.name_norm LIKE '%' || v_search || '%' ESCAPE '\')
       AND (p_source IS NULL OR p_source = ANY(mg.srcs))
       AND (p_adopted IS NULL
            OR (p_adopted = 'adopted' AND adopt.id IS NOT NULL)
            OR (p_adopted = 'not_adopted' AND adopt.id IS NULL))
  )
  SELECT j.name_disp, j.enrolled_n, j.leads_n, j.srcs, j.adopted_id,
         count(*) OVER () AS total_count,
         v_cycle, v_prior, j.cur_n, j.pri_n,
         CASE WHEN v_prior IS NULL OR (j.cur_n + j.pri_n) = 0 THEN NULL ELSE j.cur_n - j.pri_n END,
         j.cur_n + j.pri_n
    FROM joined j
   ORDER BY
     CASE WHEN v_sort = 'priority'
          THEN CASE WHEN v_prior IS NULL OR (j.cur_n + j.pri_n) = 0 THEN NULL ELSE j.cur_n - j.pri_n END
     END ASC NULLS LAST,
     -- name_norm is the unique GROUP BY key → a stable final tiebreaker so
     -- LIMIT/OFFSET paging across the 88+ feeder pages can't repeat or skip a
     -- row when enrolled/leads/name_disp tie (advisory review MEDIUM; mirrors
     -- the roster fn's learner_id tiebreaker).
     j.enrolled_n DESC, j.leads_n DESC, j.name_disp, j.name_norm
   LIMIT greatest(1, least(p_limit, 200))
  OFFSET greatest(0, p_offset);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_schools_network_feeders(text, text, text, integer, integer, text, integer, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_schools_network_feeders(text, text, text, integer, integer, text, integer, text) TO authenticated;

-- ─── 5. fn_schools_network_school_learners — member-keys + paging + 'other' ──
-- Signature changes (adds p_limit/p_offset) → DROP the old 2-arg then CREATE.
DROP FUNCTION IF EXISTS public.fn_schools_network_school_learners(text, text);

CREATE OR REPLACE FUNCTION public.fn_schools_network_school_learners(
  p_school_name text,
  p_degree_type text DEFAULT NULL,
  p_limit int DEFAULT 25,
  p_offset int DEFAULT 0
)
RETURNS TABLE(learner_id uuid, learner_name text, register_number text, program_name text,
  degree_type text, admission_year integer, year_known boolean, total_count bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_key text;
  v_primary text;
BEGIN
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('schools_network.schools.view')) THEN
    RAISE EXCEPTION 'permission denied for schools_network.schools.view'
      USING ERRCODE = '42501';
  END IF;

  v_key := CASE WHEN p_school_name ~ '[^[:ascii:]]'
             THEN regexp_replace(trim(lower(p_school_name)), '\s+', ' ', 'g')
             ELSE COALESCE(
               NULLIF(regexp_replace(lower(p_school_name), '[^a-z0-9]', '', 'g'), ''),
               regexp_replace(trim(lower(p_school_name)), '\s+', ' ', 'g'))
           END;
  -- Resolve the requested school to its merge primary, then gather every key
  -- that belongs to that primary (itself + all keys merged into it), so a
  -- merged school's roster spans all its spellings. NOTE: roster length equals
  -- the org-wide panel's enrolled_count only for admin / scope='all' viewers —
  -- a scope='own' viewer's roster is institution-scoped (PII guard below) while
  -- the panel fn is org-wide (no guard), so their roster reads lower (advisory).
  v_primary := COALESCE(
    (SELECT to_key FROM public.schools_network_feeder_aliases WHERE from_key = v_key), v_key);

  RETURN QUERY
  WITH member_keys AS (
    SELECT v_primary AS k
    UNION
    SELECT from_key FROM public.schools_network_feeder_aliases WHERE to_key = v_primary
  ),
  roster AS (
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
            END) IN (SELECT k FROM member_keys)
       AND (
         p_degree_type IS NULL
         OR (p_degree_type = 'other' AND (d.degree_type IS NULL OR d.degree_type NOT IN ('ug','pg')))
         OR d.degree_type = p_degree_type
       )
       -- NULL-institution PII guard (see 2026-07-04 advisory): admins see NULL-
       -- institution rows (roster==panel); scope='own' treats NULL as inaccessible.
       AND (
         is_super_admin() OR is_admin()
         OR (lp.institution_id IS NOT NULL AND role_has_institution_access(lp.institution_id))
       )
  )
  SELECT r.learner_id, r.learner_name, r.register_number, r.program_name,
         r.degree_type, r.admission_year, r.year_known,
         count(*) OVER () AS total_count      -- exact total (pre-LIMIT window)
    FROM roster r
   -- learner_id is the UNIQUE tiebreaker: without it, learners sharing a
   -- year+name (or NULL name) sort nondeterministically and LIMIT/OFFSET can
   -- skip or repeat rows across pages (advisory review MEDIUM — new with paging).
   ORDER BY r.admission_year DESC NULLS LAST, r.learner_name NULLS LAST, r.learner_id
   LIMIT  greatest(1, least(p_limit, 200))
  OFFSET greatest(0, p_offset);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_schools_network_school_learners(text, text, int, int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_schools_network_school_learners(text, text, int, int) TO authenticated;
