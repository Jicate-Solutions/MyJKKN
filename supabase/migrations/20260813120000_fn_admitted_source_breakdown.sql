-- =============================================================================
-- Admitted-by-Source drill-down — profile-anchored attribution RPCs
-- Date: 2026-08-13
-- Spec: docs/superpowers/specs/2026-08-13-admitted-source-drilldown-design.md
-- =============================================================================
-- WHY
--   The Group Dashboard's "Admitted" KPI counts learners_profiles rows
--   (lifecycle_status IN ('admitted','active')) — 1,515 for AY 2026.
--   The Source Analytics tab counts admission_leads rows whose joined profile
--   is admitted — 551 for AY 2026. Clicking the KPI and landing on a
--   source-filtered list could therefore only ever explain 36% of the number
--   the user just clicked.
--
--   Root cause: fn_source_analytics anchors on admission_leads and LEFT JOINs
--   the profile. A left join never invents rows on the right, so every admitted
--   learner with no lead row is silently dropped. For AY 2026 that is 964 of
--   1,515 (64%) — direct admissions that never entered the leads pipeline.
--   For AY 2025 and earlier it is 100%: the leads pipeline only began feeding
--   admissions in 2026.
--
-- WHAT
--   Two new RPCs that anchor on learners_profiles instead, so the drill-down
--   total is equal to the KPI total by construction:
--
--     fn_admitted_source_breakdown — paginated learner list, one row per
--       admitted learner, with the source walked back through
--       admission_leads.learner_profile_id. NULL source = direct admission.
--     fn_admitted_source_counts    — per-source counts for the filter chips
--       and donut, so those do not have to page the whole list.
--
--   Neither replaces nor alters fn_source_analytics. That function remains
--   correct for its own question ("what did the leads pipeline produce?").
--
-- DESIGN NOTES
--   * DISTINCT ON (learner_profile_id) picks a single deterministic lead per
--     profile. Today no profile has more than one lead (verified: 0 across
--     every AY), so this changes no current number — it prevents a future
--     duplicate lead from inflating the count. Nothing in the schema enforces
--     uniqueness on admission_leads.learner_profile_id.
--   * '__direct__' is the sentinel for "no lead row", so the filter can be
--     expressed in a URL query param without a NULL special case client-side.
--   * Pagination uses COUNT(*) OVER () rather than a separate exact-count
--     query. A second count query over this shape is an unbounded scan paid
--     twice and is a known source of 57014 statement timeouts in this codebase.
--   * SECURITY DEFINER + explicit role_has_institution_access() gate follows
--     the pattern of every sibling fn_* dashboard RPC. Institution access is
--     resolved once against the small institutions table, then used as a join
--     key — learners_profiles is never scanned under per-row RLS.
--   * admitted_at is best-effort; see the data-quality note in §5 of the spec.
--     COALESCE(status-history 'admitted' event, activated_at). Populated for
--     only ~35% of AY-2026 admits, so it is NULL for the majority. It is
--     deliberately NOT backfilled from created_at, which would present a
--     profile-creation date as an admission date. Ordering uses created_at,
--     which is 100% populated, so the list order is always stable.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- fn_admitted_source_breakdown — the paginated learner list
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_admitted_source_breakdown(uuid[], integer, text, integer, integer);

