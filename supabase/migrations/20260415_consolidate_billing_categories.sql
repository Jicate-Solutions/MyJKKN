-- =====================================================================
-- Migration: Consolidate billing category hierarchy
-- Date: 2026-04-15
-- Purpose: Collapse 3-tier (billing_parent_categories → billing_sub_categories →
--          billing_item_categories) hierarchy into a single flat billing_categories
--          table. Preserves IDs from billing_item_categories so billing_student_bills
--          references stay valid.
-- Author: MyJKKN billing refactor
-- =====================================================================

BEGIN;

-- Step 1: Create new flat billing_categories table
CREATE TABLE IF NOT EXISTS public.billing_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL,
    category_name VARCHAR(150) NOT NULL,
    amount NUMERIC(15,2),
    frequency VARCHAR(20) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    CONSTRAINT uq_billing_categories_name_per_institution UNIQUE (institution_id, category_name)
);

-- Step 2: Copy existing item categories into new table (preserving IDs)
-- Parent/sub names are not copied — business data lives on the item tier.
-- If duplicate names per institution exist, suffix with parent/sub breadcrumb to avoid UNIQUE collision.
INSERT INTO public.billing_categories (
    id, institution_id, category_name, amount, frequency, is_active,
    created_at, updated_at, created_by, updated_by, description
)
SELECT
    ic.id,
    ic.institution_id,
    CASE
        WHEN EXISTS (
            SELECT 1 FROM public.billing_item_categories dup
            WHERE dup.institution_id = ic.institution_id
              AND LOWER(dup.item_category_name) = LOWER(ic.item_category_name)
              AND dup.id <> ic.id
        )
        THEN ic.item_category_name || ' (' || COALESCE(pc.parent_category_name, '') || ' / ' || COALESCE(sc.sub_category_name, '') || ')'
        ELSE ic.item_category_name
    END AS category_name,
    ic.amount,
    ic.frequency,
    ic.is_active,
    ic.created_at,
    ic.updated_at,
    ic.created_by,
    ic.updated_by,
    -- Preserve hierarchy info in description for reference
    NULLIF(CONCAT_WS(' / ', pc.parent_category_name, sc.sub_category_name), '') AS description
FROM public.billing_item_categories ic
LEFT JOIN public.billing_parent_categories pc ON pc.id = ic.parent_category_id
LEFT JOIN public.billing_sub_categories sc ON sc.id = ic.sub_category_id
ON CONFLICT (id) DO NOTHING;

-- Step 3: Swap FK on billing_student_bills
-- 3a. Drop old FK
ALTER TABLE public.billing_student_bills
    DROP CONSTRAINT IF EXISTS fk_bills_item_category;

-- 3b. Rename column item_category_id -> category_id
ALTER TABLE public.billing_student_bills
    RENAME COLUMN item_category_id TO category_id;

-- 3c. Add new FK pointing at billing_categories
ALTER TABLE public.billing_student_bills
    ADD CONSTRAINT fk_bills_category
    FOREIGN KEY (category_id)
    REFERENCES public.billing_categories(id)
    ON DELETE SET NULL;

-- Step 4: Enable RLS + policies on new table
ALTER TABLE public.billing_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_categories_select" ON public.billing_categories
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR (user_has_permission('billing.categories.view')
            AND role_has_institution_access(institution_id))
    );

CREATE POLICY "billing_categories_insert" ON public.billing_categories
    FOR INSERT WITH CHECK (
        is_super_admin() OR is_admin()
        OR (user_has_permission('billing.categories.create')
            AND role_has_institution_access(institution_id))
    );

CREATE POLICY "billing_categories_update" ON public.billing_categories
    FOR UPDATE USING (
        is_super_admin() OR is_admin()
        OR (user_has_permission('billing.categories.edit')
            AND role_has_institution_access(institution_id))
    );

CREATE POLICY "billing_categories_delete" ON public.billing_categories
    FOR DELETE USING (
        is_super_admin() OR is_admin()
        OR (user_has_permission('billing.categories.delete')
            AND role_has_institution_access(institution_id))
    );

