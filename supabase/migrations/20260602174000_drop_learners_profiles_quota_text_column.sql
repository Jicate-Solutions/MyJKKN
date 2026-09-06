-- ============================================================================
-- 20260602174000 — Drop learners_profiles.quota TEXT column (FK-only)
-- ============================================================================
-- Final step of the quota TEXT -> quota_id migration. All write paths persist
-- quota_id; all reads derive the name from the FK (quotas). Two objects
-- depended on the column and are updated first (else DROP COLUMN is blocked):
--   1. view vw_learners_profile_fee_backfill_status (exposed quota_text)
--   2. trigger trg_learners_profiles_sync_shadow_fks (UPDATE OF quota + body)
-- ============================================================================

-- 1. View: derive quota_text from quota_id (was lp.quota) so it no longer
--    depends on the column. Output shape unchanged.
CREATE OR REPLACE VIEW public.vw_learners_profile_fee_backfill_status AS
 WITH base AS (
         SELECT lp.id AS learner_id,
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
            lp.community AS community_text,
            ( SELECT q.name FROM public.quotas q WHERE q.id = lp.quota_id ) AS quota_text,
            lp.accommodation_type AS accommodation_type_text,
            lp.created_at,
            lp.updated_at,
            array_remove(ARRAY[
                CASE WHEN lp.program_id IS NULL THEN 'program_id'::text ELSE NULL::text END,
                CASE WHEN lp.admission_year_id IS NULL THEN 'admission_year_id'::text ELSE NULL::text END,
                CASE WHEN lp.degree_id IS NULL THEN 'degree_id'::text ELSE NULL::text END,
                CASE WHEN lp.department_id IS NULL THEN 'department_id'::text ELSE NULL::text END,
                CASE WHEN lp.quota_id IS NULL THEN 'quota_id'::text ELSE NULL::text END,
                CASE WHEN lp.accommodation_type_id IS NULL THEN 'accommodation_type_id'::text ELSE NULL::text END,
                CASE WHEN lp.community_category_id IS NULL THEN 'community_category_id'::text ELSE NULL::text END,
                CASE WHEN lp.institution_id IS NULL THEN 'institution_id'::text ELSE NULL::text END], NULL::text) AS missing_fields
           FROM learners_profiles lp
          WHERE (lp.lifecycle_status = ANY (ARRAY['enquiry'::lifecycle_status, 'enquiry_submitted'::lifecycle_status])) AND lp.legacy_fee_mode = true
        ), strict_matches AS (
         SELECT b_1.learner_id,
            count(*) AS cnt,
            array_agg(afs.id ORDER BY afs.updated_at DESC NULLS LAST) AS all_ids
           FROM base b_1
             JOIN admission_fee_structures afs ON afs.institution_id = b_1.institution_id AND afs.degree_id = b_1.degree_id AND afs.department_id = b_1.department_id AND afs.programme_id = b_1.program_id AND afs.quota_id = b_1.quota_id AND afs.accommodation_type_id = b_1.accommodation_type_id AND afs.admission_year_id = b_1.admission_year_id AND afs.status = 'active'::text
          WHERE (EXISTS ( SELECT 1 FROM admission_fee_structure_communities j WHERE j.fee_structure_id = afs.id AND j.community_category_id = b_1.community_category_id))
          GROUP BY b_1.learner_id
        ), relaxed_matches AS (
         SELECT b_1.learner_id,
            count(*) AS cnt,
            array_agg(afs.id ORDER BY afs.updated_at DESC NULLS LAST) AS all_ids
           FROM base b_1
             JOIN admission_fee_structures afs ON afs.institution_id = b_1.institution_id AND afs.degree_id = b_1.degree_id AND afs.department_id = b_1.department_id AND afs.programme_id = b_1.program_id AND afs.accommodation_type_id = b_1.accommodation_type_id AND afs.admission_year_id = b_1.admission_year_id AND afs.status = 'active'::text
          WHERE (EXISTS ( SELECT 1 FROM admission_fee_structure_communities j WHERE j.fee_structure_id = afs.id AND j.community_category_id = b_1.community_category_id))
          GROUP BY b_1.learner_id
        )
 SELECT b.learner_id,
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
    COALESCE(sm.cnt, 0::bigint) AS strict_match_count,
    COALESCE(rm.cnt, 0::bigint) AS relaxed_match_count,
        CASE
            WHEN COALESCE(array_length(b.missing_fields, 1), 0) > 0 THEN 'missing_fields'::text
            WHEN COALESCE(sm.cnt, 0::bigint) = 1 THEN 'tier1_ready'::text
            WHEN COALESCE(sm.cnt, 0::bigint) = 0 AND COALESCE(rm.cnt, 0::bigint) = 1 THEN 'tier2_ready'::text
            WHEN COALESCE(sm.cnt, 0::bigint) > 1 THEN 'ambiguous_strict'::text
            WHEN COALESCE(rm.cnt, 0::bigint) > 1 THEN 'ambiguous_relaxed'::text
            WHEN COALESCE(rm.cnt, 0::bigint) = 0 THEN 'no_structure'::text
            ELSE 'unclassified'::text
        END AS resolution_status,
        CASE
            WHEN COALESCE(sm.cnt, 0::bigint) = 1 THEN sm.all_ids[1]
            WHEN COALESCE(sm.cnt, 0::bigint) = 0 AND COALESCE(rm.cnt, 0::bigint) = 1 THEN rm.all_ids[1]
            ELSE NULL::uuid
        END AS matched_structure_id,
        CASE
            WHEN COALESCE(sm.cnt, 0::bigint) > 1 THEN sm.all_ids
            WHEN COALESCE(sm.cnt, 0::bigint) = 0 AND COALESCE(rm.cnt, 0::bigint) > 1 THEN rm.all_ids
            ELSE NULL::uuid[]
        END AS candidate_structure_ids,
    b.created_at,
    b.updated_at
   FROM base b
     LEFT JOIN strict_matches sm ON sm.learner_id = b.learner_id
     LEFT JOIN relaxed_matches rm ON rm.learner_id = b.learner_id;

