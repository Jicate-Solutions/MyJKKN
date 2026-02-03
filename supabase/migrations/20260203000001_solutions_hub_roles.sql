-- ============================================
-- Migration: Add Solutions Hub Roles to MyJKKN
-- Created: 2026-02-03
-- Purpose: Add new roles for Solutions Hub integration
-- Target: MyJKKN STAGING (hhprjbgknupaplivtoib)
-- ============================================

-- ============================================
-- SECTION 1: ADD NEW ROLES TO custom_roles TABLE
-- ============================================

-- Note: custom_roles table uses institution_id, so we need a function to get default institution
-- For system-wide roles, we'll create them with a special approach

-- First, create the roles as system roles (is_system_role = true)
-- These will work across all institutions

-- Builder role - Software talent for building solutions
INSERT INTO custom_roles (
    role_key,
    role_name,
    description,
    permissions,
    is_system_role,
    is_active,
    institution_id
)
SELECT
    'builder',
    'Builder',
    'Software builder talent - can view and claim solution phases, submit work',
    jsonb_build_object(
        -- Dashboard access
        'view_dashboard', true,
        'view_profile', true,

        -- Solutions Hub permissions
        'solutions_hub.view', true,
        'solutions_hub.builder.dashboard', true,
        'solutions_hub.builder.assignments.view', true,
        'solutions_hub.builder.assignments.claim', true,
        'solutions_hub.builder.phases.view', true,
        'solutions_hub.builder.phases.claim', true,
        'solutions_hub.builder.work.submit', true,
        'solutions_hub.builder.iterations.view', true,
        'solutions_hub.builder.iterations.create', true,
        'solutions_hub.builder.bugs.view', true,
        'solutions_hub.builder.bugs.create', true,
        'solutions_hub.builder.earnings.view', true,
        'solutions_hub.builder.profile.view', true,
        'solutions_hub.builder.profile.edit', true,
        'solutions_hub.builder.skills.view', true,
        'solutions_hub.builder.skills.edit', true
    ),
    true,  -- is_system_role
    true,  -- is_active
    id
FROM institutions
WHERE id = (SELECT id FROM institutions ORDER BY created_at ASC LIMIT 1)
ON CONFLICT ON CONSTRAINT custom_roles_institution_role_key_unique
DO UPDATE SET
    role_name = EXCLUDED.role_name,
    description = EXCLUDED.description,
    permissions = EXCLUDED.permissions,
    updated_at = NOW();

-- Cohort Member role - Training talent
INSERT INTO custom_roles (
    role_key,
    role_name,
    description,
    permissions,
    is_system_role,
    is_active,
    institution_id
)
SELECT
    'cohort_member',
    'Cohort Member',
    'Training cohort member - can view sessions, claim training assignments, view earnings',
    jsonb_build_object(
        -- Dashboard access
        'view_dashboard', true,
        'view_profile', true,

        -- Solutions Hub permissions
        'solutions_hub.view', true,
        'solutions_hub.cohort.dashboard', true,
        'solutions_hub.cohort.sessions.view', true,
        'solutions_hub.cohort.sessions.claim', true,
        'solutions_hub.cohort.assignments.view', true,
        'solutions_hub.cohort.assignments.claim', true,
        'solutions_hub.cohort.programs.view', true,
        'solutions_hub.cohort.earnings.view', true,
        'solutions_hub.cohort.profile.view', true,
        'solutions_hub.cohort.profile.edit', true,
        'solutions_hub.cohort.stats.view', true
    ),
    true,  -- is_system_role
    true,  -- is_active
    id
FROM institutions
WHERE id = (SELECT id FROM institutions ORDER BY created_at ASC LIMIT 1)
ON CONFLICT ON CONSTRAINT custom_roles_institution_role_key_unique
DO UPDATE SET
    role_name = EXCLUDED.role_name,
    description = EXCLUDED.description,
    permissions = EXCLUDED.permissions,
    updated_at = NOW();

