-- 2026-06-29 — Lock the NAAC 5.2.1 / AICTE placement export RPCs to CDC staff, scoped.
--
-- FINDING (Layer-2 authenticated sweep, 2026-06-29; matches memory
-- reference_cdc_naac_aicte_export_pii_leak): fn_naac_5_2_1_export and
-- fn_aicte_annual_export are SECURITY DEFINER and filtered ONLY on
-- p.status='accepted' — no caller guard, no institution scope. `anon` is
-- revoked, but `authenticated` holds EXECUTE, so ANY logged-in user (verified
-- live: test.student, a non-CDC account) can call them directly and bypass the
-- API routes' app-layer CDC-staff 403. cdc_placements is currently empty so
-- nothing leaks TODAY, but the moment placement data is entered this is a live
-- cross-institution PII export (name, register/enrollment no., gender,
-- community/social category, address, salary) to every authenticated account.
-- The intended #1253 RPC hardening (Tier-3 manual dispatch) was never applied.
--
-- FIX: add `AND is_cdc_staff() AND role_has_institution_access(lp.institution_id)`
-- to each WHERE. is_cdc_staff() (now multi-role aware) makes a non-CDC caller
-- get 0 rows; role_has_institution_access(lp.institution_id) scopes a
-- coordinator to their own institution while cdc_head (scope='all') / super_admin
-- still export everything. Full bodies reproduced VERBATIM (CREATE OR REPLACE on
-- a LANGUAGE sql function replaces the whole body — partial reproduction would
-- silently drop columns/joins).

CREATE OR REPLACE FUNCTION public.fn_naac_5_2_1_export(p_cycle text)
 RETURNS SETOF cdc_naac_5_2_1_row
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    NULLIF(TRIM(COALESCE(lp.first_name, '') || ' ' || COALESCE(lp.last_name, '')), '')::text AS student_name,
    lp.register_number::text                                                          AS register_number,
    lp.gender::text                                                                   AS gender,
    cc.name::text                                                                     AS category,
    NULL::text                                                                        AS parent_income_range,
    lp.permanent_address_district::text                                               AS district,
    lp.permanent_address_state::text                                                  AS state,
    pg.program_name::text                                                             AS program,
    ay.year::integer                                                                  AS year_of_admission,
    (ay.year + COALESCE(pg.program_duration_yrs, 0))::integer                         AS year_of_passing,
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
    AND public.is_cdc_staff()
    AND public.role_has_institution_access(lp.institution_id)
  ORDER BY p.accepted_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.fn_aicte_annual_export(p_year integer)
 RETURNS SETOF cdc_aicte_annual_row
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    ay.year::integer                                                                  AS year_of_admission,
    (ay.year + COALESCE(pg.program_duration_yrs, 0))::integer                         AS year_of_passing,
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
    AND public.is_cdc_staff()
    AND public.role_has_institution_access(lp.institution_id)
  ORDER BY p.accepted_at DESC;
$function$;

-- Re-assert the grant posture (anon stays revoked, authenticated keeps EXECUTE;
-- the in-body guard is what gates non-CDC callers now).
REVOKE EXECUTE ON FUNCTION public.fn_naac_5_2_1_export(text)   FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_aicte_annual_export(integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_naac_5_2_1_export(text)   TO authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_aicte_annual_export(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
