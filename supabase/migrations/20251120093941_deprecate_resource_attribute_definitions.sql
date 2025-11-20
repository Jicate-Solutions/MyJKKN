-- Migration: Deprecate resource_attribute_definitions table
-- Date: 2025-01-20
-- Reason: Custom attributes moved from subcategory-level to resource-level for better flexibility
--
-- Context:
-- Previously, custom attributes were defined at the subcategory level in the
-- resource_attribute_definitions table. This meant ALL resources in a subcategory
-- had to have the same set of attributes, which was inflexible.
--
-- Now, custom attributes are defined individually for each resource and stored
-- in the resources.custom_attributes JSONB column with the following structure:
-- {
--   "schema": [
--     {
--       "id": "unique_id",
--       "attribute_key": "ram_size",
--       "label": "RAM Size",
--       "attribute_type": "dropdown",
--       "is_required": true,
--       "options": ["4GB", "8GB", "16GB", "32GB"],
--       "value": "16GB"
--     }
--   ],
--   "values": {
--     "ram_size": "16GB"
--   }
-- }

-- Add comment to resource_attribute_definitions table
COMMENT ON TABLE resource_attribute_definitions IS
'DEPRECATED (2025-01-20): Custom attributes are now stored per-resource in resources.custom_attributes JSONB column.
This table is kept for backward compatibility only and should not be used for new resources.

Migration Path:
- Old approach: Attributes defined at subcategory level, inherited by all resources
- New approach: Attributes defined individually per resource for maximum flexibility

The resources.custom_attributes column stores both the schema (attribute definitions)
and values in a structured JSONB format.';

-- Add comment to subcategory_id column
COMMENT ON COLUMN resource_attribute_definitions.subcategory_id IS
'Links attribute definition to subcategory. DEPRECATED - new resources use per-resource custom attributes.';

-- Add index comment
COMMENT ON INDEX IF EXISTS resource_attribute_definitions_subcategory_id_idx IS
'DEPRECATED index - table no longer used for new resources';

-- Log the migration
DO $$
BEGIN
  RAISE NOTICE 'Migration completed: resource_attribute_definitions table deprecated';
  RAISE NOTICE 'Custom attributes now managed per-resource in resources.custom_attributes JSONB column';
  RAISE NOTICE 'Existing attribute definitions preserved for backward compatibility';
END $$;
