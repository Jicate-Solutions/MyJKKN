-- Create example custom roles for BOS syllabi management
-- Note: These are reference examples. Customize role_key, role_name, and institution_id per your institution.

-- Example 1: BoS Coordinator role (institution-specific)
INSERT INTO custom_roles (
  institution_id,
  role_key,
  role_name,
  description,
  is_system_role,
  institution_scope,
  permissions,
  created_by
) VALUES (
  NULL, -- Can be set to specific institution_id
  'bos_coordinator',
  'BoS Coordinator',
  'Board of Studies coordinator with edit and revision permissions but no delete access',
  false,
  'own_institution',
  jsonb_build_object(
    'bos.syllabi.view', true,
    'bos.syllabi.create', true,
    'bos.syllabi.edit', true,
    'bos.syllabi.delete', false,
    'bos.syllabi.revise', true,
    'bos.syllabi.duplicate', true,
    'bos.syllabi.export', true,
    'bos.syllabi.manage_taxonomy', false
  ),
  NULL
) ON CONFLICT DO NOTHING;

-- Example 2: BoS Reviewer role (view and export only)
INSERT INTO custom_roles (
  institution_id,
  role_key,
  role_name,
  description,
  is_system_role,
  institution_scope,
  permissions,
  created_by
) VALUES (
  NULL,
  'bos_reviewer',
  'BoS Reviewer',
  'Board of Studies reviewer with view and export permissions only',
  false,
  'own_institution',
  jsonb_build_object(
    'bos.syllabi.view', true,
    'bos.syllabi.create', false,
    'bos.syllabi.edit', false,
    'bos.syllabi.delete', false,
    'bos.syllabi.revise', false,
    'bos.syllabi.duplicate', false,
    'bos.syllabi.export', true,
    'bos.syllabi.manage_taxonomy', false
  ),
  NULL
) ON CONFLICT DO NOTHING;

-- Example 3: BoS Manager role (full access except taxonomy)
INSERT INTO custom_roles (
  institution_id,
  role_key,
  role_name,
  description,
  is_system_role,
  institution_scope,
  permissions,
  created_by
) VALUES (
  NULL,
  'bos_manager',
  'BoS Manager',
  'Board of Studies manager with full syllabi access but no taxonomy management',
  false,
  'own_institution',
  jsonb_build_object(
    'bos.syllabi.view', true,
    'bos.syllabi.create', true,
    'bos.syllabi.edit', true,
    'bos.syllabi.delete', true,
    'bos.syllabi.revise', true,
    'bos.syllabi.duplicate', true,
    'bos.syllabi.export', true,
    'bos.syllabi.manage_taxonomy', false
  ),
  NULL
) ON CONFLICT DO NOTHING;

-- Example 4: BoS Administrator role (full access)
INSERT INTO custom_roles (
  institution_id,
  role_key,
  role_name,
  description,
  is_system_role,
  institution_scope,
  permissions,
  created_by
) VALUES (
  NULL,
  'bos_admin',
  'BoS Administrator',
  'Board of Studies administrator with full access including taxonomy management',
  false,
  'all',
  jsonb_build_object(
    'bos.syllabi.view', true,
    'bos.syllabi.create', true,
    'bos.syllabi.edit', true,
    'bos.syllabi.delete', true,
    'bos.syllabi.revise', true,
    'bos.syllabi.duplicate', true,
    'bos.syllabi.export', true,
    'bos.syllabi.manage_taxonomy', true
  ),
  NULL
) ON CONFLICT DO NOTHING;