CREATE OR REPLACE FUNCTION public.fn_admitted_source_breakdown(
  p_institution_ids uuid[],
  p_admission_year  integer DEFAULT NULL,
  p_source          text    DEFAULT NULL,   -- NULL = all; '__direct__' = no lead
  p_limit           integer DEFAULT 50,
  p_offset          integer DEFAULT 0
)
RETURNS TABLE (
  learner_id       uuid,
  full_name        text,
  application_id   text,
  roll_number      text,
  institution_id   uuid,
  institution_name text,
  program_name     text,
  source           text,
  referral_type    text,
  referred_by_name text,
  admitted_at      timestamptz,
  created_at       timestamptz,
  total_count      bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH eligible_institutions AS (
    SELECT i.id, i.name::text AS name
    FROM institutions i
    WHERE i.id = ANY(p_institution_ids)
      AND role_has_institution_access(i.id)
  ),
  cohort_ay AS (
    SELECT ay.id
    FROM admission_years ay
    WHERE p_admission_year IS NOT NULL
      AND ay.year = p_admission_year
  ),
  -- One deterministic lead per profile. Earliest lead wins (first touch).
  lead_pick AS (
    SELECT DISTINCT ON (al.learner_profile_id)
      al.learner_profile_id,
      al.source::text                        AS source,
      NULLIF(TRIM(al.referral_type), '')     AS referral_type,
      NULLIF(TRIM(al.referred_by_name), '')  AS referred_by_name
    FROM admission_leads al
    WHERE al.learner_profile_id IS NOT NULL
    ORDER BY al.learner_profile_id, al.created_at ASC, al.id ASC
  ),
  base AS (
    SELECT
      lp.id                                                            AS learner_id,
      NULLIF(TRIM(CONCAT_WS(' ', lp.first_name, lp.last_name)), '')    AS full_name,
      lp.application_id::text                                          AS application_id,
      lp.roll_number::text                                             AS roll_number,
      lp.institution_id,
      ei.name                                                          AS institution_name,
      pr.program_name::text                                            AS program_name,
      lk.source,
      lk.referral_type,
      lk.referred_by_name,
      COALESCE(hh.changed_at, lp.activated_at)                         AS admitted_at,
      lp.created_at
    FROM learners_profiles lp
    JOIN eligible_institutions ei ON ei.id = lp.institution_id
    LEFT JOIN lead_pick lk        ON lk.learner_profile_id = lp.id
    LEFT JOIN programs  pr        ON pr.id = lp.program_id
    LEFT JOIN LATERAL (
      SELECT MIN(h.changed_at) AS changed_at
      FROM learners_profile_status_history h
      WHERE h.learner_id = lp.id
        AND h.to_status::text = 'admitted'
    ) hh ON TRUE
    WHERE lp.lifecycle_status::text IN ('admitted', 'active')
      AND (p_admission_year IS NULL OR lp.admission_year_id IN (SELECT id FROM cohort_ay))
      AND (
            p_source IS NULL
         OR (p_source = '__direct__' AND lk.source IS NULL)
         OR lk.source = p_source
          )
  )
  SELECT
    b.learner_id,
    b.full_name,
    b.application_id,
    b.roll_number,
    b.institution_id,
    b.institution_name,
    b.program_name,
    b.source,
    b.referral_type,
    b.referred_by_name,
    b.admitted_at,
    b.created_at,
    COUNT(*) OVER ()::bigint AS total_count
  FROM base b
  ORDER BY b.created_at DESC NULLS LAST, b.learner_id
  LIMIT  GREATEST(COALESCE(p_limit, 50), 0)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

GRANT EXECUTE ON FUNCTION public.fn_admitted_source_breakdown(uuid[], integer, text, integer, integer)
  TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- fn_admitted_source_counts — per-source counts for chips + donut
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_admitted_source_counts(uuid[], integer);

CREATE OR REPLACE FUNCTION public.fn_admitted_source_counts(
  p_institution_ids uuid[],
  p_admission_year  integer DEFAULT NULL
)
RETURNS TABLE (
  source text,
  admits bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH eligible_institutions AS (
    SELECT i.id
    FROM institutions i
    WHERE i.id = ANY(p_institution_ids)
      AND role_has_institution_access(i.id)
  ),
  cohort_ay AS (
    SELECT ay.id
    FROM admission_years ay
    WHERE p_admission_year IS NOT NULL
      AND ay.year = p_admission_year
  ),
  lead_pick AS (
    SELECT DISTINCT ON (al.learner_profile_id)
      al.learner_profile_id,
      al.source::text AS source
    FROM admission_leads al
    WHERE al.learner_profile_id IS NOT NULL
    ORDER BY al.learner_profile_id, al.created_at ASC, al.id ASC
  )
  SELECT
    COALESCE(lk.source, '__direct__') AS source,
    COUNT(*)::bigint                  AS admits
  FROM learners_profiles lp
  JOIN eligible_institutions ei ON ei.id = lp.institution_id
  LEFT JOIN lead_pick lk        ON lk.learner_profile_id = lp.id
  WHERE lp.lifecycle_status::text IN ('admitted', 'active')
    AND (p_admission_year IS NULL OR lp.admission_year_id IN (SELECT id FROM cohort_ay))
  GROUP BY COALESCE(lk.source, '__direct__')
  ORDER BY admits DESC;
$$;

GRANT EXECUTE ON FUNCTION public.fn_admitted_source_counts(uuid[], integer)
  TO authenticated, service_role;
