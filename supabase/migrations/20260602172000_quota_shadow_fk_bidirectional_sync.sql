-- ============================================================================
-- 20260602172000 — Quota shadow-FK: make the sync bidirectional (FK = source
-- of truth), as a transition bridge while quota_id replaces the quota TEXT
-- column across the app (the column is dropped in a later phase).
-- ============================================================================
-- Internal enquiry / create-learner forms now write quota_id directly (a
-- quotas-backed dropdown) and no longer write the quota TEXT. Un-migrated read
-- sites (detail views, exports, public API) still read the TEXT, so we keep it
-- populated by DERIVING it from quota_id. Legacy TEXT-only writers (bulk import,
-- public API) still get their FK resolved from the text — but only when the FK
-- itself didn't change in the same statement. Result: the two columns can never
-- drift again (root cause of the 2026-06-02 quota/fee-structure mismatch).
--
-- Also adds quota_id to the trigger's UPDATE OF column list so a FK-only update
-- (the new form path) actually fires the trigger.
--
-- community / accommodation branches are unchanged from 20260523160000.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.learners_profiles_sync_shadow_fks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Quota — bidirectional, FK is the source of truth.
    -- (1) Legacy TEXT-only writers: resolve text -> FK, but only when the FK
    --     did not itself change in this statement.
    IF NEW.quota IS NOT NULL AND TRIM(NEW.quota) <> ''
       AND (NEW.quota_id IS NULL
            OR (TG_OP = 'UPDATE'
                AND NEW.quota IS DISTINCT FROM OLD.quota
                AND NEW.quota_id IS NOT DISTINCT FROM OLD.quota_id))
    THEN
        SELECT id INTO NEW.quota_id
          FROM public.quotas
         WHERE LOWER(code) = LOWER(TRIM(NEW.quota))
            OR LOWER(name) = LOWER(TRIM(NEW.quota))
         LIMIT 1;
    END IF;

    -- (2) Whenever a quota FK is present, re-derive the TEXT mirror from it so
    --     the columns can never diverge (transition shim; removed with the
    --     column in a later phase).
    IF NEW.quota_id IS NOT NULL THEN
        SELECT name INTO NEW.quota FROM public.quotas WHERE id = NEW.quota_id;
    END IF;

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

-- Recreate trigger with quota_id added to the UPDATE OF column list so a
-- FK-only update (the new form write path) fires the sync.
DROP TRIGGER IF EXISTS trg_learners_profiles_sync_shadow_fks ON public.learners_profiles;
CREATE TRIGGER trg_learners_profiles_sync_shadow_fks
    BEFORE INSERT OR UPDATE OF quota, quota_id, community, accommodation_type, institution_id
    ON public.learners_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.learners_profiles_sync_shadow_fks();
