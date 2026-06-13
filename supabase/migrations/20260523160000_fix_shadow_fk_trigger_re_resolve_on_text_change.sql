-- ============================================================================
-- 20260523160000 — Fix shadow-FK trigger: re-resolve on TEXT change
-- ============================================================================
-- Bug: trg_learners_profiles_sync_shadow_fks only populated FK columns when
-- they were NULL. On UPDATE (user edits accommodation_type from DAY SCHOLAR
-- to HOSTEL), the OLD FK carried through because it wasn't NULL, leaving the
-- FK stale. 80 learners affected (49 HOSTEL→Day Scholar, 25 DAY SCHOLAR→
-- Hostel, 6 variant spellings).
--
-- Fix: Re-resolve the FK whenever the TEXT value actually changes, not just
-- when the FK is NULL. Same logic applies to quota_id and community_category_id.
-- ============================================================================

-- 1. Fix the trigger function
CREATE OR REPLACE FUNCTION public.learners_profiles_sync_shadow_fks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Quota: resolve on INSERT (FK NULL) or UPDATE when text changed
    IF NEW.quota IS NOT NULL AND TRIM(NEW.quota) <> ''
       AND (NEW.quota_id IS NULL
            OR (TG_OP = 'UPDATE' AND NEW.quota IS DISTINCT FROM OLD.quota))
    THEN
        SELECT id INTO NEW.quota_id
          FROM public.quotas
         WHERE LOWER(code) = LOWER(TRIM(NEW.quota))
            OR LOWER(name) = LOWER(TRIM(NEW.quota))
         LIMIT 1;
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

-- 2. Correct the 80 mismatched accommodation FK rows
UPDATE public.learners_profiles lp
   SET accommodation_type_id = a.id
  FROM public.accommodation_types a
 WHERE lp.accommodation_type IS NOT NULL
   AND TRIM(lp.accommodation_type) <> ''
   AND lp.institution_id IS NOT NULL
   AND a.institution_id = lp.institution_id
   AND (LOWER(a.code) = LOWER(TRIM(lp.accommodation_type))
        OR LOWER(a.name) = LOWER(TRIM(lp.accommodation_type))
        OR LOWER(REPLACE(a.code, '_', ' ')) = LOWER(TRIM(lp.accommodation_type))
        OR LOWER(REPLACE(a.name, ' ', '')) = LOWER(REPLACE(TRIM(lp.accommodation_type), ' ', '')))
   AND lp.accommodation_type_id IS DISTINCT FROM a.id;
