-- ============================================================================
-- 20260809101300 — fn_accreditation_evidence_scope must not out-read its caller
--
-- ✅ APPLIED TO PRODUCTION 2026-08-04 under Director authorisation.
--
-- WHAT WAS WRONG
-- --------------
-- 20260809100000 created fn_accreditation_evidence_scope as STABLE SECURITY
-- DEFINER, which bypasses the RLS on quality_evidence_mappings, and then
-- guarded it with:
--
--     is_super_admin() OR is_admin() OR user_has_permission('accreditation.evidence.view')
--
-- Its own comment called that "the cluster-level view permission". It is not.
-- The very same key is what the table's own RLS policy qem_select uses, where
-- it is paired with role_has_institution_access(institution_id). Measured live
-- 2026-08-04, five roles carry it and TWO OF THEM ARE INSTITUTION-SCOPED:
--
--     accreditation_officer  scope=all
--     coo                    scope=all
--     registrar              scope=all
--     hod                    scope=own   ← 102 people
--     principal              scope=own   ← 10 people
--
-- So 112 college-scoped people could read cluster-wide evidence counts through
-- the function that RLS correctly refused them on the table. Proven with a
-- single-role HOD at JKKN College of Pharmacy:
--
--     reading quality_evidence_mappings directly  → 1,767 rows, 1 institution
--     the same user through this function         → 3,559, cluster-wide
--
-- No deployed page called the function at the time, so it was reachable only by
-- a direct authenticated API call — but this PR adds the caller, which is why
-- the fix ships with it rather than after it.
--
-- THE FIX, AND WHY THIS SHAPE
-- ---------------------------
-- The scoped CTE now filters on exactly the predicate qem_select uses, so the
-- function can never return more than the caller could compute for themselves
-- by reading the table. That is the invariant a SECURITY DEFINER aggregate has
-- to hold.
--
-- This is the sibling function's existing behaviour — fn_accreditation_reported_vs_actual
-- from the same migration already requires role_has_institution_access. The
-- inconsistency was inside one file.
--
-- Deliberately NOT done: inventing a new cluster-level permission key. That
-- would need registering in lib/constants/permissions.ts, granting to the three
-- cluster roles, and a matching RLS review — four layers to change what one
-- predicate fixes. It also would not be more correct: with this filter a
-- cluster-scoped officer still sees the true cluster view, and a college-scoped
-- HOD sees a truthful figure for their own college instead of being refused
-- outright. Nobody loses a screen.
--
-- KNOWN AND SEPARATE: shared_count is still structurally 0 for every metric,
-- because quality_evidence_mappings_source_scope_key does not include
-- institution_id, so one source row can be claimed by at most one institution
-- and claiming_institutions can never exceed 1. That is NOT fixed here on
-- purpose: the key is the ON CONFLICT target of 22 SECURITY DEFINER writers
-- that were only just rebuilt to match it (PR #2807, applied 2026-08-04), and
-- widening it to six columns would raise 42P10 in all 22 again — the precise
-- outage that took down five nightly routines for weeks. It needs the key and
-- all 22 writers changed in one transaction, which is its own reviewed PR.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_accreditation_evidence_scope(
    p_body_code    text,
    p_period_label text DEFAULT NULL::text
)
RETURNS TABLE(metric_code text, college_total bigint, cluster_total bigint, shared_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    COALESCE((SELECT is_super_admin()), false)
    OR COALESCE((SELECT is_admin()), false)
    OR COALESCE((SELECT user_has_permission('accreditation.evidence.view')), false)
  ) THEN
    RAISE EXCEPTION 'not authorised to read cluster accreditation evidence'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT m.metric_code AS mc, m.source_table, m.source_id, m.institution_id
      FROM public.quality_evidence_mappings m
     WHERE m.body_code = p_body_code
       AND (p_period_label IS NULL OR m.period_label = p_period_label)
       -- Mirrors qem_select exactly. Without it this SECURITY DEFINER function
       -- returns rows the caller's own RLS would refuse. COALESCE because a
       -- NULL guard would fall through and grant access.
       AND (
            COALESCE((SELECT is_super_admin()), false)
         OR COALESCE((SELECT is_admin()), false)
         OR COALESCE(role_has_institution_access(m.institution_id), false)
       )
  ),
  per_source AS (
    SELECT s.mc, s.source_table, s.source_id,
           count(DISTINCT s.institution_id) AS claiming_institutions
      FROM scoped s
     GROUP BY s.mc, s.source_table, s.source_id
  )
  SELECT
    ps.mc                                                           AS metric_code,
    SUM(ps.claiming_institutions)::bigint                           AS college_total,
    count(*)::bigint                                                AS cluster_total,
    count(*) FILTER (WHERE ps.claiming_institutions > 1)::bigint    AS shared_count
  FROM per_source ps
  GROUP BY ps.mc
  ORDER BY 1;
END;
$function$;

-- Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE on every new function to
-- anon directly, separate from PUBLIC, so REVOKE FROM PUBLIC alone is not
-- enough. CREATE OR REPLACE preserves the existing ACL, so this is a belt-and-
-- braces restatement rather than a change.
REVOKE EXECUTE ON FUNCTION public.fn_accreditation_evidence_scope(text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_evidence_scope(text, text) TO authenticated;

-- Assert the guard is actually in the shipped body. A CREATE OR REPLACE from a
-- stale source has silently reverted a gate in this repo before, so this fails
-- loudly rather than trusting that the text above is what landed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'fn_accreditation_evidence_scope'
       AND pg_get_functiondef(p.oid) ~ 'role_has_institution_access'
  ) THEN
    RAISE EXCEPTION
      'fn_accreditation_evidence_scope is missing the institution filter — refusing to leave the cross-institution read in place';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'fn_accreditation_evidence_scope'
       AND p.proacl::text ~ '\manon='
  ) THEN
    RAISE EXCEPTION 'anon holds EXECUTE on fn_accreditation_evidence_scope';
  END IF;
END $$;