-- 2. Trigger: drop the quota branch (text<->FK); keep community + accommodation.
--    Also drop quota / quota_id from the UPDATE OF list (they depend on the col).
CREATE OR REPLACE FUNCTION public.learners_profiles_sync_shadow_fks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Community: resolve on INSERT (FK NULL) or UPDATE when text changed
    IF NEW.community IS NOT NULL AND TRIM(NEW.community) <> ''
       AND (NEW.community_category_id IS NULL
            OR (TG_OP = 'UPDATE' AND NEW.community IS DISTINCT FROM OLD.community))
    THEN
        SELECT id INTO NEW.community_category_id
          FROM public.community_categories
         WHERE LOWER(code) = LOWER(TRIM(NEW.community))
            OR LOWER(name) = LOWER(TRIM(NEW.community))
         LIMIT 1;
    END IF;

    -- Accommodation: resolve on INSERT (FK NULL) or UPDATE when text changed
    IF NEW.accommodation_type IS NOT NULL AND TRIM(NEW.accommodation_type) <> ''
       AND NEW.institution_id IS NOT NULL
       AND (NEW.accommodation_type_id IS NULL
            OR (TG_OP = 'UPDATE' AND NEW.accommodation_type IS DISTINCT FROM OLD.accommodation_type))
    THEN
        SELECT id INTO NEW.accommodation_type_id
          FROM public.accommodation_types
         WHERE institution_id = NEW.institution_id
           AND (LOWER(code) = LOWER(TRIM(NEW.accommodation_type))
                OR LOWER(name) = LOWER(TRIM(NEW.accommodation_type))
                OR LOWER(REPLACE(code, '_', ' ')) = LOWER(TRIM(NEW.accommodation_type))
                OR LOWER(REPLACE(name, ' ', '')) = LOWER(REPLACE(TRIM(NEW.accommodation_type), ' ', '')))
         LIMIT 1;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.learners_profiles_sync_shadow_fks() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_learners_profiles_sync_shadow_fks ON public.learners_profiles;
CREATE TRIGGER trg_learners_profiles_sync_shadow_fks
    BEFORE INSERT OR UPDATE OF community, accommodation_type, institution_id
    ON public.learners_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.learners_profiles_sync_shadow_fks();

-- 3. Drop the column. quota_id (FK -> quotas) is now the sole source of truth.
ALTER TABLE public.learners_profiles DROP COLUMN quota;
