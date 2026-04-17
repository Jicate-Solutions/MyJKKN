-- ============================================================================
-- Migration: OKR (Objectives & Key Results) Module
-- Created: 2026-01-31
-- Purpose: Create all tables for the OKR management system
-- ============================================================================
-- This migration creates:
--   - okr_objectives: Main objectives table
--   - okr_key_results: Key results linked to objectives
--   - okr_check_ins: Weekly check-in records
--   - okr_kr_updates: Key result value updates during check-ins
--   - okr_dependencies: Dependencies tracking
--   - okr_tasks: RACI-based task management
--   - okr_risks: Risk register for objectives
--   - okr_compliance: Weekly compliance tracking
--   - okr_user_status: User badge and status tracking
--   - learner_core_okrs: Institution-defined core OKRs for learners
--   - learner_okr_assignments: Learner assignments to core OKRs
--   - learner_elective_okrs: Learner self-defined OKRs
--   - okr_milestones: Milestone celebrations
--   - okr_auto_track_sources: Configuration for auto-tracked KRs
--   - okr_comments: Comments on OKR entities
--   - okr_reactions: Reactions on OKR entities
--   - okr_attachments: File attachments
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Create ENUM Types
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE okr_tier AS ENUM ('tier_1', 'tier_2', 'tier_3');
    RAISE NOTICE 'Created okr_tier ENUM';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'okr_tier ENUM already exists, skipping';
END $$;

DO $$ BEGIN
    CREATE TYPE okr_level AS ENUM ('organization', 'institution', 'department', 'individual');
    RAISE NOTICE 'Created okr_level ENUM';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'okr_level ENUM already exists, skipping';
END $$;

DO $$ BEGIN
    CREATE TYPE okr_cycle_type AS ENUM ('annual', 'quarterly', 'semester');
    RAISE NOTICE 'Created okr_cycle_type ENUM';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'okr_cycle_type ENUM already exists, skipping';
END $$;

DO $$ BEGIN
    CREATE TYPE okr_status AS ENUM ('draft', 'active', 'completed', 'archived');
    RAISE NOTICE 'Created okr_status ENUM';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'okr_status ENUM already exists, skipping';
END $$;

DO $$ BEGIN
    CREATE TYPE kr_status AS ENUM ('not_started', 'on_track', 'at_risk', 'behind', 'blocked', 'completed');
    RAISE NOTICE 'Created kr_status ENUM';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'kr_status ENUM already exists, skipping';
END $$;

DO $$ BEGIN
    CREATE TYPE kr_data_source AS ENUM ('manual', 'auto');
    RAISE NOTICE 'Created kr_data_source ENUM';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'kr_data_source ENUM already exists, skipping';
END $$;

DO $$ BEGIN
    CREATE TYPE okr_dependency_type AS ENUM ('external', 'internal', 'resource', 'budget');
    RAISE NOTICE 'Created okr_dependency_type ENUM';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'okr_dependency_type ENUM already exists, skipping';
END $$;

DO $$ BEGIN
    CREATE TYPE okr_dependency_status AS ENUM ('pending', 'in_progress', 'completed', 'blocked');
    RAISE NOTICE 'Created okr_dependency_status ENUM';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'okr_dependency_status ENUM already exists, skipping';
END $$;

DO $$ BEGIN
    CREATE TYPE okr_update_source AS ENUM ('auto', 'manual');
    RAISE NOTICE 'Created okr_update_source ENUM';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'okr_update_source ENUM already exists, skipping';
END $$;

DO $$ BEGIN
    CREATE TYPE okr_user_badge AS ENUM ('green', 'yellow', 'red', 'blocked');
    RAISE NOTICE 'Created okr_user_badge ENUM';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'okr_user_badge ENUM already exists, skipping';
END $$;

DO $$ BEGIN
    CREATE TYPE okr_risk_level AS ENUM ('high', 'medium', 'low');
    RAISE NOTICE 'Created okr_risk_level ENUM';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'okr_risk_level ENUM already exists, skipping';
END $$;

DO $$ BEGIN
    CREATE TYPE okr_milestone_type AS ENUM ('50_percent', '75_percent', '100_percent', 'exceeded');
    RAISE NOTICE 'Created okr_milestone_type ENUM';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'okr_milestone_type ENUM already exists, skipping';
END $$;

DO $$ BEGIN
    CREATE TYPE okr_entity_type AS ENUM ('objective', 'key_result', 'check_in');
    RAISE NOTICE 'Created okr_entity_type ENUM';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'okr_entity_type ENUM already exists, skipping';
END $$;

DO $$ BEGIN
    CREATE TYPE okr_reaction_type AS ENUM ('like', 'celebrate', 'support', 'insightful', 'concern', 'question');
    RAISE NOTICE 'Created okr_reaction_type ENUM';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'okr_reaction_type ENUM already exists, skipping';
END $$;

-- ============================================================================
-- STEP 2: Create Core Tables
-- ============================================================================

-- ----------------------------------------------------------------------------
-- okr_objectives: Main objectives table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.okr_objectives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    rationale TEXT,
    tier okr_tier NOT NULL DEFAULT 'tier_2',
    level okr_level NOT NULL DEFAULT 'individual',
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    parent_objective_id UUID REFERENCES public.okr_objectives(id) ON DELETE SET NULL,
    institution_id UUID REFERENCES public.institutions(id) ON DELETE SET NULL,
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    cycle_type okr_cycle_type NOT NULL DEFAULT 'quarterly',
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status okr_status NOT NULL DEFAULT 'draft',
    overall_progress NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (overall_progress >= 0 AND overall_progress <= 100),
    ai_integration_notes JSONB,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_date_range CHECK (end_date > start_date)
);

