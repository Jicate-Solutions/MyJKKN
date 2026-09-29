-- ims_unit_conversions: make the RLS policies satisfiable for store-scoped and
-- global conversions.
--
-- The four policies already existed and were PERMISSIVE for `authenticated`,
-- but every one scoped the row through its ITEM. item_id is NULLABLE by design
-- (an item-less conversion is a store-wide or global rule), and for a NULL
-- item_id that EXISTS matches nothing, so the insert was always rejected with
-- "new row violates row-level security policy". The policies also ignored
-- store_id entirely. This scopes a row by whichever owner it actually has.

CREATE OR REPLACE FUNCTION public.ims_unit_conversion_in_scope(
    p_item_id  UUID,
    p_store_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
    SELECT CASE
        -- Item-scoped: unchanged from the original policy.
        WHEN p_item_id IS NOT NULL THEN EXISTS (
            SELECT 1
              FROM public.ims_items i
             WHERE i.id = p_item_id
               AND (
                     i.institution_id IN (SELECT public.ims_accessible_institution_ids())
                     OR (SELECT public.get_current_user_role()) = 'super_admin'
                   )
        )
        -- Store-scoped: the case the old policies had no branch for.
        WHEN p_store_id IS NOT NULL THEN EXISTS (
            SELECT 1
              FROM public.ims_stores s
             WHERE s.id = p_store_id
               AND (
                     s.institution_id IN (SELECT public.ims_accessible_institution_ids())
                     OR (SELECT public.get_current_user_role()) = 'super_admin'
                   )
        )
        -- Neither: a global rule, readable by any authenticated user. Writes to
        -- this case are gated separately in the policies below.
        ELSE TRUE
    END;
$fn$;

COMMENT ON FUNCTION public.ims_unit_conversion_in_scope(UUID, UUID) IS
'Tenant scope for one ims_unit_conversions row. Resolves the row''s institution through its item when item_id is set, else through its store when store_id is set, else treats the row as a global rule. Returns TRUE when the current user may see that scope. Used by all four ims_unit_conversions RLS policies.';

REVOKE ALL ON FUNCTION public.ims_unit_conversion_in_scope(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ims_unit_conversion_in_scope(UUID, UUID) TO authenticated;

ALTER TABLE public.ims_unit_conversions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ims_unit_conversions_select" ON public.ims_unit_conversions;
DROP POLICY IF EXISTS "ims_unit_conversions_insert" ON public.ims_unit_conversions;
DROP POLICY IF EXISTS "ims_unit_conversions_update" ON public.ims_unit_conversions;
DROP POLICY IF EXISTS "ims_unit_conversions_delete" ON public.ims_unit_conversions;
DROP POLICY IF EXISTS "Authenticated users can read ims_unit_conversions"   ON public.ims_unit_conversions;
DROP POLICY IF EXISTS "Authenticated users can insert ims_unit_conversions" ON public.ims_unit_conversions;
DROP POLICY IF EXISTS "Authenticated users can update ims_unit_conversions" ON public.ims_unit_conversions;
DROP POLICY IF EXISTS "Authenticated users can delete ims_unit_conversions" ON public.ims_unit_conversions;

CREATE POLICY "ims_unit_conversions_select"
    ON public.ims_unit_conversions
    FOR SELECT TO authenticated
    USING (public.ims_unit_conversion_in_scope(item_id, store_id));

-- Writes carry one extra condition beyond visibility: a row owned by neither an
-- item nor a store is reference data every institution reads, so creating one is
-- restricted to super_admin. The dialog supplies store_id from the active store
-- context, so the ordinary path does not depend on this branch.
CREATE POLICY "ims_unit_conversions_insert"
    ON public.ims_unit_conversions
    FOR INSERT TO authenticated
    WITH CHECK (
        public.ims_unit_conversion_in_scope(item_id, store_id)
        AND (
              item_id IS NOT NULL
              OR store_id IS NOT NULL
              OR (SELECT public.get_current_user_role()) = 'super_admin'
            )
    );

-- USING gates which rows may be targeted; WITH CHECK gates what they may become,
-- so a row cannot be moved out of the caller's scope by an UPDATE.
CREATE POLICY "ims_unit_conversions_update"
    ON public.ims_unit_conversions
    FOR UPDATE TO authenticated
    USING (public.ims_unit_conversion_in_scope(item_id, store_id))
    WITH CHECK (
        public.ims_unit_conversion_in_scope(item_id, store_id)
        AND (
              item_id IS NOT NULL
              OR store_id IS NOT NULL
              OR (SELECT public.get_current_user_role()) = 'super_admin'
            )
    );

CREATE POLICY "ims_unit_conversions_delete"
    ON public.ims_unit_conversions
    FOR DELETE TO authenticated
    USING (
        public.ims_unit_conversion_in_scope(item_id, store_id)
        AND (
              item_id IS NOT NULL
              OR store_id IS NOT NULL
              OR (SELECT public.get_current_user_role()) = 'super_admin'
            )
    );

REVOKE ALL ON TABLE public.ims_unit_conversions FROM anon;