-- Production Learner role - Content production talent
INSERT INTO custom_roles (
    role_key,
    role_name,
    description,
    permissions,
    is_system_role,
    is_active,
    institution_id
)
SELECT
    'production_learner',
    'Production Learner',
    'Content production learner - can view orders, submit deliverables, view earnings',
    jsonb_build_object(
        -- Dashboard access
        'view_dashboard', true,
        'view_profile', true,

        -- Solutions Hub permissions
        'solutions_hub.view', true,
        'solutions_hub.production.dashboard', true,
        'solutions_hub.production.orders.view', true,
        'solutions_hub.production.deliverables.view', true,
        'solutions_hub.production.deliverables.submit', true,
        'solutions_hub.production.assignments.view', true,
        'solutions_hub.production.assignments.claim', true,
        'solutions_hub.production.queue.view', true,
        'solutions_hub.production.earnings.view', true,
        'solutions_hub.production.profile.view', true,
        'solutions_hub.production.profile.edit', true
    ),
    true,  -- is_system_role
    true,  -- is_active
    id
FROM institutions
WHERE id = (SELECT id FROM institutions ORDER BY created_at ASC LIMIT 1)
ON CONFLICT ON CONSTRAINT custom_roles_institution_role_key_unique
DO UPDATE SET
    role_name = EXCLUDED.role_name,
    description = EXCLUDED.description,
    permissions = EXCLUDED.permissions,
    updated_at = NOW();

-- JICATE Staff role - JICATE facilitator with full solutions hub access
INSERT INTO custom_roles (
    role_key,
    role_name,
    description,
    permissions,
    is_system_role,
    is_active,
    institution_id
)
SELECT
    'jicate_staff',
    'JICATE Staff',
    'JICATE facilitator - full access to Solutions Hub admin features',
    jsonb_build_object(
        -- Dashboard access
        'view_dashboard', true,
        'view_profile', true,

        -- Solutions Hub full access
        'solutions_hub.view', true,
        'solutions_hub.admin', true,

        -- Clients
        'solutions_hub.clients.view', true,
        'solutions_hub.clients.create', true,
        'solutions_hub.clients.edit', true,
        'solutions_hub.clients.delete', true,

        -- Solutions
        'solutions_hub.solutions.view', true,
        'solutions_hub.solutions.create', true,
        'solutions_hub.solutions.edit', true,
        'solutions_hub.solutions.delete', true,

        -- Phases
        'solutions_hub.phases.view', true,
        'solutions_hub.phases.create', true,
        'solutions_hub.phases.edit', true,
        'solutions_hub.phases.assign', true,
        'solutions_hub.phases.approve', true,

        -- Builders management
        'solutions_hub.builders.view', true,
        'solutions_hub.builders.create', true,
        'solutions_hub.builders.edit', true,
        'solutions_hub.builders.assign', true,

        -- Training
        'solutions_hub.training.view', true,
        'solutions_hub.training.create', true,
        'solutions_hub.training.edit', true,
        'solutions_hub.training.sessions.manage', true,
        'solutions_hub.cohort.manage', true,

        -- Content
        'solutions_hub.content.view', true,
        'solutions_hub.content.create', true,
        'solutions_hub.content.edit', true,
        'solutions_hub.content.orders.manage', true,
        'solutions_hub.production.manage', true,

        -- Discovery
        'solutions_hub.discovery.view', true,
        'solutions_hub.discovery.create', true,
        'solutions_hub.discovery.edit', true,

        -- Financials
        'solutions_hub.payments.view', true,
        'solutions_hub.payments.create', true,
        'solutions_hub.payments.edit', true,
        'solutions_hub.earnings.view', true,
        'solutions_hub.earnings.process', true,
        'solutions_hub.revenue.view', true,

        -- Publications
        'solutions_hub.publications.view', true,
        'solutions_hub.publications.create', true,
        'solutions_hub.publications.edit', true,

        -- JICATE sessions
        'solutions_hub.jicate.sessions.view', true,
        'solutions_hub.jicate.sessions.manage', true,

        -- Reports & Analytics
        'solutions_hub.reports.view', true,
        'solutions_hub.analytics.view', true
    ),
    true,  -- is_system_role
    true,  -- is_active
    id
