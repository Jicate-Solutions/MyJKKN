-- 20260802031000_admission_program_funnel_agg_rpc.sql
--
-- fix(data): SQL aggregate for the admission program-funnel analytics —
-- kills a PostgREST 10k-row silent truncation (same disease as PR #2762).
--
-- WHY: /api/admission/analytics/program-funnel fetched EVERY admission_leads
-- row (id, interested_programs, funnel_stage, institution_id) and aggregated
-- per-program funnel counts in JS. PostgREST caps un-ranged selects at 10,000
-- rows with HTTP 200, and prod holds 21,876 leads — so the global
-- (all-institutions) view aggregated barely 46% of the data. Measured live
-- 2026-08-02: the JS saw 3,780 distinct (lead, program) pairs of the true
-- 10,959 — every program's inquiry/conversion funnel undercounted by ~2/3.
--
-- Semantics mirror the route's JS exactly:
--   * one (lead, program) pair counts once per program (JS "seen" Set ==
--     SELECT DISTINCT);
--   * group institution = the program's institution when the pid resolves in
--     programs, else the lead's own institution (JS `prog?.institutionId ??
--     instId`); name resolution stays in the route;
--   * stage buckets use the SAME stage lists as the route
--     (contacted / applied / enrolled), stage = coalesce(funnel_stage,'new');
--   * `institutions` is the route's fallback aggregation (per-institution
--     over ALL leads in scope, one count per lead) used when no lead has
--     program-level data.
--
-- NOTE: interested_programs is text[] (not uuid[]); entries are compared to
-- program ids as strings, exactly as the JS did — non-UUID / orphan entries
-- survive as their own pid group with the lead's institution, exactly like
-- the JS "Not Specified" rows. funnel_stage is an enum; it is compared as
-- text, as the JS did.
--
-- SECURITY: INVOKER and EXECUTE locked to service_role only, following the
-- get_admission_lead_program_counts pattern (PR #2762). The calling route
-- uses the service-role client with manual auth; this aggregate is
-- institution-wide admission data.

CREATE OR REPLACE FUNCTION public.get_admission_program_funnel_agg(
  p_institution_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT id,
           interested_programs,
           coalesce(funnel_stage::text, 'new') AS stage,
           institution_id
    FROM admission_leads
    WHERE (p_institution_id IS NULL OR institution_id = p_institution_id)
  ),
  stage_sets AS (
    SELECT
      ARRAY['contacted','not_reachable','interested','follow_up_scheduled',
            'engaged','qualified','application_started','application_submitted',
            'documents_pending','documents_verified','interview_scheduled',
            'interview_completed','offer_sent','offer_accepted','token_paid',
            'applied','interviewed','offered','enrolled','confirmed'] AS contacted_stages,
      ARRAY['application_started','application_submitted','documents_pending',
            'documents_verified','interview_scheduled','interview_completed',
            'offer_sent','offer_accepted','token_paid','applied','interviewed',
            'offered','enrolled','confirmed'] AS applied_stages,
      ARRAY['enrolled','confirmed','token_paid','offer_accepted'] AS enrolled_stages
  ),
  pairs AS (
    -- One row per DISTINCT (lead, program) — a duplicate pid inside one
    -- lead's array counts once, exactly like the JS dedup Set.
    SELECT DISTINCT
      s.id AS lead_id,
      x.pid,
      s.stage,
      coalesce(p.institution_id, s.institution_id) AS group_institution_id
    FROM scoped s
    CROSS JOIN LATERAL unnest(s.interested_programs) AS x(pid)
    LEFT JOIN programs p ON p.id::text = x.pid
    WHERE s.interested_programs IS NOT NULL
      AND x.pid IS NOT NULL
  ),
  prog_agg AS (
    SELECT
      pr.pid,
      pr.group_institution_id,
      count(*) AS total,
      count(*) FILTER (WHERE pr.stage = ANY(ss.contacted_stages)) AS contacted,
      count(*) FILTER (WHERE pr.stage = ANY(ss.applied_stages)) AS applied,
      count(*) FILTER (WHERE pr.stage = ANY(ss.enrolled_stages)) AS enrolled
    FROM pairs pr CROSS JOIN stage_sets ss
    GROUP BY pr.pid, pr.group_institution_id
  ),
  inst_agg AS (
    SELECT
      s.institution_id,
      count(*) AS total,
      count(*) FILTER (WHERE s.stage = ANY(ss.contacted_stages)) AS contacted,
      count(*) FILTER (WHERE s.stage = ANY(ss.applied_stages)) AS applied,
      count(*) FILTER (WHERE s.stage = ANY(ss.enrolled_stages)) AS enrolled
    FROM scoped s CROSS JOIN stage_sets ss
    WHERE s.institution_id IS NOT NULL
    GROUP BY s.institution_id
  )
  SELECT jsonb_build_object(
    'programs', (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'pid', pid,
            'group_institution_id', group_institution_id,
            'total', total,
            'contacted', contacted,
            'applied', applied,
            'enrolled', enrolled
          )
        ),
        '[]'::jsonb
      )
      FROM prog_agg
    ),
    'institutions', (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'institution_id', institution_id,
            'total', total,
            'contacted', contacted,
            'applied', applied,
            'enrolled', enrolled
          )
        ),
        '[]'::jsonb
      )
      FROM inst_agg
    )
  );
$$;

-- Lock: service_role only (Supabase default-grants EXECUTE to anon +
-- authenticated on every new function).
REVOKE EXECUTE ON FUNCTION public.get_admission_program_funnel_agg(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admission_program_funnel_agg(uuid)
  TO service_role;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS public.get_admission_program_funnel_agg(uuid);
-- (Restore the previous route code in the same revert.)
