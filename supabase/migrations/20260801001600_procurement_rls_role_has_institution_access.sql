-- Migration: 20260801001600_procurement_rls_role_has_institution_access
-- Purpose:  Fix bug where a user with cross-institution access (via
--           user_institution_access grant, or a custom_roles.institution_scope='all'
--           role) sees ZERO rows on every Procurement page after switching the
--           Institution filter (components/procurement/institution-filter.tsx) to
--           a non-primary institution — even for data that genuinely exists there
--           (e.g. PR-260715-00001 / RFQ-260715-00001 under JKKN College of Pharmacy).
--
-- ROOT CAUSE
--   Every procurement table's RLS policy (added 2026-08-01 across 6 migrations)
--   used an ad-hoc inline predicate:
--     institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
--     OR public.get_current_user_role() = 'super_admin'
--   This only allows a row if it matches the viewer's single primary
--   profiles.institution_id, or the viewer is literally role='super_admin'. It does
--   NOT consult user_institution_access grants or institution_scope='all' roles —
--   both of which the app's own InstitutionFilter component (and
--   useUserInstitutionAccess / UserInstitutionAccessService) already treat as
--   granting access, letting such a user switch the filter to a non-primary
--   institution the RLS layer then silently blocks (0 rows, no error).
--
-- FIX
--   Replace the inline predicate with public.role_has_institution_access(institution_id)
--   everywhere, per the established codebase pattern (see 20260521_role_has_institution_
--   access_cas_aware.sql and 20260427_fix_get_user_accessible_institutions_role_scope_all.sql
--   for the same class of fix previously applied to BoS/billing). This function already
--   handles: NULL passthrough, super_admin bypass, institution_scope='all' roles (both
--   user_roles multi-role and legacy profiles.role fallback), own institution, CAS
--   counselling_code siblings, and active user_institution_access grants.
--
-- SCOPE — 13 policies across 12 tables, structure/columns unchanged, RLS predicate only:
--   procurement_purchase_requests, procurement_purchase_request_items,
--   procurement_rfqs, procurement_rfq_items, procurement_rfq_vendors,
--   procurement_quotations, procurement_quotation_items,
--   procurement_purchase_orders, procurement_purchase_order_items,
--   procurement_grn, procurement_grn_items, procurement_grn_replacements,
--   procurement_po_formats.

-- ---------------------------------------------------------------------------
-- procurement_purchase_requests / procurement_purchase_request_items
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS ppr_institution_scope ON public.procurement_purchase_requests;
CREATE POLICY ppr_institution_scope ON public.procurement_purchase_requests
    FOR ALL
    USING (public.role_has_institution_access(institution_id))
    WITH CHECK (public.role_has_institution_access(institution_id));

DROP POLICY IF EXISTS ppri_parent_scope ON public.procurement_purchase_request_items;
CREATE POLICY ppri_parent_scope ON public.procurement_purchase_request_items
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.procurement_purchase_requests r
            WHERE r.id = procurement_purchase_request_items.request_id
              AND public.role_has_institution_access(r.institution_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.procurement_purchase_requests r
            WHERE r.id = procurement_purchase_request_items.request_id
              AND public.role_has_institution_access(r.institution_id)
        )
    );

-- ---------------------------------------------------------------------------
-- procurement_rfqs / procurement_rfq_items / procurement_rfq_vendors
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS prfq_institution_scope ON public.procurement_rfqs;
CREATE POLICY prfq_institution_scope ON public.procurement_rfqs
    FOR ALL
    USING (public.role_has_institution_access(institution_id))
    WITH CHECK (public.role_has_institution_access(institution_id));

DROP POLICY IF EXISTS prfqi_parent_scope ON public.procurement_rfq_items;
CREATE POLICY prfqi_parent_scope ON public.procurement_rfq_items
    FOR ALL
    USING (
        EXISTS (SELECT 1 FROM public.procurement_rfqs r
                WHERE r.id = procurement_rfq_items.rfq_id
                  AND public.role_has_institution_access(r.institution_id))
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.procurement_rfqs r
                WHERE r.id = procurement_rfq_items.rfq_id
                  AND public.role_has_institution_access(r.institution_id))
    );

