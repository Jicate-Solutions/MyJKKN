-- ============================================================
-- CDC export RPC hardening — gate NAAC/AICTE exports to CDC staff
-- ============================================================
-- Found 2026-06-09 by the read-only CDC health sweep + adversarial verify.
--
-- THE HOLE
-- --------
-- fn_naac_5_2_1_export(text) and fn_aicte_annual_export(integer) are
-- SECURITY DEFINER, so they bypass the cdc_placements self-or-staff RLS
-- policy. Their only filter was `WHERE p.status = 'accepted'` — NO institution
-- scope, NO staff guard. They are GRANT EXECUTE ... TO authenticated. The two
-- API routes in front of them (app/api/cdc/exports/{naac,aicte}/route.ts)
-- gated only on `if (!user) 401` — no role check. Net effect: ANY logged-in
-- account (including a student in any college) could call the route OR the RPC
-- directly and pull institution-wide placement PII (student_name,
-- register_number, gender, community category, permanent address, salary,
-- company, offer/joining dates).
--
-- Anon is already closed (migration 20260605191101 revoked anon EXECUTE on
-- both functions); this migration closes the *authenticated-but-not-CDC-staff*
-- path at the DB layer — the authoritative fix, because the RPC is directly
-- callable by any authenticated client regardless of the route-level gate.
--
-- THE FIX
-- -------
-- Add `AND public.is_cdc_staff()` to each function's WHERE clause. is_cdc_staff()
-- = is_super_admin() OR profiles.role IN ('cdc_head','cdc_coordinator') OR
-- user_has_permission('cdc.view') (defined in 20260518_cdc_substrate_01 +
-- 20260521T0500Z). It reads auth.uid() of the real caller even inside a
-- SECURITY DEFINER body, so a non-CDC caller gets 0 rows. A matching app-layer
-- role gate ships in the same PR (app/api/cdc/exports/{naac,aicte}/route.ts).
--
-- WHAT DOES NOT CHANGE (bodies reproduced verbatim from
-- 20260520T000000Z_cdc_path_c_rpc_extensions_plus_policy_labels.sql — the
-- deep-JOIN column derivations from the T2.4 audit are preserved; ONLY the
-- WHERE clause gains the staff guard):
--   - cdc_naac_5_2_1_row composite type (21 columns)
--   - cdc_aicte_annual_row composite type (15 columns)
--   - all LEFT JOINs and derived columns
--
-- TIER: TIER-3 (RLS/auth-class). Per feedback_migration_notification_protocol,
-- this is NOT auto-applied on merge. It reaches production only when the
-- Director runs the "Apply Supabase migrations" workflow (workflow_dispatch,
-- confirm_apply='apply'); an ephemeral-branch dry-run first is recommended.
-- ============================================================

BEGIN;

-- ----- NAAC 5.2.1 export — body verbatim + staff guard -----
CREATE OR REPLACE FUNCTION fn_naac_5_2_1_export(p_cycle text)
RETURNS SETOF cdc_naac_5_2_1_row
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NULLIF(TRIM(COALESCE(lp.first_name, '') || ' ' || COALESCE(lp.last_name, '')), '')::text AS student_name,
    lp.register_number::text                                                          AS register_number,
    lp.gender::text                                                                   AS gender,
    cc.name::text                                                                     AS category,
    NULL::text                                                                        AS parent_income_range,
    lp.permanent_address_district::text                                               AS district,
    lp.permanent_address_state::text                                                  AS state,
    pg.program_name::text                                                             AS program,
    ay.program_start_year::integer                                                    AS year_of_admission,
    ay.program_end_year::integer                                                      AS year_of_passing,
    NULL::numeric                                                                     AS cgpa,
    r.name::text                                                                      AS company_name,
    s.display_name::text                                                              AS sector,
    p.offered_at::date                                                                AS offer_date,
    p.joining_date::date                                                              AS joining_date,
    p.job_role::text                                                                  AS role_designation,
    p.package_lpa::numeric                                                            AS package_lpa,
    'INR'::text                                                                       AS package_currency,
    (ao.id IS NOT NULL)::boolean                                                      AS is_higher_studies,
    ao.institution_name::text                                                         AS higher_studies_institute,
    NULLIF(TRIM(COALESCE(ao.course_name, '') ||
                CASE WHEN ao.specialization IS NOT NULL AND ao.specialization <> ''
                     THEN ' - ' || ao.specialization
                     ELSE '' END), '')::text                                          AS higher_studies_program
  FROM cdc_placements p
  LEFT JOIN learners_profiles lp           ON lp.id = p.learner_id
  LEFT JOIN programs pg                    ON pg.id = lp.program_id
  LEFT JOIN cdc_recruiters r               ON r.id = p.recruiter_id
  LEFT JOIN cdc_industry_sectors s         ON s.id = r.industry_sector_id
  LEFT JOIN community_categories cc        ON cc.id = lp.community_category_id
  LEFT JOIN admission_years ay             ON ay.id = lp.admission_year_id
  LEFT JOIN alumni_outcomes ao             ON ao.learner_id = lp.id
                                          AND ao.outcome_type = 'higher_studies'
  WHERE p.status = 'accepted'
    AND public.is_cdc_staff()   -- ← staff guard (closes authenticated-non-CDC leak)
  ORDER BY p.accepted_at DESC;
