-- Phase 1 of the warehouse -> operating-store distribution feature.
--
-- Makes "warehouse" a PER-INSTITUTION concept. Until now
-- idx_ims_stores_one_central_supply was a global partial unique index on
-- (is_central_supply_store) WHERE is_central_supply_store = true, which allowed
-- exactly ONE central store in the entire system. The model we want is one
-- warehouse per institution: inventory enters the institution through its
-- warehouse (bulk upload / GRN / procurement) and is forwarded from there to
-- that institution's operating stores.
--
-- We deliberately REUSE is_central_supply_store rather than adding the
-- is_main_store column proposed in docs/centralized-store/PLAN-reconciled-v3.md
-- (never applied) — two near-synonymous flags would be worse than one.

BEGIN;

-- 1. Global singleton -> one warehouse per institution.
DROP INDEX IF EXISTS public.idx_ims_stores_one_central_supply;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ims_stores_one_warehouse_per_institution
  ON public.ims_stores (institution_id)
  WHERE is_central_supply_store = true;

-- 2. A warehouse without an institution is meaningless, and NULL institution_id
--    would also slip past the partial unique index above (NULLs compare distinct).
ALTER TABLE public.ims_stores
  DROP CONSTRAINT IF EXISTS ims_stores_warehouse_requires_institution;

ALTER TABLE public.ims_stores
  ADD CONSTRAINT ims_stores_warehouse_requires_institution
  CHECK (is_central_supply_store = false OR institution_id IS NOT NULL);

COMMENT ON COLUMN public.ims_stores.is_central_supply_store IS
  'This store is its institution''s warehouse: inventory enters here (bulk upload, GRN, '
  'procurement) and is forwarded to the institution''s operating stores. At most one per '
  'institution, enforced by idx_ims_stores_one_warehouse_per_institution.';

-- 3. Promote the existing stores in place (no stock migration — each store simply
--    BECOMES its institution's warehouse, keeping everything it already holds).
--    Predicate-based rather than hardcoded ids: the oldest active store of each
--    institution becomes that institution's warehouse. Idempotent.
--
--    Only institutions with NO warehouse at all are promoted. Without that guard
--    an institution whose existing central store is not its oldest would get a
--    SECOND one, violating idx_ims_stores_one_warehouse_per_institution and
--    aborting this migration — which would never show up on the environment it
--    was written against, only on a fresh or differently-ordered one.
--
--    The guard deliberately does NOT filter on is_active: the unique index is
--    ON (institution_id) WHERE is_central_supply_store = true, with no activity
--    predicate, so even a deactivated warehouse still occupies the slot.
UPDATE public.ims_stores s
   SET is_central_supply_store = true,
       updated_at = now()
 WHERE s.is_active
   AND s.institution_id IS NOT NULL
   AND s.is_central_supply_store = false
   AND NOT EXISTS (
         SELECT 1
           FROM public.ims_stores w
          WHERE w.institution_id = s.institution_id
            AND w.is_central_supply_store
       )
   AND s.id = (
         SELECT x.id
           FROM public.ims_stores x
          WHERE x.institution_id = s.institution_id
            AND x.is_active
          ORDER BY x.created_at, x.id
          LIMIT 1
       );

COMMIT;
