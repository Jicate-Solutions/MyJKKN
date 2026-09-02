-- ============================================================================
-- Learners Analytics — admission-year (cohort) filter
-- ============================================================================
-- The Advanced Filters panel on /learners/analytics gains an Admission Year
-- dimension. Five of the dashboard's numbers do NOT come from PostgREST — the
-- Overview status cards and the Institution / Department / Program / Gender
-- charts come from these functions, whose filter signature was fixed at 12
-- arguments. Leaving them alone would have shrunk the dashboard's denominator
-- (built in TypeScript by applyDashboardFilters) while these numerators stayed
-- cohort-wide — the same skew that once let completionRate exceed 100%.
--
-- WHY THE FILTER IS AN ARRAY OF IDS AND NOT ONE ID
-- ------------------------------------------------
-- admission_years is institution-scoped: production holds ELEVEN separate
-- "2026" rows, one per college, out of 79 rows total. The UI therefore filters
-- by the integer year and the service fans it out to every row id the caller
-- can see (lib/utils/admission-year-filter.ts). A single-uuid parameter here
-- would silently narrow an "All Institutions" dashboard to one college.
--
-- WHY DROP + CREATE AND NOT CREATE OR REPLACE
-- -------------------------------------------
-- Adding a parameter produces a NEW signature, so CREATE OR REPLACE would leave
-- both the 12-arg and the 13-arg function in place. PostgREST resolves RPCs by
-- argument NAME and would then fail every call with "Could not choose the best
-- candidate function". The old signature has to go.
--
-- The new parameter is appended LAST with DEFAULT NULL, so any 12-argument
-- positional caller keeps working unchanged.
--
-- These functions remain SECURITY INVOKER (the default): RLS on
-- learners_profiles keeps deciding which rows each caller may count.
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_learners_count_by_status(
  uuid[], uuid, uuid, uuid, uuid, uuid, uuid, text[], text, boolean, timestamptz, timestamptz);

CREATE FUNCTION public.get_learners_count_by_status(
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
    filter_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone,
    filter_admission_year_ids uuid[] DEFAULT NULL::uuid[]
)
RETURNS TABLE(status text, count bigint, percentage numeric)
LANGUAGE plpgsql
AS $function$
DECLARE
    total_count bigint;
BEGIN
    -- Get total count
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
      AND (filter_date_to IS NULL OR lp.created_at <= filter_date_to)
      AND (filter_admission_year_ids IS NULL OR lp.admission_year_id = ANY(filter_admission_year_ids));

    RETURN QUERY
    SELECT
        lp.lifecycle_status::text as status,
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
      AND (filter_admission_year_ids IS NULL OR lp.admission_year_id = ANY(filter_admission_year_ids))
    GROUP BY lp.lifecycle_status
    ORDER BY count DESC;
END;
$function$;

DROP FUNCTION IF EXISTS public.get_learners_distribution_by_institution(
  uuid[], uuid, uuid, uuid, uuid, uuid, uuid, text[], text, boolean, timestamptz, timestamptz);

CREATE FUNCTION public.get_learners_distribution_by_institution(
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
    filter_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone,
    filter_admission_year_ids uuid[] DEFAULT NULL::uuid[]
)
RETURNS TABLE(id uuid, name text, count bigint, percentage numeric)
LANGUAGE plpgsql
AS $function$
DECLARE
    total_count bigint;
BEGIN
    -- Get total count for percentage calculation
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
      AND (filter_date_to IS NULL OR lp.created_at <= filter_date_to)
      AND (filter_admission_year_ids IS NULL OR lp.admission_year_id = ANY(filter_admission_year_ids));

    RETURN QUERY
    SELECT
        lp.institution_id as id,
        COALESCE(i.name, 'Unknown')::text as name,
        COUNT(*)::bigint as count,
        CASE
            WHEN total_count > 0 THEN ROUND((COUNT(*)::numeric / total_count::numeric) * 100, 2)
            ELSE 0
        END as percentage
    FROM learners_profiles lp
    LEFT JOIN institutions i ON i.id = lp.institution_id
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
      AND (filter_admission_year_ids IS NULL OR lp.admission_year_id = ANY(filter_admission_year_ids))
      AND lp.institution_id IS NOT NULL
    GROUP BY lp.institution_id, i.name
    ORDER BY count DESC;
