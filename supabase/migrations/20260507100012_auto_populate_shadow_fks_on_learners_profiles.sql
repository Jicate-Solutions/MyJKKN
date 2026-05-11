-- ============================================================================
-- 20260507100012 — Auto-populate quota_id / community_category_id /
-- accommodation_type_id on learners_profiles INSERT or UPDATE based on the
-- existing TEXT columns (quota / community / accommodation_type).
-- ============================================================================
-- Plan 1 introduced shadow-FK columns and a one-time backfill from observed
-- TEXT values. New enquiries saved through the existing form do not write the
-- FK columns — finance-details.tsx then can't resolve the matrix and the
-- "auto-populate fees from matrix" UX is silently broken.
--
-- This trigger derives the FK ids by case-insensitive match against the
-- canonical lookup tables' code OR name, on every INSERT or UPDATE of the
-- TEXT columns. Skips the work when the FK is already explicitly set
-- (so the form/services that DO write FKs aren't overridden).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.learners_profiles_sync_shadow_fks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.quota_id IS NULL AND NEW.quota IS NOT NULL AND TRIM(NEW.quota) <> '' THEN
        SELECT id INTO NEW.quota_id
          FROM public.quotas
         WHERE LOWER(code) = LOWER(TRIM(NEW.quota))
            OR LOWER(name) = LOWER(TRIM(NEW.quota))
         LIMIT 1;
    END IF;

    IF NEW.community_category_id IS NULL AND NEW.community IS NOT NULL AND TRIM(NEW.community) <> '' THEN
        SELECT id INTO NEW.community_category_id
          FROM public.community_categories
         WHERE LOWER(code) = LOWER(TRIM(NEW.community))
            OR LOWER(name) = LOWER(TRIM(NEW.community))
         LIMIT 1;
    END IF;

    IF NEW.accommodation_type_id IS NULL AND NEW.accommodation_type IS NOT NULL AND TRIM(NEW.accommodation_type) <> '' AND NEW.institution_id IS NOT NULL THEN
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
    BEFORE INSERT OR UPDATE OF quota, community, accommodation_type, institution_id
    ON public.learners_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.learners_profiles_sync_shadow_fks();

-- One-time backfill for existing rows that have TEXT but missing FK
UPDATE public.learners_profiles lp
   SET quota_id = q.id
  FROM public.quotas q
 WHERE lp.quota_id IS NULL
   AND lp.quota IS NOT NULL AND TRIM(lp.quota) <> ''
   AND (LOWER(q.code) = LOWER(TRIM(lp.quota)) OR LOWER(q.name) = LOWER(TRIM(lp.quota)));

UPDATE public.learners_profiles lp
   SET community_category_id = c.id
  FROM public.community_categories c
 WHERE lp.community_category_id IS NULL
   AND lp.community IS NOT NULL AND TRIM(lp.community) <> ''
   AND (LOWER(c.code) = LOWER(TRIM(lp.community)) OR LOWER(c.name) = LOWER(TRIM(lp.community)));

UPDATE public.learners_profiles lp
   SET accommodation_type_id = a.id
  FROM public.accommodation_types a
 WHERE lp.accommodation_type_id IS NULL
   AND lp.accommodation_type IS NOT NULL AND TRIM(lp.accommodation_type) <> ''
   AND a.institution_id = lp.institution_id
   AND (LOWER(a.code) = LOWER(TRIM(lp.accommodation_type))
        OR LOWER(a.name) = LOWER(TRIM(lp.accommodation_type))
        OR LOWER(REPLACE(a.code, '_', ' ')) = LOWER(TRIM(lp.accommodation_type))
        OR LOWER(REPLACE(a.name, ' ', '')) = LOWER(REPLACE(TRIM(lp.accommodation_type), ' ', '')));
