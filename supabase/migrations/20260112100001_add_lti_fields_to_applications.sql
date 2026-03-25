-- ============================================================================
-- Add LTI Integration Fields to Applications Table
-- Purpose: Support LTI 1.3 tool integration in Application Hub
-- Created: 2026-01-12
-- Migration: 20260112100001_add_lti_fields_to_applications
-- ============================================================================

-- Add lti_tool_id foreign key to link applications with LTI tools
ALTER TABLE public.applications
ADD COLUMN IF NOT EXISTS lti_tool_id UUID REFERENCES lti_tools(id) ON DELETE SET NULL;

-- Add index for LTI tool lookups
CREATE INDEX IF NOT EXISTS idx_applications_lti_tool ON applications(lti_tool_id)
WHERE lti_tool_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN applications.lti_tool_id IS 'Link to LTI tool configuration for LTI 1.3 integrations (MATLAB Grader, etc.)';

-- Update existing integration_type check constraint if needed
-- The integration_type column already exists, but we ensure it supports 'lti_1.3'
-- Note: The column uses VARCHAR(255) so no constraint update needed