COMMENT ON TABLE public.okr_objectives IS 'OKR Objectives - the "O" in OKR';
COMMENT ON COLUMN public.okr_objectives.tier IS 'tier_1: Full (11 sections), tier_2: Core (6 sections), tier_3: Simple (3 sections)';
COMMENT ON COLUMN public.okr_objectives.level IS 'organization: JKKN group level, institution: college level, department: dept level, individual: personal';
COMMENT ON COLUMN public.okr_objectives.ai_integration_notes IS 'Extended tier-specific data stored as JSON';

-- ----------------------------------------------------------------------------
-- okr_key_results: Key Results linked to objectives
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.okr_key_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    objective_id UUID NOT NULL REFERENCES public.okr_objectives(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    start_value NUMERIC NOT NULL DEFAULT 0,
    target_value NUMERIC NOT NULL,
    current_value NUMERIC NOT NULL DEFAULT 0,
    unit TEXT NOT NULL DEFAULT '%',
    deadline DATE NOT NULL,
    data_source kr_data_source NOT NULL DEFAULT 'manual',
    data_source_config JSONB,
    progress_percentage NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (progress_percentage >= 0),
    status kr_status NOT NULL DEFAULT 'not_started',
    measured_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    last_synced_at TIMESTAMPTZ,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_target CHECK (target_value != start_value)
);

COMMENT ON TABLE public.okr_key_results IS 'Key Results - measurable outcomes for objectives';
COMMENT ON COLUMN public.okr_key_results.data_source IS 'manual: user updates, auto: system calculates from other modules';
COMMENT ON COLUMN public.okr_key_results.data_source_config IS 'Configuration for auto-tracked KRs (module, query, etc.)';

-- ----------------------------------------------------------------------------
-- okr_check_ins: Weekly check-in records
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.okr_check_ins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    week_number INTEGER NOT NULL CHECK (week_number >= 1 AND week_number <= 53),
    year INTEGER NOT NULL,
    check_in_date TIMESTAMPTZ,
    due_date DATE NOT NULL,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    is_overdue BOOLEAN NOT NULL DEFAULT FALSE,
    days_overdue INTEGER NOT NULL DEFAULT 0,
    overall_notes TEXT,
    blocker_flagged BOOLEAN NOT NULL DEFAULT FALSE,
    blocker_description TEXT,
    blocker_assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    blocker_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    blocker_resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_user_week_year UNIQUE (user_id, week_number, year)
);

COMMENT ON TABLE public.okr_check_ins IS 'Weekly check-in records for OKR progress tracking';
COMMENT ON COLUMN public.okr_check_ins.due_date IS 'Check-ins due every Sunday 5 PM';

-- ----------------------------------------------------------------------------
-- okr_kr_updates: Key result value updates during check-ins
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.okr_kr_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_result_id UUID NOT NULL REFERENCES public.okr_key_results(id) ON DELETE CASCADE,
    check_in_id UUID NOT NULL REFERENCES public.okr_check_ins(id) ON DELETE CASCADE,
    previous_value NUMERIC NOT NULL,
    new_value NUMERIC NOT NULL,
    source okr_update_source NOT NULL DEFAULT 'manual',
    exception_flagged BOOLEAN NOT NULL DEFAULT FALSE,
    exception_note TEXT,
    auto_calculated BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_kr_checkin UNIQUE (key_result_id, check_in_id)
);

COMMENT ON TABLE public.okr_kr_updates IS 'Historical record of KR value changes during check-ins';

