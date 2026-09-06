-- ============================================================================
-- Editing an item requires permission to edit items.
--
-- That sounds tautological. It was not true.
--
-- The write policies on ims_items checked INSTITUTION MEMBERSHIP and nothing else:
--
--     USING (institution_id IN (SELECT ims_accessible_institution_ids())
--            OR get_current_user_role() = ANY (ARRAY['super_admin','store_admin']))
--
-- and ims_accessible_institution_ids() returns the caller's own
-- profiles.institution_id for EVERY user. `authenticated` holds UPDATE and DELETE
-- grants. So every account attached to an IMS institution could rewrite or delete
-- any item in it:
--
--     JKKN Dental    802 users (615 students)
--     JKKN Pharmacy  984 users (872 students)
--
-- The application never offered them the button, which is why this went unnoticed —
-- but the button is not the control. A session token and the public anon key are
-- enough to PATCH a price directly.
--
-- It also made the item change-request flow (20260731130000) UI-deep: a
-- pos_store_manager is denied ims.inventory.edit and routed through approval by the
-- form, yet could have skipped the whole thing with one REST call. The approval
-- path's own guards are sound; this is the door beside it.
--
-- WHY INSERT IS LEFT ALONE. Procurement's reconcileNewItem() creates a catalogue
-- item when a "new item" purchase request is approved, on the session client, as
-- whoever approved it — and approvers do not hold ims.inventory.create. Tightening
-- INSERT would break a legitimate, already-reviewed flow to close a hole that is not
-- the one at issue: the bypass that matters is editing an existing item's price.
-- Worth revisiting once that path has a permission of its own.
-- ============================================================================

-- ── UPDATE ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS ims_items_update ON public.ims_items;

CREATE POLICY ims_items_update
    ON public.ims_items
    FOR UPDATE
    TO authenticated
    USING (
        -- Unchanged escape hatch, kept verbatim: these two roles are the item
        -- master's owners and several server flows rely on it.
        public.get_current_user_role() = ANY (ARRAY['super_admin', 'store_admin'])
        -- Everyone else must now hold the permission AS WELL AS being in the
        -- institution. Membership alone is no longer a licence to edit.
        OR (
            institution_id IN (SELECT public.ims_accessible_institution_ids())
            AND public.user_has_permission('ims.inventory.edit')
        )
    );

-- ── DELETE ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS ims_items_delete ON public.ims_items;

CREATE POLICY ims_items_delete
    ON public.ims_items
    FOR DELETE
    TO authenticated
    USING (
        public.get_current_user_role() = ANY (ARRAY['super_admin', 'store_admin'])
        OR (
            institution_id IN (SELECT public.ims_accessible_institution_ids())
            AND public.user_has_permission('ims.inventory.delete')
        )
    );

COMMENT ON POLICY ims_items_update ON public.ims_items IS
    'Institution membership AND ims.inventory.edit. Membership alone used to be '
    'enough, which let ~1800 students and staff rewrite item prices directly and '
    'made the item change-request approval flow bypassable.';
COMMENT ON POLICY ims_items_delete ON public.ims_items IS
    'Institution membership AND ims.inventory.delete, or super_admin/store_admin.';