END;
$function$;

DROP FUNCTION IF EXISTS public.get_learners_distribution_by_department(
  uuid[], uuid, uuid, uuid, uuid, uuid, uuid, text[], text, boolean, timestamptz, timestamptz);

CREATE FUNCTION public.get_learners_distribution_by_department(
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
    filter_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone,
    filter_admission_year_ids uuid[] DEFAULT NULL::uuid[]
)
RETURNS TABLE(id uuid, name text, count bigint, percentage numeric)
LANGUAGE plpgsql
AS $function$
DECLARE
    total_count bigint;
BEGIN
    -- Get total count
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
      AND (filter_date_to IS NULL OR lp.created_at <= filter_date_to)
      AND (filter_admission_year_ids IS NULL OR lp.admission_year_id = ANY(filter_admission_year_ids));

    RETURN QUERY
    SELECT
        lp.department_id as id,
        COALESCE(d.department_name, 'Unknown')::text as name,
        COUNT(*)::bigint as count,
        CASE
            WHEN total_count > 0 THEN ROUND((COUNT(*)::numeric / total_count::numeric) * 100, 2)
            ELSE 0
        END as percentage
    FROM learners_profiles lp
    LEFT JOIN departments d ON d.id = lp.department_id
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
      AND (filter_admission_year_ids IS NULL OR lp.admission_year_id = ANY(filter_admission_year_ids))
      AND lp.department_id IS NOT NULL
    GROUP BY lp.department_id, d.department_name
    ORDER BY count DESC;
END;
$function$;

DROP FUNCTION IF EXISTS public.get_learners_distribution_by_program(
  uuid[], uuid, uuid, uuid, uuid, uuid, uuid, text[], text, boolean, timestamptz, timestamptz);

CREATE FUNCTION public.get_learners_distribution_by_program(
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
    filter_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone,
    filter_admission_year_ids uuid[] DEFAULT NULL::uuid[]
)
RETURNS TABLE(id uuid, name text, count bigint, percentage numeric)
LANGUAGE plpgsql
AS $function$
DECLARE
    total_count bigint;
BEGIN
    -- Get total count
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
      AND (filter_date_to IS NULL OR lp.created_at <= filter_date_to)
      AND (filter_admission_year_ids IS NULL OR lp.admission_year_id = ANY(filter_admission_year_ids));

    RETURN QUERY
    SELECT
        lp.program_id as id,
        COALESCE(p.program_name, 'Unknown')::text as name,
        COUNT(*)::bigint as count,
        CASE
            WHEN total_count > 0 THEN ROUND((COUNT(*)::numeric / total_count::numeric) * 100, 2)
            ELSE 0
        END as percentage
    FROM learners_profiles lp
    LEFT JOIN programs p ON p.id = lp.program_id
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
      AND (filter_admission_year_ids IS NULL OR lp.admission_year_id = ANY(filter_admission_year_ids))
      AND lp.program_id IS NOT NULL
    GROUP BY lp.program_id, p.program_name
    ORDER BY count DESC;
END;
$function$;

DROP FUNCTION IF EXISTS public.get_learners_distribution_by_gender(
  uuid[], uuid, uuid, uuid, uuid, uuid, uuid, text[], text, boolean, timestamptz, timestamptz);

CREATE FUNCTION public.get_learners_distribution_by_gender(
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
    filter_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone,
    filter_admission_year_ids uuid[] DEFAULT NULL::uuid[]
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
      AND (filter_date_to IS NULL OR lp.created_at <= filter_date_to)
      AND (filter_admission_year_ids IS NULL OR lp.admission_year_id = ANY(filter_admission_year_ids));

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
      AND (filter_admission_year_ids IS NULL OR lp.admission_year_id = ANY(filter_admission_year_ids))
    -- `lp.gender IS NOT NULL` deliberately removed: it was TRUE for the 59 ''
    -- rows (so they rendered unlabelled) and excluded NULLs from the slices
    -- while total_count still counted them. Both now land in 'Unknown'.
    GROUP BY COALESCE(NULLIF(btrim(lp.gender), ''), 'Unknown')
    ORDER BY count DESC;
END;
$function$;