-- ----------------------------------------------------------------------------
-- okr_dependencies: Dependencies tracking
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.okr_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    objective_id UUID NOT NULL REFERENCES public.okr_objectives(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    dependency_type okr_dependency_type NOT NULL DEFAULT 'internal',
    owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    owner_department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    required_by_date DATE,
    status okr_dependency_status NOT NULL DEFAULT 'pending',
    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.okr_dependencies IS 'Dependencies that must be resolved for objective success';

-- ----------------------------------------------------------------------------
-- okr_tasks: RACI-based task management
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.okr_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    objective_id UUID NOT NULL REFERENCES public.okr_objectives(id) ON DELETE CASCADE,
    key_result_id UUID REFERENCES public.okr_key_results(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    deadline DATE,
    responsible_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    accountable_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    consulted_ids UUID[] DEFAULT '{}',
    informed_ids UUID[] DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.okr_tasks IS 'Tasks with RACI responsibility assignment';
COMMENT ON COLUMN public.okr_tasks.responsible_id IS 'R in RACI - person doing the work';
COMMENT ON COLUMN public.okr_tasks.accountable_id IS 'A in RACI - person ultimately answerable';
COMMENT ON COLUMN public.okr_tasks.consulted_ids IS 'C in RACI - people whose input is sought';
COMMENT ON COLUMN public.okr_tasks.informed_ids IS 'I in RACI - people kept up to date';

-- ----------------------------------------------------------------------------
-- okr_risks: Risk register for objectives
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.okr_risks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    objective_id UUID NOT NULL REFERENCES public.okr_objectives(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    likelihood okr_risk_level NOT NULL DEFAULT 'medium',
    impact okr_risk_level NOT NULL DEFAULT 'medium',
    mitigation_strategy TEXT NOT NULL,
    owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'identified' CHECK (status IN ('identified', 'monitoring', 'mitigated', 'occurred', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.okr_risks IS 'Risk register for objectives with likelihood/impact matrix';

-- ----------------------------------------------------------------------------
-- okr_compliance: Weekly compliance tracking
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.okr_compliance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    week_number INTEGER NOT NULL CHECK (week_number >= 1 AND week_number <= 53),
    year INTEGER NOT NULL,
    check_in_required BOOLEAN NOT NULL DEFAULT TRUE,
    check_in_completed BOOLEAN NOT NULL DEFAULT FALSE,
    completion_date TIMESTAMPTZ,
    is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
    blocked_at TIMESTAMPTZ,
    blocked_reason TEXT,
    escalation_sent BOOLEAN NOT NULL DEFAULT FALSE,
    escalation_date TIMESTAMPTZ,
    escalation_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    unblocked_at TIMESTAMPTZ,
    grace_period_end DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_compliance_user_week_year UNIQUE (user_id, week_number, year)
);

COMMENT ON TABLE public.okr_compliance IS 'Weekly compliance tracking - ensures everyone checks in';

-- ----------------------------------------------------------------------------
-- okr_user_status: User badge and status tracking
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.okr_user_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    current_badge okr_user_badge NOT NULL DEFAULT 'green',
    consecutive_on_track_weeks INTEGER NOT NULL DEFAULT 0,
    consecutive_missed_weeks INTEGER NOT NULL DEFAULT 0,
    last_check_in_date TIMESTAMPTZ,
    next_check_in_due DATE,
    total_objectives INTEGER NOT NULL DEFAULT 0,
    on_track_count INTEGER NOT NULL DEFAULT 0,
    at_risk_count INTEGER NOT NULL DEFAULT 0,
    behind_count INTEGER NOT NULL DEFAULT 0,
    blocked_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.okr_user_status IS 'Computed user status for dashboard and notifications';
COMMENT ON COLUMN public.okr_user_status.current_badge IS 'green: on track, yellow: at risk, red: behind, blocked: access restricted';

-- ============================================================================
-- STEP 3: Create Learner-Specific Tables
-- ============================================================================

-- ----------------------------------------------------------------------------
-- learner_core_okrs: Institution-defined core OKRs for learners
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.learner_core_okrs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    program_id UUID REFERENCES public.programs(id) ON DELETE SET NULL,
    semester TEXT,
    kr_title TEXT NOT NULL,
    kr_description TEXT,
    baseline_value NUMERIC NOT NULL DEFAULT 0,
    target_value NUMERIC NOT NULL,
    unit TEXT NOT NULL DEFAULT '%',
    auto_source_module TEXT NOT NULL,
    auto_source_query TEXT NOT NULL,
    auto_source_config JSONB,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.learner_core_okrs IS 'Institution-defined KRs that apply to all learners (attendance, grades, etc.)';
COMMENT ON COLUMN public.learner_core_okrs.auto_source_module IS 'Source module: attendance, grades, library, etc.';
COMMENT ON COLUMN public.learner_core_okrs.auto_source_query IS 'Query/function to fetch current value';

-- ----------------------------------------------------------------------------
-- learner_okr_assignments: Learner assignments to core OKRs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.learner_okr_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    core_okr_id UUID NOT NULL REFERENCES public.learner_core_okrs(id) ON DELETE CASCADE,
    academic_year TEXT NOT NULL,
    semester TEXT NOT NULL,
    current_value NUMERIC NOT NULL DEFAULT 0,
    progress NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (progress >= 0),
    status kr_status NOT NULL DEFAULT 'not_started',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_learner_core_okr_year_sem UNIQUE (learner_id, core_okr_id, academic_year, semester)
);

COMMENT ON TABLE public.learner_okr_assignments IS 'Links learners to their assigned core OKRs';

-- ----------------------------------------------------------------------------
-- learner_elective_okrs: Learner self-defined OKRs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.learner_elective_okrs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    why_matters TEXT,
    baseline_value NUMERIC,
    target_value NUMERIC,
    current_value NUMERIC NOT NULL DEFAULT 0,
    unit TEXT,
    deadline DATE NOT NULL,
    progress NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (progress >= 0),
    status kr_status NOT NULL DEFAULT 'not_started',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.learner_elective_okrs IS 'Self-defined personal goals by learners';

-- ============================================================================
-- STEP 4: Create Supporting Tables
-- ============================================================================

-- ----------------------------------------------------------------------------
-- okr_milestones: Milestone celebrations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.okr_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    objective_id UUID REFERENCES public.okr_objectives(id) ON DELETE CASCADE,
    key_result_id UUID REFERENCES public.okr_key_results(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    milestone_type okr_milestone_type NOT NULL,
    achieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    celebration_type TEXT,
    recognition_notes TEXT,
    is_announced BOOLEAN NOT NULL DEFAULT FALSE,
    announced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT milestone_has_target CHECK (objective_id IS NOT NULL OR key_result_id IS NOT NULL)
);

COMMENT ON TABLE public.okr_milestones IS 'Celebrate milestone achievements (50%, 75%, 100%, exceeded)';

-- ----------------------------------------------------------------------------
-- okr_auto_track_sources: Configuration for auto-tracked KRs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.okr_auto_track_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_module TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    metric_key TEXT NOT NULL UNIQUE,
    description TEXT,
    query_template TEXT NOT NULL,
    default_unit TEXT NOT NULL DEFAULT '%',
    refresh_frequency TEXT NOT NULL DEFAULT 'daily' CHECK (refresh_frequency IN ('realtime', 'hourly', 'daily', 'weekly')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.okr_auto_track_sources IS 'Registry of available auto-track data sources';

-- ----------------------------------------------------------------------------
-- okr_comments: Comments on OKR entities
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.okr_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type okr_entity_type NOT NULL,
    entity_id UUID NOT NULL,
    content TEXT NOT NULL,
    parent_comment_id UUID REFERENCES public.okr_comments(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    mentioned_user_ids UUID[] DEFAULT '{}',
    is_edited BOOLEAN NOT NULL DEFAULT FALSE,
    edited_at TIMESTAMPTZ,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.okr_comments IS 'Comments and discussions on objectives, KRs, and check-ins';

-- ----------------------------------------------------------------------------
-- okr_reactions: Reactions on OKR entities
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.okr_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL CHECK (entity_type IN ('objective', 'key_result', 'check_in', 'comment')),
    entity_id UUID NOT NULL,
    reaction_type okr_reaction_type NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_user_entity_reaction UNIQUE (user_id, entity_type, entity_id, reaction_type)
);

COMMENT ON TABLE public.okr_reactions IS 'Reactions (like, celebrate, etc.) on OKR entities';

-- ----------------------------------------------------------------------------
-- okr_attachments: File attachments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.okr_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL CHECK (entity_type IN ('objective', 'key_result', 'check_in', 'comment')),
    entity_id UUID NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER,
    storage_path TEXT,
    external_url TEXT,
    description TEXT,
    thumbnail_path TEXT,
    uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT has_file_location CHECK (storage_path IS NOT NULL OR external_url IS NOT NULL)
);

COMMENT ON TABLE public.okr_attachments IS 'File attachments for OKR entities';

-- ============================================================================
-- STEP 5: Create Indexes
-- ============================================================================

-- okr_objectives indexes
CREATE INDEX IF NOT EXISTS idx_okr_objectives_owner ON public.okr_objectives(owner_id);
CREATE INDEX IF NOT EXISTS idx_okr_objectives_parent ON public.okr_objectives(parent_objective_id);
CREATE INDEX IF NOT EXISTS idx_okr_objectives_institution ON public.okr_objectives(institution_id);
CREATE INDEX IF NOT EXISTS idx_okr_objectives_department ON public.okr_objectives(department_id);
CREATE INDEX IF NOT EXISTS idx_okr_objectives_status ON public.okr_objectives(status);
CREATE INDEX IF NOT EXISTS idx_okr_objectives_tier_level ON public.okr_objectives(tier, level);
CREATE INDEX IF NOT EXISTS idx_okr_objectives_dates ON public.okr_objectives(start_date, end_date);

-- okr_key_results indexes
CREATE INDEX IF NOT EXISTS idx_okr_key_results_objective ON public.okr_key_results(objective_id);
CREATE INDEX IF NOT EXISTS idx_okr_key_results_status ON public.okr_key_results(status);
CREATE INDEX IF NOT EXISTS idx_okr_key_results_deadline ON public.okr_key_results(deadline);
CREATE INDEX IF NOT EXISTS idx_okr_key_results_data_source ON public.okr_key_results(data_source);

-- okr_check_ins indexes
CREATE INDEX IF NOT EXISTS idx_okr_check_ins_user ON public.okr_check_ins(user_id);
CREATE INDEX IF NOT EXISTS idx_okr_check_ins_week_year ON public.okr_check_ins(year, week_number);
CREATE INDEX IF NOT EXISTS idx_okr_check_ins_due_date ON public.okr_check_ins(due_date);
CREATE INDEX IF NOT EXISTS idx_okr_check_ins_overdue ON public.okr_check_ins(is_overdue) WHERE is_overdue = TRUE;

-- okr_kr_updates indexes
CREATE INDEX IF NOT EXISTS idx_okr_kr_updates_key_result ON public.okr_kr_updates(key_result_id);
CREATE INDEX IF NOT EXISTS idx_okr_kr_updates_check_in ON public.okr_kr_updates(check_in_id);

-- okr_dependencies indexes
CREATE INDEX IF NOT EXISTS idx_okr_dependencies_objective ON public.okr_dependencies(objective_id);
CREATE INDEX IF NOT EXISTS idx_okr_dependencies_status ON public.okr_dependencies(status);

-- okr_tasks indexes
CREATE INDEX IF NOT EXISTS idx_okr_tasks_objective ON public.okr_tasks(objective_id);
CREATE INDEX IF NOT EXISTS idx_okr_tasks_key_result ON public.okr_tasks(key_result_id);
CREATE INDEX IF NOT EXISTS idx_okr_tasks_responsible ON public.okr_tasks(responsible_id);
CREATE INDEX IF NOT EXISTS idx_okr_tasks_deadline ON public.okr_tasks(deadline);

-- okr_risks indexes
CREATE INDEX IF NOT EXISTS idx_okr_risks_objective ON public.okr_risks(objective_id);
CREATE INDEX IF NOT EXISTS idx_okr_risks_owner ON public.okr_risks(owner_id);

-- okr_compliance indexes
CREATE INDEX IF NOT EXISTS idx_okr_compliance_user ON public.okr_compliance(user_id);
CREATE INDEX IF NOT EXISTS idx_okr_compliance_week_year ON public.okr_compliance(year, week_number);
CREATE INDEX IF NOT EXISTS idx_okr_compliance_blocked ON public.okr_compliance(is_blocked) WHERE is_blocked = TRUE;

-- okr_user_status indexes
CREATE INDEX IF NOT EXISTS idx_okr_user_status_badge ON public.okr_user_status(current_badge);

-- learner tables indexes
CREATE INDEX IF NOT EXISTS idx_learner_core_okrs_institution ON public.learner_core_okrs(institution_id);
CREATE INDEX IF NOT EXISTS idx_learner_core_okrs_department ON public.learner_core_okrs(department_id);
CREATE INDEX IF NOT EXISTS idx_learner_okr_assignments_learner ON public.learner_okr_assignments(learner_id);
CREATE INDEX IF NOT EXISTS idx_learner_okr_assignments_core_okr ON public.learner_okr_assignments(core_okr_id);
CREATE INDEX IF NOT EXISTS idx_learner_elective_okrs_learner ON public.learner_elective_okrs(learner_id);

-- okr_milestones indexes
CREATE INDEX IF NOT EXISTS idx_okr_milestones_user ON public.okr_milestones(user_id);
CREATE INDEX IF NOT EXISTS idx_okr_milestones_objective ON public.okr_milestones(objective_id);
CREATE INDEX IF NOT EXISTS idx_okr_milestones_key_result ON public.okr_milestones(key_result_id);

-- okr_comments indexes
CREATE INDEX IF NOT EXISTS idx_okr_comments_entity ON public.okr_comments(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_okr_comments_author ON public.okr_comments(author_id);
CREATE INDEX IF NOT EXISTS idx_okr_comments_parent ON public.okr_comments(parent_comment_id);

-- okr_reactions indexes
CREATE INDEX IF NOT EXISTS idx_okr_reactions_entity ON public.okr_reactions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_okr_reactions_user ON public.okr_reactions(user_id);

-- okr_attachments indexes
CREATE INDEX IF NOT EXISTS idx_okr_attachments_entity ON public.okr_attachments(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_okr_attachments_uploader ON public.okr_attachments(uploaded_by);

-- ============================================================================
-- STEP 6: Create Updated_at Triggers
-- ============================================================================

-- Create the trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all OKR tables with updated_at
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['okr_objectives', 'okr_key_results', 'okr_check_ins', 'okr_dependencies',
                              'okr_tasks', 'okr_risks', 'okr_compliance', 'okr_user_status',
                              'learner_core_okrs', 'learner_okr_assignments', 'learner_elective_okrs',
                              'okr_comments']
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS update_%s_updated_at ON public.%s;
            CREATE TRIGGER update_%s_updated_at
                BEFORE UPDATE ON public.%s
                FOR EACH ROW
                EXECUTE FUNCTION public.update_updated_at_column();
        ', t, t, t, t);
    END LOOP;
END $$;

-- ============================================================================
-- STEP 7: Enable RLS and Create Policies
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.okr_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.okr_key_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.okr_check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.okr_kr_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.okr_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.okr_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.okr_risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.okr_compliance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.okr_user_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learner_core_okrs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learner_okr_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learner_elective_okrs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.okr_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.okr_auto_track_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.okr_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.okr_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.okr_attachments ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- RLS Policies for okr_objectives
-- ----------------------------------------------------------------------------
-- SELECT: Users can see objectives they own, are in their institution, or are organization-level
CREATE POLICY "okr_objectives_select" ON public.okr_objectives
    FOR SELECT TO authenticated
    USING (
        owner_id = auth.uid()
        OR created_by = auth.uid()
        OR level = 'organization'
        OR institution_id IN (
            SELECT institution_id FROM public.profiles WHERE id = auth.uid()
        )
    );

-- INSERT: Users can create objectives for themselves or their institution
CREATE POLICY "okr_objectives_insert" ON public.okr_objectives
    FOR INSERT TO authenticated
    WITH CHECK (
        owner_id = auth.uid()
        OR (
            institution_id IN (
                SELECT institution_id FROM public.profiles WHERE id = auth.uid()
            )
            AND EXISTS (
                SELECT 1 FROM public.profiles
                WHERE id = auth.uid()
                AND role IN ('admin', 'manager', 'head')
            )
        )
    );

-- UPDATE: Owners and admins can update
CREATE POLICY "okr_objectives_update" ON public.okr_objectives
    FOR UPDATE TO authenticated
    USING (
        owner_id = auth.uid()
        OR created_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'super_admin')
        )
    );

-- DELETE: Only owners and admins can delete
CREATE POLICY "okr_objectives_delete" ON public.okr_objectives
    FOR DELETE TO authenticated
    USING (
        owner_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'super_admin')
        )
    );

-- ----------------------------------------------------------------------------
-- RLS Policies for okr_key_results
-- ----------------------------------------------------------------------------
CREATE POLICY "okr_key_results_select" ON public.okr_key_results
    FOR SELECT TO authenticated
    USING (
        objective_id IN (
            SELECT id FROM public.okr_objectives
            WHERE owner_id = auth.uid()
            OR created_by = auth.uid()
            OR level = 'organization'
            OR institution_id IN (
                SELECT institution_id FROM public.profiles WHERE id = auth.uid()
            )
        )
    );

CREATE POLICY "okr_key_results_insert" ON public.okr_key_results
    FOR INSERT TO authenticated
    WITH CHECK (
        objective_id IN (
            SELECT id FROM public.okr_objectives
            WHERE owner_id = auth.uid() OR created_by = auth.uid()
        )
    );

CREATE POLICY "okr_key_results_update" ON public.okr_key_results
    FOR UPDATE TO authenticated
    USING (
        objective_id IN (
            SELECT id FROM public.okr_objectives
            WHERE owner_id = auth.uid() OR created_by = auth.uid()
        )
        OR measured_by = auth.uid()
    );

CREATE POLICY "okr_key_results_delete" ON public.okr_key_results
    FOR DELETE TO authenticated
    USING (
        objective_id IN (
            SELECT id FROM public.okr_objectives
            WHERE owner_id = auth.uid()
        )
    );

-- ----------------------------------------------------------------------------
-- RLS Policies for okr_check_ins
-- ----------------------------------------------------------------------------
CREATE POLICY "okr_check_ins_select" ON public.okr_check_ins
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'manager', 'head')
        )
    );

