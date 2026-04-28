-- 2026-04-28: Collapse 3-tier (parent/sub/item) billing categories into a single
-- global billing_categories table. Categories are common across all institutions
-- and no longer carry institution_id. Existing 3-tier tables are empty
-- (verified pre-migration), so this is a structural change with no data migration.
--
-- Aligns live DB with supabase/setup/01_tables.sql + 03_policies.sql + 04_triggers.sql
-- + 06_foreign_keys.sql + 02_functions.sql (all updated in the same change).

-- Step 1: Drop dependent FK on billing_student_bills (idempotent)
ALTER TABLE billing_student_bills DROP CONSTRAINT IF EXISTS fk_bills_item_category;
ALTER TABLE billing_student_bills DROP CONSTRAINT IF EXISTS fk_bills_category;

-- Step 2: Drop the 3-tier hierarchy (CASCADE handles internal FKs/triggers/RLS)
DROP TABLE IF EXISTS billing_item_categories CASCADE;
DROP TABLE IF EXISTS billing_sub_categories CASCADE;
DROP TABLE IF EXISTS billing_parent_categories CASCADE;

-- Step 3: Drop any prior flat billing_categories (was institution-scoped) to rebuild clean
DROP TABLE IF EXISTS billing_categories CASCADE;

-- Step 4: Recreate billing_categories WITHOUT institution_id (global)
CREATE TABLE public.billing_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_name VARCHAR(150) NOT NULL,
    amount NUMERIC(15,2),
    frequency VARCHAR(20) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    CONSTRAINT uq_billing_categories_name UNIQUE (category_name),
    CONSTRAINT chk_billing_categories_frequency CHECK (frequency IN ('monthly','quarterly','yearly','one-time'))
);

CREATE INDEX idx_billing_categories_is_active ON public.billing_categories(is_active);
CREATE INDEX idx_billing_categories_frequency ON public.billing_categories(frequency);

-- Step 5: Enable RLS and create policies (permission-only, no institution scope)
ALTER TABLE billing_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_categories_select" ON billing_categories
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR user_has_permission('billing.categories.view')
    );

CREATE POLICY "billing_categories_insert" ON billing_categories
    FOR INSERT WITH CHECK (
        is_super_admin() OR is_admin()
        OR user_has_permission('billing.categories.create')
    );

CREATE POLICY "billing_categories_update" ON billing_categories
    FOR UPDATE USING (
        is_super_admin() OR is_admin()
        OR user_has_permission('billing.categories.edit')
    );

CREATE POLICY "billing_categories_delete" ON billing_categories
    FOR DELETE USING (
        is_super_admin() OR is_admin()
        OR user_has_permission('billing.categories.delete')
    );

-- Step 6: updated_at trigger
CREATE TRIGGER trigger_billing_categories_updated_at
    BEFORE UPDATE ON billing_categories
    FOR EACH ROW EXECUTE FUNCTION update_billing_updated_at();

-- Step 7: FKs for created_by / updated_by (no institution FK)
ALTER TABLE billing_categories
    ADD CONSTRAINT fk_billing_categories_created_by
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE billing_categories
    ADD CONSTRAINT fk_billing_categories_updated_by
    FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- Step 8: Re-establish FK on billing_student_bills.item_category_id (kept name per D10)
ALTER TABLE billing_student_bills
    ADD CONSTRAINT fk_bills_item_category
    FOREIGN KEY (item_category_id)
    REFERENCES billing_categories(id)
    ON DELETE SET NULL;

-- Step 9: Rewrite ai_rpc_billing_categories against the flat global table
DROP FUNCTION IF EXISTS public.ai_rpc_billing_categories(uuid, uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.ai_rpc_billing_categories(
    p_user_id uuid,
    p_institution_id uuid DEFAULT NULL,
    p_limit integer DEFAULT 100,
    p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', COUNT(*) OVER(),
      'returned_count', COUNT(*),
      'has_more', COUNT(*) OVER() > p_offset + p_limit,
      'filters_applied', jsonb_build_object('institution_id', p_institution_id)
    )
  )
  INTO v_result
  FROM (
    SELECT
      bc.id,
      bc.category_name,
      bc.amount,
      bc.frequency,
      bc.description,
      bc.is_active,
      bc.created_at
    FROM billing_categories bc
    ORDER BY bc.category_name
    LIMIT p_limit
    OFFSET p_offset
  ) t;

  RETURN v_result;
END;
$function$;
