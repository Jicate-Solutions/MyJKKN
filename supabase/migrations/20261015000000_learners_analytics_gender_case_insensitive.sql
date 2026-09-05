-- ============================================================================
-- Learners Analytics — gender filter matched zero rows, always
-- ============================================================================
-- learners_profiles.gender is stored Title Case ('Male' / 'Female' / 'Other'),
-- enforced by learners_profiles_gender_check and normalised on write by
-- trg_normalize_gender_learners_profiles. Production on 2026-08-31:
--
--     Female 3772 | Male 3528 | '' 59 | Other 2      (7361 rows, 0 NULL)
--
-- Every get_learners_* RPC compared with `lp.gender = filter_gender`, i.e.
-- case-SENSITIVELY, while the Learners Analytics dashboard's radio group sent
-- lower case ('male' / 'female'). So selecting a gender on that dashboard sent
-- every card, chart and total to zero, with no error anywhere — the silent
-- empty-result failure mode this stack specialises in.
--
-- The TypeScript half of the fix (the filter panel now emits the stored canon,
-- and the service layer compares with .ilike) ships in the same change. This
-- migration is the BACKSTOP: a bookmarked `?gender=male`, an API-key caller or
-- any future consumer must not be able to reintroduce the silent zero.
--
-- Also fixed here: the gender distribution chart rendered the 59 blank-gender
-- learners as an unlabelled slice, because `lp.gender IS NOT NULL` is TRUE for
-- '' and INITCAP('') is '' (not NULL, so the COALESCE to 'Unknown' never fired).
-- Blank and NULL now both fold into a single 'Unknown' bucket, which also makes
-- the percentages sum to 100 — previously NULLs counted in the denominator but
-- were excluded from the rows.
--
-- NOTE: no index exists on learners_profiles.gender, so lower() on both sides
-- costs nothing here (~7k rows, already a sequential scan).
--
-- Every function below stays SECURITY INVOKER. They aggregate learners_profiles
-- and MUST keep evaluating that table's RLS as the calling user.
-- ============================================================================