CREATE POLICY "okr_check_ins_insert" ON public.okr_check_ins
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "okr_check_ins_update" ON public.okr_check_ins
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- RLS Policies for okr_kr_updates
-- ----------------------------------------------------------------------------
CREATE POLICY "okr_kr_updates_select" ON public.okr_kr_updates
    FOR SELECT TO authenticated
    USING (
        check_in_id IN (
            SELECT id FROM public.okr_check_ins WHERE user_id = auth.uid()
        )
        OR key_result_id IN (
            SELECT kr.id FROM public.okr_key_results kr
            JOIN public.okr_objectives o ON kr.objective_id = o.id
            WHERE o.owner_id = auth.uid()
        )
    );

CREATE POLICY "okr_kr_updates_insert" ON public.okr_kr_updates
    FOR INSERT TO authenticated
    WITH CHECK (
        check_in_id IN (
            SELECT id FROM public.okr_check_ins WHERE user_id = auth.uid()
        )
    );

-- ----------------------------------------------------------------------------
-- RLS Policies for okr_dependencies
-- ----------------------------------------------------------------------------
CREATE POLICY "okr_dependencies_select" ON public.okr_dependencies
    FOR SELECT TO authenticated
    USING (
        objective_id IN (
            SELECT id FROM public.okr_objectives
            WHERE owner_id = auth.uid() OR level = 'organization'
            OR institution_id IN (
                SELECT institution_id FROM public.profiles WHERE id = auth.uid()
            )
        )
        OR owner_user_id = auth.uid()
    );

