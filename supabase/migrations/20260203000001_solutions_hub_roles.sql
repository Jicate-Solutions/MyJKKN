-- ============================================
-- Migration: Add Solutions Hub Roles to MyJKKN
-- Created: 2026-02-03
-- Purpose: Add new roles for Solutions Hub integration
-- Target: MyJKKN STAGING (hhprjbgknupaplivtoib)
-- ============================================

-- ============================================
-- SECTION 1: ADD NEW ROLES TO custom_roles TABLE
-- ============================================

-- Builder role - Software talent for building solutions
INSERT INTO custom_roles (
    role_key,
    role_name,
    description,
    permissions,
    is_system_role
)
VALUES (
    'builder',
    'Builder',
    'Software builder talent - can view and claim solution phases, submit work',
    jsonb_build_object(
        'view_dashboard', true,
        'view_profile', true,
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
    true
)
ON CONFLICT (role_key) DO UPDATE SET
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
    is_system_role
)
VALUES (
    'cohort_member',
    'Cohort Member',
    'Training cohort member - can view sessions, claim training assignments, view earnings',
    jsonb_build_object(
        'view_dashboard', true,
        'view_profile', true,
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
    true
)
ON CONFLICT (role_key) DO UPDATE SET
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
    is_system_role
)
VALUES (
    'production_learner',
    'Production Learner',
    'Content production learner - can view orders, submit deliverables, view earnings',
    jsonb_build_object(
        'view_dashboard', true,
        'view_profile', true,
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
    true
)
ON CONFLICT (role_key) DO UPDATE SET
    role_name = EXCLUDED.role_name,
    description = EXCLUDED.description,
    permissions = EXCLUDED.permissions,
    updated_at = NOW();

-- JICATE Staff role - JICATE facilitators with admin access to Solutions Hub
INSERT INTO custom_roles (
    role_key,
    role_name,
    description,
    permissions,
    is_system_role
)
VALUES (
    'jicate_staff',
    'JICATE Staff',
    'JICATE facilitator - full admin access to Solutions Hub',
    jsonb_build_object(
        'view_dashboard', true,
        'view_profile', true,
        'solutions_hub.view', true,
        'solutions_hub.admin', true,
        'solutions_hub.full_access', true,
        'solutions_hub.clients.view', true,
        'solutions_hub.clients.create', true,
        'solutions_hub.clients.edit', true,
        'solutions_hub.clients.delete', true,
        'solutions_hub.solutions.view', true,
        'solutions_hub.solutions.create', true,
        'solutions_hub.solutions.edit', true,
        'solutions_hub.solutions.delete', true,
        'solutions_hub.phases.view', true,
        'solutions_hub.phases.create', true,
        'solutions_hub.phases.edit', true,
        'solutions_hub.phases.delete', true,
        'solutions_hub.builders.view', true,
        'solutions_hub.builders.manage', true,
        'solutions_hub.training.view', true,
        'solutions_hub.training.manage', true,
        'solutions_hub.content.view', true,
        'solutions_hub.content.manage', true,
        'solutions_hub.financials.view', true,
        'solutions_hub.financials.manage', true,
        'solutions_hub.reports.view', true,
        'solutions_hub.jicate.sessions.view', true,
        'solutions_hub.jicate.sessions.create', true
    ),
    true
)
ON CONFLICT (role_key) DO UPDATE SET
    role_name = EXCLUDED.role_name,
    description = EXCLUDED.description,
    permissions = EXCLUDED.permissions,
    updated_at = NOW();

-- Client role - External clients for client portal
INSERT INTO custom_roles (
    role_key,
    role_name,
    description,
    permissions,
    is_system_role
)
VALUES (
    'client',
    'Client',
    'External client - can view own solutions, deliverables, invoices via client portal',
    jsonb_build_object(
        'view_dashboard', true,
        'view_profile', true,
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
    true
)
ON CONFLICT (role_key) DO UPDATE SET
    role_name = EXCLUDED.role_name,
    description = EXCLUDED.description,
    permissions = EXCLUDED.permissions,
    updated_at = NOW();

-- ============================================
-- SECTION 2: UPDATE EXISTING ROLES WITH SOLUTIONS HUB PERMISSIONS
-- ============================================

-- Update super_admin with full Solutions Hub access
UPDATE custom_roles
SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
    'solutions_hub.view', true,
    'solutions_hub.admin', true,
    'solutions_hub.full_access', true
),
    updated_at = NOW()
WHERE role_key = 'super_admin';

-- Update hod (HOD) with department-level Solutions Hub access
UPDATE custom_roles
SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
    'solutions_hub.view', true,
    'solutions_hub.department.dashboard', true,
    'solutions_hub.department.solutions.view', true,
    'solutions_hub.department.solutions.create', true,
    'solutions_hub.department.solutions.edit', true,
    'solutions_hub.department.phases.view', true,
    'solutions_hub.department.phases.create', true,
    'solutions_hub.department.phases.edit', true,
    'solutions_hub.department.builders.view', true,
    'solutions_hub.department.assignments.approve', true,
    'solutions_hub.department.financials.view', true
),
    updated_at = NOW()
WHERE role_key = 'hod';

-- Update staff with limited Solutions Hub access
UPDATE custom_roles
SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
    'solutions_hub.view', true,
    'solutions_hub.staff.dashboard', true,
    'solutions_hub.staff.solutions.view', true,
    'solutions_hub.staff.phases.view', true
),
    updated_at = NOW()
WHERE role_key = 'staff';

-- ============================================
-- VERIFICATION
-- ============================================
-- Run after migration to verify:
-- SELECT role_key, role_name, permissions->'solutions_hub.view' as has_sh_access
-- FROM custom_roles
-- WHERE role_key IN ('builder', 'cohort_member', 'production_learner', 'jicate_staff', 'client', 'super_admin', 'hod', 'staff');
