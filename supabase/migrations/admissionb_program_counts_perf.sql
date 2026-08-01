-- admission_program_counts_perf.sql
--
-- perf(admission): single-scan aggregate for the leads "Course wise" tab strip.
--
-- WHY: /api/admission/leads/program-counts previously issued THREE sequential
-- PostgREST queries per call — programs list, then a fetch of EVERY
-- admission_leads row with interested_programs populated (10,946 rows in prod,
-- ~1MB of JSON serialized/transferred/parsed per page view; the code comment
-- said "typically <500 rows"), then an exact count — and aggregated in JS.
-- Measured endpoint latency: ~515ms. The SQL cost of the whole aggregation is
-- <35ms server-side; the rest was round-trips + row transfer.
--
-- This function folds all three into ONE round-trip that returns only the
-- 128-program aggregate (~10KB). Semantics are byte-identical to the route's
-- JS aggregation (verified by cross-implementation equivalence across all
-- institutions + global scope — see PR):
--   * per-program count = DISTINCT leads whose interested_programs contains the
--     program (duplicate ids inside one lead's array count once — the JS "seen"
--     set == DISTINCT (lead_id, pid));
--   * only programs in scope appear (orphan/cross-institution pids dropped,
--     like the JS map over programList);
--   * total = ALL leads in scope (not just those with a program);
--   * total_with_program = leads with a non-empty interested_programs array.
--
-- SECURITY: INVOKER (not DEFINER) and EXECUTE is locked to service_role only.
-- The calling route uses the service-role client with manual auth/permission
-- checks (the established admission-leads pattern: the admission_leads RLS
-- cascade exceeds the authenticated statement timeout, so authenticated/anon
-- must NOT be able to invoke this directly — and the aggregate is
-- institution-wide data gated by admission.leads.view in the route).

CREATE OR REPLACE FUNCTION public.get_admission_lead_program_counts(
  p_institution_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  -- NOTE: interested_programs is text[] (NOT uuid[], despite the old route
  -- comment). The JS aggregation compared array entries to program ids as
  -- STRINGS, so the join below is text = uuid::text — identical semantics,
  -- and tolerant of any non-UUID entry in the array (dropped at the join,
  -- exactly as the JS dropped pids absent from the program list).
  WITH lead_counts AS (
    SELECT pid, count(*) AS cnt
    FROM (
      SELECT DISTINCT l.id, unnest(l.interested_programs) AS pid
      FROM admission_leads l
      WHERE l.interested_programs IS NOT NULL
        AND (p_institution_id IS NULL OR l.institution_id = p_institution_id)
    ) x
    WHERE pid IS NOT NULL
    GROUP BY pid
  )
  SELECT jsonb_build_object(
    'programs', (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'program_id', p.id,
            'program_name', p.program_name,
            'count', coalesce(lc.cnt, 0)
          )
          ORDER BY p.program_name ASC
        ),
        '[]'::jsonb
      )
      FROM programs p
      LEFT JOIN lead_counts lc ON lc.pid = p.id::text
      WHERE (p_institution_id IS NULL OR p.institution_id = p_institution_id)
    ),
    'total', (
      SELECT count(*)
      FROM admission_leads
      WHERE (p_institution_id IS NULL OR institution_id = p_institution_id)
    ),
    'total_with_program', (
      SELECT count(*)
      FROM admission_leads
      WHERE interested_programs IS NOT NULL
        AND cardinality(interested_programs) > 0
        AND (p_institution_id IS NULL OR institution_id = p_institution_id)
    )
  );
$$;

-- Lock: service_role only. Supabase default-grants EXECUTE to anon +
-- authenticated on every new function; revoke all three, grant back the sole
-- legitimate caller.
REVOKE EXECUTE ON FUNCTION public.get_admission_lead_program_counts(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admission_lead_program_counts(uuid)
  TO service_role;
