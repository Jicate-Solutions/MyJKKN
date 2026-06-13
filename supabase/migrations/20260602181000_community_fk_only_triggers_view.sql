-- ============================================================================
-- Community FK-only — triggers + view (prep for dropping the community column)
-- ============================================================================
-- Drop the community branch from both shadow triggers, derive community_text in
-- the fee-backfill view from the FK, and drop the community NOT NULL (nothing
-- fills the text anymore; the column is dropped in 20260602183000).
-- ============================================================================

-- 1. shadow-FK trigger: accommodation only (community branch removed; recreate
--    trigger without `community` in UPDATE OF — it depends on the column).
CREATE OR REPLACE FUNCTION public.learners_profiles_sync_shadow_fks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
    BEFORE INSERT OR UPDATE OF accommodation_type, institution_id
    ON public.learners_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.learners_profiles_sync_shadow_fks();

-- 2. community/caste FK→text trigger: caste only (community branch removed).
CREATE OR REPLACE FUNCTION public.sync_learner_community_caste_text()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
begin
  if new.caste_id is not null then
    select c.name into new.caste from public.castes c where c.id = new.caste_id;
  end if;
  return new;
end;
$function$;

-- 3. fee-backfill view: derive community_text from community_category_id.
CREATE OR REPLACE VIEW public.vw_learners_profile_fee_backfill_status AS
 WITH base AS (
         SELECT lp.id AS learner_id, lp.application_id, lp.first_name, lp.last_name,
            lp.student_email, lp.student_mobile, lp.lifecycle_status, lp.legacy_fee_mode,
            lp.fee_items, lp.institution_id, lp.degree_id, lp.department_id, lp.program_id,
            lp.quota_id, lp.accommodation_type_id, lp.community_category_id, lp.admission_year_id,
            ( SELECT cc.code FROM community_categories cc WHERE cc.id = lp.community_category_id ) AS community_text,
            ( SELECT q.name FROM quotas q WHERE q.id = lp.quota_id ) AS quota_text,
            lp.accommodation_type AS accommodation_type_text,
            lp.created_at, lp.updated_at,
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
         SELECT b_1.learner_id, count(*) AS cnt, array_agg(afs.id ORDER BY afs.updated_at DESC NULLS LAST) AS all_ids
           FROM base b_1
             JOIN admission_fee_structures afs ON afs.institution_id = b_1.institution_id AND afs.degree_id = b_1.degree_id AND afs.department_id = b_1.department_id AND afs.programme_id = b_1.program_id AND afs.quota_id = b_1.quota_id AND afs.accommodation_type_id = b_1.accommodation_type_id AND afs.admission_year_id = b_1.admission_year_id AND afs.status = 'active'::text
          WHERE (EXISTS ( SELECT 1 FROM admission_fee_structure_communities j WHERE j.fee_structure_id = afs.id AND j.community_category_id = b_1.community_category_id))
          GROUP BY b_1.learner_id
        ), relaxed_matches AS (
         SELECT b_1.learner_id, count(*) AS cnt, array_agg(afs.id ORDER BY afs.updated_at DESC NULLS LAST) AS all_ids
           FROM base b_1
             JOIN admission_fee_structures afs ON afs.institution_id = b_1.institution_id AND afs.degree_id = b_1.degree_id AND afs.department_id = b_1.department_id AND afs.programme_id = b_1.program_id AND afs.accommodation_type_id = b_1.accommodation_type_id AND afs.admission_year_id = b_1.admission_year_id AND afs.status = 'active'::text
          WHERE (EXISTS ( SELECT 1 FROM admission_fee_structure_communities j WHERE j.fee_structure_id = afs.id AND j.community_category_id = b_1.community_category_id))
          GROUP BY b_1.learner_id
        )
 SELECT b.learner_id, b.application_id, b.first_name, b.last_name, b.student_email,
    b.student_mobile, b.lifecycle_status, b.legacy_fee_mode, b.fee_items,
    b.institution_id, b.degree_id, b.department_id, b.program_id, b.quota_id,
    b.accommodation_type_id, b.community_category_id, b.admission_year_id,
    b.community_text, b.quota_text, b.accommodation_type_text, b.missing_fields,
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
    b.created_at, b.updated_at
   FROM base b
     LEFT JOIN strict_matches sm ON sm.learner_id = b.learner_id
     LEFT JOIN relaxed_matches rm ON rm.learner_id = b.learner_id;

-- 4. community text no longer populated by any trigger; drop NOT NULL so inserts
--    (which write only community_category_id) succeed until the column is dropped.
ALTER TABLE public.learners_profiles ALTER COLUMN community DROP NOT NULL;