-- Step 5: Trigger for updated_at
CREATE TRIGGER trigger_billing_categories_updated_at BEFORE UPDATE ON public.billing_categories
    FOR EACH ROW EXECUTE FUNCTION update_billing_updated_at();

-- Step 6: FKs to institutions + profiles
ALTER TABLE public.billing_categories
    ADD CONSTRAINT fk_billing_categories_institution
    FOREIGN KEY (institution_id)
    REFERENCES public.institutions(id)
    ON DELETE CASCADE;

ALTER TABLE public.billing_categories
    ADD CONSTRAINT fk_billing_categories_created_by
    FOREIGN KEY (created_by)
    REFERENCES public.profiles(id)
    ON DELETE SET NULL;

ALTER TABLE public.billing_categories
    ADD CONSTRAINT fk_billing_categories_updated_by
    FOREIGN KEY (updated_by)
    REFERENCES public.profiles(id)
    ON DELETE SET NULL;

-- Step 7: Drop old tables (in dependency order)
DROP TABLE IF EXISTS public.billing_item_categories CASCADE;
DROP TABLE IF EXISTS public.billing_sub_categories CASCADE;
DROP TABLE IF EXISTS public.billing_parent_categories CASCADE;

-- Step 8: Drop orphaned trigger functions (created but no longer needed)
DROP FUNCTION IF EXISTS public.update_billing_parent_categories_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.update_billing_sub_categories_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.update_billing_item_categories_updated_at() CASCADE;

-- Step 9: Rewrite existing custom_roles.permissions JSONB
-- Collapse old 12 keys into new 4.
UPDATE public.custom_roles
SET permissions = (
    -- Remove old keys
    (permissions
        - 'billing.parent_categories.view'
        - 'billing.parent_categories.create'
        - 'billing.parent_categories.edit'
        - 'billing.parent_categories.delete'
        - 'billing.sub_categories.view'
        - 'billing.sub_categories.create'
        - 'billing.sub_categories.edit'
        - 'billing.sub_categories.delete'
        - 'billing.item_categories.view'
        - 'billing.item_categories.create'
        - 'billing.item_categories.edit'
        - 'billing.item_categories.delete'
    )
    -- Add new keys if any of the old ones were true
    || jsonb_build_object(
        'billing.categories.view',
            COALESCE((permissions->>'billing.parent_categories.view')::bool, false)
            OR COALESCE((permissions->>'billing.sub_categories.view')::bool, false)
            OR COALESCE((permissions->>'billing.item_categories.view')::bool, false),
        'billing.categories.create',
            COALESCE((permissions->>'billing.parent_categories.create')::bool, false)
            OR COALESCE((permissions->>'billing.sub_categories.create')::bool, false)
            OR COALESCE((permissions->>'billing.item_categories.create')::bool, false),
        'billing.categories.edit',
            COALESCE((permissions->>'billing.parent_categories.edit')::bool, false)
            OR COALESCE((permissions->>'billing.sub_categories.edit')::bool, false)
            OR COALESCE((permissions->>'billing.item_categories.edit')::bool, false),
        'billing.categories.delete',
            COALESCE((permissions->>'billing.parent_categories.delete')::bool, false)
            OR COALESCE((permissions->>'billing.sub_categories.delete')::bool, false)
            OR COALESCE((permissions->>'billing.item_categories.delete')::bool, false)
    )
)
WHERE permissions ?| ARRAY[
    'billing.parent_categories.view',
    'billing.parent_categories.create',
    'billing.parent_categories.edit',
    'billing.parent_categories.delete',
    'billing.sub_categories.view',
    'billing.sub_categories.create',
    'billing.sub_categories.edit',
    'billing.sub_categories.delete',
    'billing.item_categories.view',
    'billing.item_categories.create',
    'billing.item_categories.edit',
    'billing.item_categories.delete'
];

COMMIT;

-- Verification queries (run manually after commit)
-- SELECT COUNT(*) FROM billing_categories;
-- SELECT COUNT(*) FROM billing_student_bills WHERE category_id IS NOT NULL;
-- SELECT id, category_name, amount, frequency FROM billing_categories LIMIT 10;