$$;

-- ----- AICTE annual return export — body verbatim + staff guard -----
CREATE OR REPLACE FUNCTION fn_aicte_annual_export(p_year integer)
RETURNS SETOF cdc_aicte_annual_row
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NULLIF(TRIM(COALESCE(lp.first_name, '') || ' ' || COALESCE(lp.last_name, '')), '')::text AS student_name,
    lp.register_number::text                                                          AS enrollment_number,
    lp.gender::text                                                                   AS gender,
    cc.name::text                                                                     AS category,
    CASE
      WHEN cc.code IN ('sc')                       THEN 'SC'
      WHEN cc.code IN ('st')                       THEN 'ST'
      WHEN cc.code IN ('bc','bcm','mbc','bc_cc')   THEN 'OBC'
      WHEN cc.code IN ('oc','not_applicable')      THEN 'GEN'
      WHEN cc.code IN ('sca','dnc','dnt')          THEN 'OBC'
      ELSE NULL
    END::text                                                                         AS social_category,
    pg.program_name::text                                                             AS program,
    d.department_name::text                                                           AS branch,
    ay.program_start_year::integer                                                    AS year_of_admission,
    ay.program_end_year::integer                                                      AS year_of_passing,
    r.name::text                                                                      AS company_name,
    s.display_name::text                                                              AS sector,
    p.offered_at::date                                                                AS offer_date,
    p.package_inr_total::numeric                                                      AS package_inr,
    p.job_location::text                                                              AS location,
    COALESCE(r.is_internal, false)::boolean                                           AS is_internal_placement
  FROM cdc_placements p
  LEFT JOIN learners_profiles lp           ON lp.id = p.learner_id
  LEFT JOIN programs pg                    ON pg.id = lp.program_id
  LEFT JOIN departments d                  ON d.id = pg.department_id
  LEFT JOIN cdc_recruiters r               ON r.id = p.recruiter_id
  LEFT JOIN cdc_industry_sectors s         ON s.id = r.industry_sector_id
  LEFT JOIN community_categories cc        ON cc.id = lp.community_category_id
  LEFT JOIN admission_years ay             ON ay.id = lp.admission_year_id
  WHERE p.status = 'accepted'
    AND public.is_cdc_staff()   -- ← staff guard (closes authenticated-non-CDC leak)
  ORDER BY p.accepted_at DESC;
$$;

-- Lock execution to authenticated CDC callers; explicit anon/PUBLIC revoke per
-- the mandatory anon-revoke rule (CLAUDE.md / feedback_supabase_anon_execute_default_grant).
-- (anon was already revoked by 20260605191101; re-stated here for the audit trail
--  since CREATE OR REPLACE keeps grants but the rule requires explicitness.)
REVOKE EXECUTE ON FUNCTION public.fn_naac_5_2_1_export(text)    FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_aicte_annual_export(integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_naac_5_2_1_export(text)    TO authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_aicte_annual_export(integer) TO authenticated;

COMMIT;