CREATE POLICY "okr_dependencies_insert" ON public.okr_dependencies
    FOR INSERT TO authenticated
    WITH CHECK (
        objective_id IN (
            SELECT id FROM public.okr_objectives WHERE owner_id = auth.uid()
        )
    );

CREATE POLICY "okr_dependencies_update" ON public.okr_dependencies
    FOR UPDATE TO authenticated
    USING (
        owner_user_id = auth.uid()
        OR objective_id IN (
            SELECT id FROM public.okr_objectives WHERE owner_id = auth.uid()
        )
    );

-- ----------------------------------------------------------------------------
-- RLS Policies for okr_tasks
-- ----------------------------------------------------------------------------
CREATE POLICY "okr_tasks_select" ON public.okr_tasks
    FOR SELECT TO authenticated
    USING (
        responsible_id = auth.uid()
        OR accountable_id = auth.uid()
        OR auth.uid() = ANY(consulted_ids)
        OR auth.uid() = ANY(informed_ids)
        OR objective_id IN (
            SELECT id FROM public.okr_objectives WHERE owner_id = auth.uid()
        )
    );

CREATE POLICY "okr_tasks_insert" ON public.okr_tasks
    FOR INSERT TO authenticated
    WITH CHECK (
        objective_id IN (
            SELECT id FROM public.okr_objectives WHERE owner_id = auth.uid()
        )
    );

