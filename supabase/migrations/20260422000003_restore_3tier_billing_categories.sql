-- ============================================================================
-- Restore 3-tier billing categories (Parent → Sub → Item)
-- ============================================================================
-- Date:   2026-04-22
-- Reason: Roll back commit a3eee63c2 (the Apr 15 flatten). All billing data
--         was wiped in 20260422000002, so this is a pure schema swap with no
--         data migration. Recreates billing_parent_categories,
--         billing_sub_categories, billing_item_categories. Renames
--         billing_student_bills.category_id back to item_category_id. Drops
--         the now-empty flat billing_categories table.
--
-- Permissions: NOT changed. The 3-tier RLS uses the same 4 keys
--   (billing.categories.{view,create,edit,delete}) that the flat model used.
--   The Apr 13 RLS-consolidation commit had already collapsed the original
--   12 keys to 4. So roles already holding these 4 keys (super_admin,
--   accountant_assistant, accounts, etc.) keep working unchanged.
-- ============================================================================

BEGIN;

-- 1. Drop FK from bills → flat categories so we can rename + drop.
ALTER TABLE public.billing_student_bills
    DROP CONSTRAINT IF EXISTS fk_bills_category;

-- 2. Create the 3 hierarchy tables.
CREATE TABLE IF NOT EXISTS public.billing_parent_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL,
    parent_category_name VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID,
    updated_by UUID
);

CREATE TABLE IF NOT EXISTS public.billing_sub_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL,
    parent_category_id UUID NOT NULL,
    sub_category_name VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID,
    updated_by UUID
);

CREATE TABLE IF NOT EXISTS public.billing_item_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL,
    parent_category_id UUID NOT NULL,
    sub_category_id UUID NOT NULL,
    item_category_name VARCHAR(150) NOT NULL,
    amount NUMERIC(15,2),
    frequency VARCHAR(20) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID,
    updated_by UUID
);

-- 3. FKs between the 3 tables + to institutions.
ALTER TABLE public.billing_parent_categories
    ADD CONSTRAINT fk_parent_categories_institution
    FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;

ALTER TABLE public.billing_sub_categories
    ADD CONSTRAINT fk_sub_categories_institution
    FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;

ALTER TABLE public.billing_sub_categories
    ADD CONSTRAINT fk_sub_categories_parent
    FOREIGN KEY (parent_category_id) REFERENCES public.billing_parent_categories(id) ON DELETE CASCADE;

ALTER TABLE public.billing_item_categories
    ADD CONSTRAINT fk_item_categories_institution
    FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;

ALTER TABLE public.billing_item_categories
    ADD CONSTRAINT fk_item_categories_parent
    FOREIGN KEY (parent_category_id) REFERENCES public.billing_parent_categories(id) ON DELETE CASCADE;

ALTER TABLE public.billing_item_categories
    ADD CONSTRAINT fk_item_categories_sub
    FOREIGN KEY (sub_category_id) REFERENCES public.billing_sub_categories(id) ON DELETE CASCADE;

-- 4. Rename bills column back. Safe — table is empty (verified pre-migration).
ALTER TABLE public.billing_student_bills RENAME COLUMN category_id TO item_category_id;

-- 5. New FK from bills → item_categories.
ALTER TABLE public.billing_student_bills
    ADD CONSTRAINT fk_bills_item_category
    FOREIGN KEY (item_category_id) REFERENCES public.billing_item_categories(id) ON DELETE SET NULL;

-- 6. Drop the flat table (empty).
DROP TABLE IF EXISTS public.billing_categories CASCADE;

-- 7. Enable RLS + 4 policies per table (12 total) using the 4 existing
--    permission keys. is_super_admin() / is_admin() short-circuit first.
ALTER TABLE public.billing_parent_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_sub_categories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_item_categories   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parent_categories_select" ON public.billing_parent_categories
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR (role_has_institution_access(institution_id) AND user_has_permission('billing.categories.view'))
    );
CREATE POLICY "parent_categories_insert" ON public.billing_parent_categories
    FOR INSERT WITH CHECK (
        is_super_admin() OR is_admin()
        OR (role_has_institution_access(institution_id) AND user_has_permission('billing.categories.create'))
    );
CREATE POLICY "parent_categories_update" ON public.billing_parent_categories
    FOR UPDATE USING (
        is_super_admin() OR is_admin()
        OR (role_has_institution_access(institution_id) AND user_has_permission('billing.categories.edit'))
    );
CREATE POLICY "parent_categories_delete" ON public.billing_parent_categories
    FOR DELETE USING (
        is_super_admin() OR is_admin()
        OR (role_has_institution_access(institution_id) AND user_has_permission('billing.categories.delete'))
    );

CREATE POLICY "sub_categories_select" ON public.billing_sub_categories
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR (role_has_institution_access(institution_id) AND user_has_permission('billing.categories.view'))
    );
CREATE POLICY "sub_categories_insert" ON public.billing_sub_categories
    FOR INSERT WITH CHECK (
        is_super_admin() OR is_admin()
        OR (role_has_institution_access(institution_id) AND user_has_permission('billing.categories.create'))
    );
CREATE POLICY "sub_categories_update" ON public.billing_sub_categories
    FOR UPDATE USING (
        is_super_admin() OR is_admin()
        OR (role_has_institution_access(institution_id) AND user_has_permission('billing.categories.edit'))
    );
CREATE POLICY "sub_categories_delete" ON public.billing_sub_categories
    FOR DELETE USING (
        is_super_admin() OR is_admin()
        OR (role_has_institution_access(institution_id) AND user_has_permission('billing.categories.delete'))
    );

CREATE POLICY "item_categories_select" ON public.billing_item_categories
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR (role_has_institution_access(institution_id) AND user_has_permission('billing.categories.view'))
    );
CREATE POLICY "item_categories_insert" ON public.billing_item_categories
    FOR INSERT WITH CHECK (
        is_super_admin() OR is_admin()
        OR (role_has_institution_access(institution_id) AND user_has_permission('billing.categories.create'))
    );
CREATE POLICY "item_categories_update" ON public.billing_item_categories
    FOR UPDATE USING (
        is_super_admin() OR is_admin()
        OR (role_has_institution_access(institution_id) AND user_has_permission('billing.categories.edit'))
    );
CREATE POLICY "item_categories_delete" ON public.billing_item_categories
    FOR DELETE USING (
        is_super_admin() OR is_admin()
        OR (role_has_institution_access(institution_id) AND user_has_permission('billing.categories.delete'))
    );

-- 8. updated_at triggers — reuse existing update_billing_updated_at() function.
CREATE TRIGGER trg_billing_parent_categories_updated_at
    BEFORE UPDATE ON public.billing_parent_categories
    FOR EACH ROW EXECUTE FUNCTION update_billing_updated_at();

CREATE TRIGGER trg_billing_sub_categories_updated_at
    BEFORE UPDATE ON public.billing_sub_categories
    FOR EACH ROW EXECUTE FUNCTION update_billing_updated_at();

CREATE TRIGGER trg_billing_item_categories_updated_at
    BEFORE UPDATE ON public.billing_item_categories
    FOR EACH ROW EXECUTE FUNCTION update_billing_updated_at();

COMMIT;
