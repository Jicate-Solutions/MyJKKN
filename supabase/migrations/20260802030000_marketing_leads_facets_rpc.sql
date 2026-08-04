-- 20260802030000_marketing_leads_facets_rpc.sql
--
-- fix(data): single-scan facets aggregate for the marketing leads database —
-- kills three PostgREST 10k-row silent truncations (same disease as PR #2762).
--
-- WHY: /api/admission/marketing/leads previously computed its `districts`,
-- `stats`, and `batches` actions by fetching EVERY row of
-- marketing_leads_database for the institution and aggregating in JS.
-- PostgREST caps un-ranged selects at 10,000 rows and still returns HTTP 200,
-- so with 100,950 rows in prod (all one institution) every one of those
-- aggregates was silently computed over <10% of the data. Measured live
-- 2026-08-02 against prod:
--   * districts action:        1 district returned  (true: 4 — ERODE only,
--     because `.order('district')` sorts the cap alphabetically)
--   * stats.totalSchools:      131                  (true: 893)
--   * batches action:          1 batch visible with total_records=10,000
--     (true: 2 batches — 77,902 + 23,048 records)
-- The `stats` action's own comment said "aggregate queries instead of fetching
-- all rows" — the total/gender counts were fixed that way, but the three
-- DISTINCT computations still fetched raw rows.
--
-- This function returns every facet the three actions need in ONE round-trip,
-- aggregated in SQL over the full table, so the numbers are exact at any size.
--
-- Semantics mirror the JS byte-for-byte:
--   * districts        = sorted distinct non-null district values
--   * total_schools    = distinct non-null school_name
--   * total_uploads    = distinct non-null upload_batch_id
--   * gender_other     = gender IS NOT NULL AND gender NOT IN ('Male','Female')
--   * batches          = one row per upload_batch_id (a NULL batch id groups
--     as one entry, exactly like the JS Map); file name / uploader /
--     created_at come from the batch's NEWEST row (the JS iterated
--     created_at DESC and kept first-seen), ordered newest-batch first;
--     total_records = full row count per batch.
--
-- SECURITY: INVOKER (not DEFINER) and EXECUTE locked to service_role only,
-- following the get_admission_lead_program_counts pattern (PR #2762). The
-- calling route uses the service-role client with manual auth; anon /
-- authenticated must not be able to invoke institution-wide marketing data
-- aggregates directly.

CREATE OR REPLACE FUNCTION public.get_marketing_leads_facets(
  p_institution_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT district, school_name, gender,
           upload_batch_id, upload_file_name, uploaded_by, created_at
    FROM marketing_leads_database
    WHERE institution_id = p_institution_id
  ),
  batch_rollup AS (
    -- Newest row per batch carries the display fields (JS first-seen in
    -- created_at DESC iteration); window count gives the full batch size.
    SELECT DISTINCT ON (upload_batch_id)
      upload_batch_id, upload_file_name, uploaded_by, created_at,
      count(*) OVER (PARTITION BY upload_batch_id) AS total_records
    FROM scoped
    ORDER BY upload_batch_id, created_at DESC
  )
  SELECT jsonb_build_object(
    'districts', (
      SELECT coalesce(jsonb_agg(d ORDER BY d), '[]'::jsonb)
      FROM (SELECT DISTINCT district AS d FROM scoped WHERE district IS NOT NULL) x
    ),
    'total_leads', (SELECT count(*) FROM scoped),
    'total_districts', (SELECT count(DISTINCT district) FROM scoped WHERE district IS NOT NULL),
    'total_schools', (SELECT count(DISTINCT school_name) FROM scoped WHERE school_name IS NOT NULL),
    'total_uploads', (SELECT count(DISTINCT upload_batch_id) FROM scoped WHERE upload_batch_id IS NOT NULL),
    'gender_male', (SELECT count(*) FROM scoped WHERE gender = 'Male'),
    'gender_female', (SELECT count(*) FROM scoped WHERE gender = 'Female'),
    'gender_other', (SELECT count(*) FROM scoped WHERE gender IS NOT NULL AND gender NOT IN ('Male', 'Female')),
    'batches', (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'upload_batch_id', b.upload_batch_id,
            'upload_file_name', b.upload_file_name,
            'uploaded_by', b.uploaded_by,
            'created_at', b.created_at,
            'total_records', b.total_records
          )
          ORDER BY b.created_at DESC
        ),
        '[]'::jsonb
      )
      FROM batch_rollup b
    )
  );
$$;

-- Lock: service_role only. Supabase default-grants EXECUTE to anon +
-- authenticated on every new function; revoke all, grant back the sole
-- legitimate caller.
REVOKE EXECUTE ON FUNCTION public.get_marketing_leads_facets(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_marketing_leads_facets(uuid)
  TO service_role;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS public.get_marketing_leads_facets(uuid);
-- (The calling route falls back to erroring loudly if the function is
--  missing — restore the previous route code in the same revert.)