CREATE POLICY "okr_tasks_update" ON public.okr_tasks
    FOR UPDATE TO authenticated
    USING (
        responsible_id = auth.uid()
        OR accountable_id = auth.uid()
        OR objective_id IN (
            SELECT id FROM public.okr_objectives WHERE owner_id = auth.uid()
        )
    );

-- ----------------------------------------------------------------------------
-- RLS Policies for okr_risks
-- ----------------------------------------------------------------------------
CREATE POLICY "okr_risks_select" ON public.okr_risks
    FOR SELECT TO authenticated
    USING (
        owner_id = auth.uid()
        OR objective_id IN (
            SELECT id FROM public.okr_objectives
            WHERE owner_id = auth.uid() OR level = 'organization'
            OR institution_id IN (
                SELECT institution_id FROM public.profiles WHERE id = auth.uid()
            )
        )
    );

CREATE POLICY "okr_risks_insert" ON public.okr_risks
    FOR INSERT TO authenticated
    WITH CHECK (
        objective_id IN (
            SELECT id FROM public.okr_objectives WHERE owner_id = auth.uid()
        )
    );

CREATE POLICY "okr_risks_update" ON public.okr_risks
    FOR UPDATE TO authenticated
    USING (
        owner_id = auth.uid()
        OR objective_id IN (
            SELECT id FROM public.okr_objectives WHERE owner_id = auth.uid()
        )
    );