FROM institutions
WHERE id = (SELECT id FROM institutions ORDER BY created_at ASC LIMIT 1)
ON CONFLICT ON CONSTRAINT custom_roles_institution_role_key_unique
DO UPDATE SET
    role_name = EXCLUDED.role_name,
    description = EXCLUDED.description,
    permissions = EXCLUDED.permissions,
    updated_at = NOW();

-- Client role - External client with limited access to their own data
INSERT INTO custom_roles (
    role_key,
    role_name,
    description,
    permissions,
    is_system_role,
    is_active,
    institution_id
)
SELECT
    'client',
    'Client',
    'External client - can view own solutions, invoices, and deliverables',
    jsonb_build_object(
        -- Dashboard access
        'view_dashboard', true,
        'view_profile', true,

        -- Solutions Hub client portal permissions
        'solutions_hub.view', true,
        'solutions_hub.client.portal', true,
        'solutions_hub.client.dashboard', true,
        'solutions_hub.client.solutions.view_own', true,
        'solutions_hub.client.phases.view_own', true,
        'solutions_hub.client.deliverables.view_own', true,
        'solutions_hub.client.invoices.view_own', true,
        'solutions_hub.client.payments.view_own', true,
        'solutions_hub.client.communications.view_own', true,
        'solutions_hub.client.communications.create', true,
        'solutions_hub.client.profile.view', true,
        'solutions_hub.client.profile.edit', true
    ),
    true,  -- is_system_role
    true,  -- is_active
    id
FROM institutions
WHERE id = (SELECT id FROM institutions ORDER BY created_at ASC LIMIT 1)
ON CONFLICT ON CONSTRAINT custom_roles_institution_role_key_unique
DO UPDATE SET
    role_name = EXCLUDED.role_name,
    description = EXCLUDED.description,
    permissions = EXCLUDED.permissions,
    updated_at = NOW();


-- ============================================
-- SECTION 2: UPDATE EXISTING ROLES WITH SOLUTIONS HUB PERMISSIONS
-- ============================================

-- Update super_admin role to include all Solutions Hub permissions
UPDATE custom_roles
SET permissions = permissions || jsonb_build_object(
    -- Full Solutions Hub access
    'solutions_hub.view', true,
    'solutions_hub.admin', true,
    'solutions_hub.full_access', true,

    -- All client permissions
    'solutions_hub.clients.view', true,
    'solutions_hub.clients.create', true,
    'solutions_hub.clients.edit', true,
    'solutions_hub.clients.delete', true,

    -- All solution permissions
    'solutions_hub.solutions.view', true,
    'solutions_hub.solutions.create', true,
    'solutions_hub.solutions.edit', true,
    'solutions_hub.solutions.delete', true,
    'solutions_hub.solutions.approve', true,

    -- All phase permissions
    'solutions_hub.phases.view', true,
    'solutions_hub.phases.create', true,
    'solutions_hub.phases.edit', true,
    'solutions_hub.phases.delete', true,
    'solutions_hub.phases.assign', true,
    'solutions_hub.phases.approve', true,

    -- All builder permissions
    'solutions_hub.builders.view', true,
    'solutions_hub.builders.create', true,
    'solutions_hub.builders.edit', true,
    'solutions_hub.builders.delete', true,
    'solutions_hub.builders.assign', true,

    -- All training permissions
    'solutions_hub.training.view', true,
    'solutions_hub.training.create', true,
    'solutions_hub.training.edit', true,
    'solutions_hub.training.delete', true,
    'solutions_hub.training.sessions.manage', true,
    'solutions_hub.cohort.manage', true,

    -- All content permissions
    'solutions_hub.content.view', true,
    'solutions_hub.content.create', true,
    'solutions_hub.content.edit', true,
    'solutions_hub.content.delete', true,
    'solutions_hub.content.orders.manage', true,
    'solutions_hub.production.manage', true,

    -- All discovery permissions
    'solutions_hub.discovery.view', true,
    'solutions_hub.discovery.create', true,
    'solutions_hub.discovery.edit', true,
    'solutions_hub.discovery.delete', true,

    -- All financial permissions
    'solutions_hub.payments.view', true,
    'solutions_hub.payments.create', true,
    'solutions_hub.payments.edit', true,
    'solutions_hub.payments.delete', true,
    'solutions_hub.payments.approve', true,
    'solutions_hub.earnings.view', true,
    'solutions_hub.earnings.process', true,
    'solutions_hub.revenue.view', true,
    'solutions_hub.revenue.configure', true,

    -- All publication permissions
    'solutions_hub.publications.view', true,
    'solutions_hub.publications.create', true,
    'solutions_hub.publications.edit', true,
    'solutions_hub.publications.delete', true,

    -- All JICATE permissions
    'solutions_hub.jicate.sessions.view', true,
    'solutions_hub.jicate.sessions.manage', true,

    -- All reports & analytics
    'solutions_hub.reports.view', true,
    'solutions_hub.reports.export', true,
    'solutions_hub.analytics.view', true,

    -- Settings
    'solutions_hub.settings.view', true,
    'solutions_hub.settings.edit', true
),
updated_at = NOW()
WHERE role_key = 'super_admin';