DROP POLICY IF EXISTS prfqv_parent_scope ON public.procurement_rfq_vendors;
CREATE POLICY prfqv_parent_scope ON public.procurement_rfq_vendors
    FOR ALL
    USING (
        EXISTS (SELECT 1 FROM public.procurement_rfqs r
                WHERE r.id = procurement_rfq_vendors.rfq_id
                  AND public.role_has_institution_access(r.institution_id))
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.procurement_rfqs r
                WHERE r.id = procurement_rfq_vendors.rfq_id
                  AND public.role_has_institution_access(r.institution_id))
    );

-- ---------------------------------------------------------------------------
-- procurement_quotations / procurement_quotation_items
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS pq_institution_scope ON public.procurement_quotations;
CREATE POLICY pq_institution_scope ON public.procurement_quotations
    FOR ALL
    USING (public.role_has_institution_access(institution_id))
    WITH CHECK (public.role_has_institution_access(institution_id));

DROP POLICY IF EXISTS pqi_parent_scope ON public.procurement_quotation_items;
CREATE POLICY pqi_parent_scope ON public.procurement_quotation_items
    FOR ALL
    USING (
        EXISTS (SELECT 1 FROM public.procurement_quotations q
                WHERE q.id = procurement_quotation_items.quotation_id
                  AND public.role_has_institution_access(q.institution_id))
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.procurement_quotations q
                WHERE q.id = procurement_quotation_items.quotation_id
                  AND public.role_has_institution_access(q.institution_id))
    );

-- ---------------------------------------------------------------------------
-- procurement_purchase_orders / procurement_purchase_order_items
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS ppo_institution_scope ON public.procurement_purchase_orders;
CREATE POLICY ppo_institution_scope ON public.procurement_purchase_orders
    FOR ALL
    USING (public.role_has_institution_access(institution_id))
    WITH CHECK (public.role_has_institution_access(institution_id));

DROP POLICY IF EXISTS ppoi_parent_scope ON public.procurement_purchase_order_items;
CREATE POLICY ppoi_parent_scope ON public.procurement_purchase_order_items
    FOR ALL
    USING (
        EXISTS (SELECT 1 FROM public.procurement_purchase_orders p
                WHERE p.id = procurement_purchase_order_items.po_id
                  AND public.role_has_institution_access(p.institution_id))
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.procurement_purchase_orders p
                WHERE p.id = procurement_purchase_order_items.po_id
                  AND public.role_has_institution_access(p.institution_id))
    );

-- ---------------------------------------------------------------------------
-- procurement_grn / procurement_grn_items / procurement_grn_replacements
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS pgrn_institution_scope ON public.procurement_grn;
CREATE POLICY pgrn_institution_scope ON public.procurement_grn
    FOR ALL
    USING (public.role_has_institution_access(institution_id))
    WITH CHECK (public.role_has_institution_access(institution_id));

DROP POLICY IF EXISTS pgrni_parent_scope ON public.procurement_grn_items;
CREATE POLICY pgrni_parent_scope ON public.procurement_grn_items
    FOR ALL
    USING (
        EXISTS (SELECT 1 FROM public.procurement_grn g
                WHERE g.id = procurement_grn_items.grn_id
                  AND public.role_has_institution_access(g.institution_id))
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.procurement_grn g
                WHERE g.id = procurement_grn_items.grn_id
                  AND public.role_has_institution_access(g.institution_id))
    );

DROP POLICY IF EXISTS pgrnr_parent_scope ON public.procurement_grn_replacements;
CREATE POLICY pgrnr_parent_scope ON public.procurement_grn_replacements
    FOR ALL
    USING (
        EXISTS (SELECT 1 FROM public.procurement_grn_items i
                JOIN public.procurement_grn g ON g.id = i.grn_id
                WHERE i.id = procurement_grn_replacements.grn_item_id
                  AND public.role_has_institution_access(g.institution_id))
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.procurement_grn_items i
                JOIN public.procurement_grn g ON g.id = i.grn_id
                WHERE i.id = procurement_grn_replacements.grn_item_id
                  AND public.role_has_institution_access(g.institution_id))
    );

-- ---------------------------------------------------------------------------
-- procurement_po_formats
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS ppf_institution_scope ON public.procurement_po_formats;
CREATE POLICY ppf_institution_scope ON public.procurement_po_formats
    FOR ALL
    USING (public.role_has_institution_access(institution_id))
    WITH CHECK (public.role_has_institution_access(institution_id));
