-- Purpose: Add user binding columns to api_keys for MCP role-based data scoping.
-- Backward compatible: all new columns are nullable. Existing keys default to admin role.

ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS user_role TEXT CHECK (user_role IN ('student', 'faculty', 'admin', 'super_admin')),
  ADD COLUMN IF NOT EXISTS department_id UUID;

COMMENT ON COLUMN api_keys.user_id IS 'Links API key to a specific user for MCP data scoping. NULL = institution-wide access (admin behavior).';
COMMENT ON COLUMN api_keys.user_role IS 'Determines data visibility scope for MCP tools. student = own data, faculty = department, admin = institution. NULL defaults to admin.';
COMMENT ON COLUMN api_keys.department_id IS 'Department scope for faculty keys. Used by MCP scoping middleware to filter queries.';

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id) WHERE user_id IS NOT NULL;