-- ── 1. Gender distribution: case-insensitive filter + 'Unknown' bucket ──────
--
-- Rewritten in full rather than swept, because the RETURN QUERY changes shape.
CREATE OR REPLACE FUNCTION public.get_learners_distribution_by_gender(
    filter_institution_ids uuid[] DEFAULT NULL::uuid[],
    filter_academic_year_id uuid DEFAULT NULL::uuid,
    filter_degree_id uuid DEFAULT NULL::uuid,
    filter_department_id uuid DEFAULT NULL::uuid,
    filter_program_id uuid DEFAULT NULL::uuid,
    filter_semester_id uuid DEFAULT NULL::uuid,
    filter_section_id uuid DEFAULT NULL::uuid,
    filter_lifecycle_statuses text[] DEFAULT NULL::text[],
    filter_gender text DEFAULT NULL::text,
    filter_is_profile_complete boolean DEFAULT NULL::boolean,
    filter_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
    filter_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS TABLE(id text, name text, count bigint, percentage numeric)
LANGUAGE plpgsql
AS $function$
DECLARE
    total_count bigint;
BEGIN
    SELECT COUNT(*)::bigint INTO total_count
    FROM learners_profiles lp
    WHERE (filter_institution_ids IS NULL OR lp.institution_id = ANY(filter_institution_ids))
      AND (filter_academic_year_id IS NULL OR lp.academic_year_id = filter_academic_year_id)
      AND (filter_degree_id IS NULL OR lp.degree_id = filter_degree_id)
      AND (filter_department_id IS NULL OR lp.department_id = filter_department_id)
      AND (filter_program_id IS NULL OR lp.program_id = filter_program_id)
      AND (filter_semester_id IS NULL OR lp.semester_id = filter_semester_id)
      AND (filter_section_id IS NULL OR lp.section_id = filter_section_id)
      AND (filter_lifecycle_statuses IS NULL OR lp.lifecycle_status::text = ANY(filter_lifecycle_statuses))
      AND (filter_gender IS NULL OR lower(lp.gender) = lower(filter_gender))
      AND (filter_is_profile_complete IS NULL OR lp.is_profile_complete = filter_is_profile_complete)
      AND (filter_date_from IS NULL OR lp.created_at >= filter_date_from)
      AND (filter_date_to IS NULL OR lp.created_at <= filter_date_to);

    RETURN QUERY
    SELECT
        COALESCE(NULLIF(btrim(lp.gender), ''), 'Unknown')::text as id,
        INITCAP(COALESCE(NULLIF(btrim(lp.gender), ''), 'Unknown'))::text as name,
        COUNT(*)::bigint as count,
        CASE
            WHEN total_count > 0 THEN ROUND((COUNT(*)::numeric / total_count::numeric) * 100, 2)
            ELSE 0
        END as percentage
    FROM learners_profiles lp
    WHERE (filter_institution_ids IS NULL OR lp.institution_id = ANY(filter_institution_ids))
      AND (filter_academic_year_id IS NULL OR lp.academic_year_id = filter_academic_year_id)
      AND (filter_degree_id IS NULL OR lp.degree_id = filter_degree_id)
      AND (filter_department_id IS NULL OR lp.department_id = filter_department_id)
      AND (filter_program_id IS NULL OR lp.program_id = filter_program_id)
      AND (filter_semester_id IS NULL OR lp.semester_id = filter_semester_id)
      AND (filter_section_id IS NULL OR lp.section_id = filter_section_id)
      AND (filter_lifecycle_statuses IS NULL OR lp.lifecycle_status::text = ANY(filter_lifecycle_statuses))
      AND (filter_gender IS NULL OR lower(lp.gender) = lower(filter_gender))
      AND (filter_is_profile_complete IS NULL OR lp.is_profile_complete = filter_is_profile_complete)
      AND (filter_date_from IS NULL OR lp.created_at >= filter_date_from)
      AND (filter_date_to IS NULL OR lp.created_at <= filter_date_to)
    -- `lp.gender IS NOT NULL` deliberately removed: it was TRUE for the 59 ''
    -- rows (so they rendered unlabelled) and excluded NULLs from the slices
    -- while total_count still counted them. Both now land in 'Unknown'.
    GROUP BY COALESCE(NULLIF(btrim(lp.gender), ''), 'Unknown')
    ORDER BY count DESC;
END;
$function$;

-- ── 2. Sweep the identical comparison out of the remaining RPCs ─────────────
--
-- These five bodies are otherwise untouched, so they are rewritten from their
-- own deployed source with one exact textual substitution rather than being
-- retyped here — retyping ~250 lines of generated SQL is how a reference copy
-- silently drifts from what is actually deployed. pg_get_functiondef preserves
-- the signature, volatility and SECURITY INVOKER setting verbatim.
--
-- The end state is mirrored into supabase/setup/02_functions.sql, and the
-- assertion below fails the migration loudly if the source shape ever changes
-- (a rename, a reformat) rather than silently sweeping nothing.
DO $sweep$
DECLARE
    fn record;
    swept int := 0;
BEGIN
    FOR fn IN
        SELECT p.oid, p.proname, pg_get_functiondef(p.oid) AS def
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN (
              'get_learners_count_by_status',
              'get_learners_distribution_by_institution',
              'get_learners_distribution_by_department',
              'get_learners_distribution_by_program',
              -- Currently has no application caller (it survives only in the
              -- generated types). Swept anyway so whoever wires it up does not
              -- inherit the bug the other five just shed.
              'get_learners_dashboard_stats_complete'
          )
          AND p.prosrc LIKE '%lp.gender = filter_gender%'
    LOOP
        EXECUTE replace(
            fn.def,
            'lp.gender = filter_gender',
            'lower(lp.gender) = lower(filter_gender)'
        );
        swept := swept + 1;
    END LOOP;

    IF swept <> 5 THEN
        RAISE EXCEPTION
            'gender sweep rewrote % function(s), expected 5 — the source shape changed; review before re-running',
            swept;
    END IF;
END
$sweep$;

-- ── 3. Verify no case-sensitive gender comparison survives ─────────────────
DO $verify$
DECLARE
    leftover text[];
BEGIN
    SELECT array_agg(p.proname ORDER BY p.proname) INTO leftover
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'get_learners_%'
      AND p.prosrc LIKE '%lp.gender = filter_gender%';

    IF leftover IS NOT NULL THEN
        RAISE EXCEPTION 'case-sensitive gender comparison still present in: %', leftover;
    END IF;
END
$verify$;