-- Update HOD role (maps to department_head in Solutions Hub)
UPDATE custom_roles
SET permissions = permissions || jsonb_build_object(
    -- Solutions Hub department-scoped access
    'solutions_hub.view', true,
    'solutions_hub.department.dashboard', true,

    -- View and manage department solutions
    'solutions_hub.solutions.view', true,
    'solutions_hub.solutions.create', true,
    'solutions_hub.solutions.edit', true,

    -- View and manage department phases
    'solutions_hub.phases.view', true,
    'solutions_hub.phases.create', true,
    'solutions_hub.phases.edit', true,
    'solutions_hub.phases.assign', true,

    -- View department builders
    'solutions_hub.builders.view', true,
    'solutions_hub.builders.assign', true,

    -- View department training
    'solutions_hub.training.view', true,
    'solutions_hub.training.sessions.view', true,
    'solutions_hub.cohort.view', true,

    -- View department content
    'solutions_hub.content.view', true,
    'solutions_hub.content.orders.view', true,

    -- View department financials
    'solutions_hub.payments.view', true,
    'solutions_hub.earnings.view', true,

    -- View department reports
    'solutions_hub.reports.view', true
),
updated_at = NOW()
WHERE role_key = 'hod';

-- Update Staff role (maps to department_staff in Solutions Hub)
UPDATE custom_roles
SET permissions = permissions || jsonb_build_object(
    -- Solutions Hub limited department access
    'solutions_hub.view', true,
    'solutions_hub.department.view', true,

    -- View solutions
    'solutions_hub.solutions.view', true,

    -- View phases
    'solutions_hub.phases.view', true,

    -- View training sessions
    'solutions_hub.training.sessions.view', true,

    -- View content orders
    'solutions_hub.content.orders.view', true
),
updated_at = NOW()
WHERE role_key = 'staff';


-- ============================================
-- SECTION 3: CREATE INDEXES FOR ROLE LOOKUPS
-- ============================================

-- Index for faster role_key lookups (if not exists)
CREATE INDEX IF NOT EXISTS idx_custom_roles_role_key_active
ON custom_roles(role_key)
WHERE is_active = true;

-- Index for system roles
CREATE INDEX IF NOT EXISTS idx_custom_roles_system_active
ON custom_roles(is_system_role)
WHERE is_system_role = true AND is_active = true;


-- ============================================
-- SECTION 4: LOG THE MIGRATION
-- ============================================

DO $$
BEGIN
  RAISE NOTICE 'Migration completed: Solutions Hub roles added';
  RAISE NOTICE 'New roles: builder, cohort_member, production_learner, jicate_staff, client';
  RAISE NOTICE 'Updated roles: super_admin, hod, staff';
END $$;