-- ----------------------------------------------------------------------------
-- RLS Policies for okr_compliance
-- ----------------------------------------------------------------------------
CREATE POLICY "okr_compliance_select" ON public.okr_compliance
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'manager', 'head')
        )
    );

CREATE POLICY "okr_compliance_insert" ON public.okr_compliance
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'system')
        )
    );

CREATE POLICY "okr_compliance_update" ON public.okr_compliance
    FOR UPDATE TO authenticated
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'manager')
        )
    );

-- ----------------------------------------------------------------------------
-- RLS Policies for okr_user_status
-- ----------------------------------------------------------------------------
CREATE POLICY "okr_user_status_select" ON public.okr_user_status
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'manager', 'head')
        )
    );

CREATE POLICY "okr_user_status_insert" ON public.okr_user_status
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "okr_user_status_update" ON public.okr_user_status
    FOR UPDATE TO authenticated
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'system')
        )
    );

-- ----------------------------------------------------------------------------
-- RLS Policies for learner_core_okrs
-- ----------------------------------------------------------------------------
CREATE POLICY "learner_core_okrs_select" ON public.learner_core_okrs
    FOR SELECT TO authenticated
    USING (
        institution_id IN (
            SELECT institution_id FROM public.profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "learner_core_okrs_insert" ON public.learner_core_okrs
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'manager')
            AND institution_id = learner_core_okrs.institution_id
        )
    );

CREATE POLICY "learner_core_okrs_update" ON public.learner_core_okrs
    FOR UPDATE TO authenticated
    USING (
        created_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin')
        )
    );

-- ----------------------------------------------------------------------------
-- RLS Policies for learner_okr_assignments
-- ----------------------------------------------------------------------------
CREATE POLICY "learner_okr_assignments_select" ON public.learner_okr_assignments
    FOR SELECT TO authenticated
    USING (
        learner_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'manager', 'faculty')
        )
    );

CREATE POLICY "learner_okr_assignments_insert" ON public.learner_okr_assignments
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'system')
        )
    );

CREATE POLICY "learner_okr_assignments_update" ON public.learner_okr_assignments
    FOR UPDATE TO authenticated
    USING (
        learner_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'system')
        )
    );

-- ----------------------------------------------------------------------------
-- RLS Policies for learner_elective_okrs
-- ----------------------------------------------------------------------------
CREATE POLICY "learner_elective_okrs_select" ON public.learner_elective_okrs
    FOR SELECT TO authenticated
    USING (
        learner_id = auth.uid()
        OR approved_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'manager', 'faculty')
        )
    );

CREATE POLICY "learner_elective_okrs_insert" ON public.learner_elective_okrs
    FOR INSERT TO authenticated
    WITH CHECK (learner_id = auth.uid());

CREATE POLICY "learner_elective_okrs_update" ON public.learner_elective_okrs
    FOR UPDATE TO authenticated
    USING (
        learner_id = auth.uid()
        OR approved_by = auth.uid()
    );

CREATE POLICY "learner_elective_okrs_delete" ON public.learner_elective_okrs
    FOR DELETE TO authenticated
    USING (learner_id = auth.uid() AND status = 'not_started');

-- ----------------------------------------------------------------------------
-- RLS Policies for okr_milestones
-- ----------------------------------------------------------------------------
CREATE POLICY "okr_milestones_select" ON public.okr_milestones
    FOR SELECT TO authenticated
    USING (TRUE);  -- Milestones are public celebrations

CREATE POLICY "okr_milestones_insert" ON public.okr_milestones
    FOR INSERT TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'system')
        )
    );

-- ----------------------------------------------------------------------------
-- RLS Policies for okr_auto_track_sources
-- ----------------------------------------------------------------------------
CREATE POLICY "okr_auto_track_sources_select" ON public.okr_auto_track_sources
    FOR SELECT TO authenticated
    USING (is_active = TRUE);

CREATE POLICY "okr_auto_track_sources_insert" ON public.okr_auto_track_sources
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'super_admin')
        )
    );

-- ----------------------------------------------------------------------------
-- RLS Policies for okr_comments
-- ----------------------------------------------------------------------------
CREATE POLICY "okr_comments_select" ON public.okr_comments
    FOR SELECT TO authenticated
    USING (TRUE);  -- Comments on visible entities are readable

CREATE POLICY "okr_comments_insert" ON public.okr_comments
    FOR INSERT TO authenticated
    WITH CHECK (author_id = auth.uid());

CREATE POLICY "okr_comments_update" ON public.okr_comments
    FOR UPDATE TO authenticated
    USING (author_id = auth.uid());

CREATE POLICY "okr_comments_delete" ON public.okr_comments
    FOR DELETE TO authenticated
    USING (author_id = auth.uid());

-- ----------------------------------------------------------------------------
-- RLS Policies for okr_reactions
-- ----------------------------------------------------------------------------
CREATE POLICY "okr_reactions_select" ON public.okr_reactions
    FOR SELECT TO authenticated
    USING (TRUE);

