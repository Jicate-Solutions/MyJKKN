-- Phase 1.4: Realign vw_learners_profile_fee_backfill_status to match the new
-- entry-point statuses. After 20260520120100 migrated 'admitted' -> 'enquiry',
-- the view's WHERE clause must follow or the "Fees Setup Pending" tab returns
-- zero rows. Including 'enquiry_submitted' so post-form learners still appear.

CREATE OR REPLACE VIEW public.vw_learners_profile_fee_backfill_status
WITH (security_invoker = true)
AS
WITH base AS (
    SELECT
        lp.id                    AS learner_id,
        lp.application_id,
        lp.first_name,
        lp.last_name,
        lp.student_email,
        lp.student_mobile,
        lp.lifecycle_status,
        lp.legacy_fee_mode,
        lp.fee_items,
        lp.institution_id,
        lp.degree_id,
        lp.department_id,
        lp.program_id,
        lp.quota_id,
        lp.accommodation_type_id,
        lp.community_category_id,
        lp.admission_year_id,
        lp.community              AS community_text,
        lp.quota                  AS quota_text,
        lp.accommodation_type     AS accommodation_type_text,
        lp.created_at,
        lp.updated_at,
        ARRAY_REMOVE(ARRAY[
            CASE WHEN lp.program_id            IS NULL THEN 'program_id' END,
            CASE WHEN lp.admission_year_id     IS NULL THEN 'admission_year_id' END,
            CASE WHEN lp.degree_id             IS NULL THEN 'degree_id' END,
            CASE WHEN lp.department_id         IS NULL THEN 'department_id' END,
            CASE WHEN lp.quota_id              IS NULL THEN 'quota_id' END,
            CASE WHEN lp.accommodation_type_id IS NULL THEN 'accommodation_type_id' END,
            CASE WHEN lp.community_category_id IS NULL THEN 'community_category_id' END,
            CASE WHEN lp.institution_id        IS NULL THEN 'institution_id' END
        ], NULL) AS missing_fields
    FROM public.learners_profiles lp
    WHERE lp.lifecycle_status IN ('enquiry', 'enquiry_submitted')   -- 2026-05-20: was 'admitted'
      AND lp.legacy_fee_mode  = true
),
strict_matches AS (
    SELECT
        b.learner_id,
        COUNT(*)                                                 AS cnt,
        ARRAY_AGG(afs.id ORDER BY afs.updated_at DESC NULLS LAST) AS all_ids
    FROM base b
    JOIN public.admission_fee_structures afs
      ON afs.institution_id        = b.institution_id
     AND afs.degree_id             = b.degree_id
     AND afs.department_id         = b.department_id
     AND afs.programme_id          = b.program_id
     AND afs.quota_id              = b.quota_id
     AND afs.accommodation_type_id = b.accommodation_type_id
     AND afs.admission_year_id     = b.admission_year_id
     AND afs.status                = 'active'
    WHERE EXISTS (
            SELECT 1
              FROM public.admission_fee_structure_communities j
             WHERE j.fee_structure_id      = afs.id
               AND j.community_category_id = b.community_category_id
        )
    GROUP BY b.learner_id
),
relaxed_matches AS (
    SELECT
        b.learner_id,
        COUNT(*)                                                 AS cnt,
        ARRAY_AGG(afs.id ORDER BY afs.updated_at DESC NULLS LAST) AS all_ids
    FROM base b
    JOIN public.admission_fee_structures afs
      ON afs.institution_id        = b.institution_id
     AND afs.degree_id             = b.degree_id
     AND afs.department_id         = b.department_id
     AND afs.programme_id          = b.program_id
     AND afs.accommodation_type_id = b.accommodation_type_id
     AND afs.admission_year_id     = b.admission_year_id
     AND afs.status                = 'active'
    WHERE EXISTS (
            SELECT 1
              FROM public.admission_fee_structure_communities j
             WHERE j.fee_structure_id      = afs.id
               AND j.community_category_id = b.community_category_id
        )
    GROUP BY b.learner_id
)
SELECT
    b.learner_id,
    b.application_id,
    b.first_name,
    b.last_name,
    b.student_email,
    b.student_mobile,
    b.lifecycle_status,
    b.legacy_fee_mode,
    b.fee_items,
    b.institution_id,
    b.degree_id,
    b.department_id,
    b.program_id,
    b.quota_id,
    b.accommodation_type_id,
    b.community_category_id,
    b.admission_year_id,
    b.community_text,
    b.quota_text,
    b.accommodation_type_text,
    b.missing_fields,
    COALESCE(sm.cnt, 0) AS strict_match_count,
    COALESCE(rm.cnt, 0) AS relaxed_match_count,
    CASE
        WHEN COALESCE(array_length(b.missing_fields, 1), 0) > 0 THEN 'missing_fields'
        WHEN COALESCE(sm.cnt, 0) = 1 THEN 'tier1_ready'
        WHEN COALESCE(sm.cnt, 0) = 0 AND COALESCE(rm.cnt, 0) = 1 THEN 'tier2_ready'
        WHEN COALESCE(sm.cnt, 0) > 1 THEN 'ambiguous_strict'
        WHEN COALESCE(rm.cnt, 0) > 1 THEN 'ambiguous_relaxed'
        WHEN COALESCE(rm.cnt, 0) = 0 THEN 'no_structure'
        ELSE 'unclassified'
    END AS resolution_status,
    CASE
        WHEN COALESCE(sm.cnt, 0) = 1 THEN sm.all_ids[1]
        WHEN COALESCE(sm.cnt, 0) = 0 AND COALESCE(rm.cnt, 0) = 1 THEN rm.all_ids[1]
        ELSE NULL
    END AS matched_structure_id,
    CASE
        WHEN COALESCE(sm.cnt, 0) > 1 THEN sm.all_ids
        WHEN COALESCE(sm.cnt, 0) = 0 AND COALESCE(rm.cnt, 0) > 1 THEN rm.all_ids
        ELSE NULL
    END AS candidate_structure_ids,
    b.created_at,
    b.updated_at
FROM base b
LEFT JOIN strict_matches  sm ON sm.learner_id = b.learner_id
LEFT JOIN relaxed_matches rm ON rm.learner_id = b.learner_id;

COMMENT ON VIEW public.vw_learners_profile_fee_backfill_status IS
    'Classification of pre-account (enquiry/enquiry_submitted) + legacy_fee_mode learners_profiles by fee-structure resolvability. Powers the "Fees Setup Pending" tab and the bulk-adopt migration. RLS-aware (security_invoker). Realigned 2026-05-20 from lifecycle_status=admitted.';

GRANT SELECT ON public.vw_learners_profile_fee_backfill_status TO authenticated;
