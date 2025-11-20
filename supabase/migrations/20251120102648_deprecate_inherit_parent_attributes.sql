-- Migration: Deprecate inherit_parent_attributes column
-- Date: 2025-01-20
-- Reason: Field is obsolete - parent categories never had attributes to inherit
--
-- Context:
-- The inherit_parent_attributes field was designed to allow subcategories to
-- inherit custom attribute definitions from parent categories. However:
-- 1. Parent categories NEVER had attribute definitions (only subcategories did)
-- 2. Custom attributes are now managed per-resource, not per-subcategory
-- 3. This field served no functional purpose and only added confusion
--
-- The column is kept in the database for backward compatibility but is no longer
-- used in the application code.

-- Add comment to the column
COMMENT ON COLUMN resource_sub_categories.inherit_parent_attributes IS
'DEPRECATED (2025-01-20): This field is obsolete and no longer used.
Original intent: Allow subcategories to inherit attribute definitions from parent categories.
Reality: Parent categories never had attribute definitions to inherit from.
Current state: Custom attributes are managed per-resource in resources.custom_attributes JSONB column.
This column is kept for backward compatibility only.';

-- Log the migration
DO $$
BEGIN
  RAISE NOTICE 'Migration completed: inherit_parent_attributes column deprecated';
  RAISE NOTICE 'Field removed from application code but kept in database for backward compatibility';
END $$;