CREATE POLICY "okr_reactions_insert" ON public.okr_reactions
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "okr_reactions_delete" ON public.okr_reactions
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- RLS Policies for okr_attachments
-- ----------------------------------------------------------------------------
CREATE POLICY "okr_attachments_select" ON public.okr_attachments
    FOR SELECT TO authenticated
    USING (TRUE);  -- Attachments on visible entities are readable

CREATE POLICY "okr_attachments_insert" ON public.okr_attachments
    FOR INSERT TO authenticated
    WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "okr_attachments_delete" ON public.okr_attachments
    FOR DELETE TO authenticated
    USING (uploaded_by = auth.uid());

-- ============================================================================
-- STEP 8: Seed Auto-Track Sources
-- ============================================================================

INSERT INTO public.okr_auto_track_sources (source_module, metric_name, metric_key, description, query_template, default_unit, refresh_frequency)
VALUES
    ('attendance', 'Attendance Percentage', 'attendance_percentage', 'Overall attendance percentage for a learner', 'SELECT attendance_percentage FROM attendance_summary WHERE learner_id = $1', '%', 'daily'),
    ('attendance', 'Classes Attended', 'classes_attended', 'Total classes attended', 'SELECT total_present FROM attendance_summary WHERE learner_id = $1', 'classes', 'daily'),
    ('grades', 'CGPA', 'cgpa', 'Cumulative Grade Point Average', 'SELECT cgpa FROM grade_summary WHERE learner_id = $1', 'GPA', 'weekly'),
    ('grades', 'Assignment Completion', 'assignment_completion', 'Percentage of assignments completed', 'SELECT (completed::float / total * 100) FROM assignment_stats WHERE learner_id = $1', '%', 'daily'),
    ('library', 'Books Borrowed', 'books_borrowed', 'Total books borrowed', 'SELECT COUNT(*) FROM library_transactions WHERE learner_id = $1 AND type = ''borrow''', 'books', 'daily'),
    ('placement', 'Skills Completed', 'skills_completed', 'Number of skill certifications', 'SELECT COUNT(*) FROM skill_certifications WHERE learner_id = $1 AND status = ''completed''', 'skills', 'weekly')
ON CONFLICT (metric_key) DO NOTHING;

COMMIT;

-- ============================================================================
-- DOWN MIGRATION (ROLLBACK) - Uncomment to run
-- ============================================================================
/*
BEGIN;

-- Drop policies first
DO $$
DECLARE
    t TEXT;
    p TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['okr_objectives', 'okr_key_results', 'okr_check_ins', 'okr_kr_updates',
                              'okr_dependencies', 'okr_tasks', 'okr_risks', 'okr_compliance',
                              'okr_user_status', 'learner_core_okrs', 'learner_okr_assignments',
                              'learner_elective_okrs', 'okr_milestones', 'okr_auto_track_sources',
                              'okr_comments', 'okr_reactions', 'okr_attachments']
    LOOP
        FOR p IN SELECT policyname FROM pg_policies WHERE tablename = t
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p, t);
        END LOOP;
    END LOOP;
END $$;

-- Drop tables in dependency order
DROP TABLE IF EXISTS public.okr_attachments CASCADE;
DROP TABLE IF EXISTS public.okr_reactions CASCADE;
DROP TABLE IF EXISTS public.okr_comments CASCADE;
DROP TABLE IF EXISTS public.okr_auto_track_sources CASCADE;
DROP TABLE IF EXISTS public.okr_milestones CASCADE;
DROP TABLE IF EXISTS public.learner_elective_okrs CASCADE;
DROP TABLE IF EXISTS public.learner_okr_assignments CASCADE;
DROP TABLE IF EXISTS public.learner_core_okrs CASCADE;
DROP TABLE IF EXISTS public.okr_user_status CASCADE;
DROP TABLE IF EXISTS public.okr_compliance CASCADE;
DROP TABLE IF EXISTS public.okr_risks CASCADE;
DROP TABLE IF EXISTS public.okr_tasks CASCADE;
DROP TABLE IF EXISTS public.okr_dependencies CASCADE;
DROP TABLE IF EXISTS public.okr_kr_updates CASCADE;
DROP TABLE IF EXISTS public.okr_check_ins CASCADE;
DROP TABLE IF EXISTS public.okr_key_results CASCADE;
DROP TABLE IF EXISTS public.okr_objectives CASCADE;

-- Drop ENUMs
DROP TYPE IF EXISTS okr_reaction_type CASCADE;
DROP TYPE IF EXISTS okr_entity_type CASCADE;
DROP TYPE IF EXISTS okr_milestone_type CASCADE;
DROP TYPE IF EXISTS okr_risk_level CASCADE;
DROP TYPE IF EXISTS okr_user_badge CASCADE;
DROP TYPE IF EXISTS okr_update_source CASCADE;
DROP TYPE IF EXISTS okr_dependency_status CASCADE;
DROP TYPE IF EXISTS okr_dependency_type CASCADE;
DROP TYPE IF EXISTS kr_data_source CASCADE;
DROP TYPE IF EXISTS kr_status CASCADE;
DROP TYPE IF EXISTS okr_status CASCADE;
DROP TYPE IF EXISTS okr_cycle_type CASCADE;
DROP TYPE IF EXISTS okr_level CASCADE;
DROP TYPE IF EXISTS okr_tier CASCADE;

COMMIT;
*/
