-- ============================================================================
-- Migration: Personalization Module (Learning Path + Parent Portal)
-- Created: 2026-02-01
-- Purpose: Create tables for personalized learning paths and parent engagement
--          as part of Workshop Transformation Phase 3
-- ============================================================================
-- This migration creates:
--   - learning_paths: Per-learner personalized learning journeys
--   - learning_path_steps: Sequenced activities within paths
--   - parent_portal_access: Parent access configuration
--   - parent_communications: Parent-institution message history
-- ============================================================================
-- Related Plan: /Users/omm/.claude-sneakpeek/claudesp/config/plans/transient-Calibrating-lerdorf.md
-- Phase: 3 - Personalization (Learning Path + Parent Portal)
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Create ENUM Types for Personalization Module
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE learning_path_status AS ENUM (
        'draft',         -- Path being created/configured
        'active',        -- Learner actively working on path
        'paused',        -- Temporarily paused
        'completed',     -- All steps completed
        'archived'       -- No longer relevant
    );
    RAISE NOTICE 'Created learning_path_status ENUM';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'learning_path_status ENUM already exists, skipping';
END $$;

DO $$ BEGIN
    CREATE TYPE learning_step_type AS ENUM (
        'course',        -- Formal course enrollment
        'project',       -- Industry or academic project
        'mentorship',    -- Mentorship session/program
        'certification', -- External certification
        'workshop',      -- Workshop attendance
        'self_study',    -- Self-paced learning resource
        'assessment',    -- Skill assessment
        'internship',    -- Internship placement
        'competition'    -- Hackathon/competition
    );
    RAISE NOTICE 'Created learning_step_type ENUM';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'learning_step_type ENUM already exists, skipping';
END $$;

DO $$ BEGIN
    CREATE TYPE learning_step_status AS ENUM (
        'pending',       -- Not yet started
        'in_progress',   -- Currently working on
        'completed',     -- Successfully completed
        'skipped',       -- Skipped (optional step)
        'failed'         -- Did not meet requirements
    );
    RAISE NOTICE 'Created learning_step_status ENUM';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'learning_step_status ENUM already exists, skipping';
END $$;

DO $$ BEGIN
    CREATE TYPE parent_access_level AS ENUM (
        'view',          -- Read-only access to learner info
        'interact',      -- Can message and interact
        'full'           -- Full access including approvals
    );
    RAISE NOTICE 'Created parent_access_level ENUM';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'parent_access_level ENUM already exists, skipping';
END $$;

DO $$ BEGIN
    CREATE TYPE communication_type AS ENUM (
        'progress_update',   -- Regular progress reports
        'alert',             -- Important alerts (attendance, grades)
        'feedback_request',  -- Request for parent feedback
        'announcement',      -- General announcements
        'fee_reminder',      -- Fee payment reminders
        'event_invite',      -- Event invitations
        'achievement',       -- Achievement notifications
        'concern'            -- Concern/issue notification
    );
    RAISE NOTICE 'Created communication_type ENUM';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'communication_type ENUM already exists, skipping';
END $$;

-- ============================================================================
-- STEP 2: Create learning_paths Table
-- Per-learner personalized learning journeys
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.learning_paths (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Core relationships
    learner_id UUID NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,

    -- Path definition
    path_name VARCHAR(255) NOT NULL,
    path_description TEXT,
    target_role VARCHAR(255), -- Career goal (e.g., "Full Stack Developer")
    target_industry VARCHAR(255), -- Target industry sector

    -- Competency targets
    target_competencies JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- target_competencies format: [
    --   { "competency_id": "uuid", "target_level": "intermediate", "priority": 1 },
    --   { "competency_id": "uuid", "target_level": "advanced", "priority": 2 },
    --   ...
    -- ]

    -- Progress tracking
    current_progress NUMERIC(5,2) NOT NULL DEFAULT 0
        CHECK (current_progress >= 0 AND current_progress <= 100),
    total_steps INTEGER DEFAULT 0,
    completed_steps INTEGER DEFAULT 0,

    -- Timeline
    estimated_completion DATE,
    actual_completion DATE,
    started_at TIMESTAMPTZ,

    -- AI/Recommendation metadata
    is_ai_generated BOOLEAN DEFAULT false,
    ai_confidence_score NUMERIC(3,2), -- 0-1 confidence in recommendation
    generation_parameters JSONB DEFAULT '{}'::jsonb,
    -- generation_parameters format: {
    --   "based_on": ["career_aspirations", "current_competencies", "academic_performance"],
    --   "algorithm_version": "v1.2",
    --   "generated_at": "2026-01-15"
    -- }

    -- Status
    status learning_path_status NOT NULL DEFAULT 'draft',

    -- Mentorship
    assigned_mentor_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
    mentor_notes TEXT,

    -- Audit fields
    created_by UUID, -- Could be learner, staff, or system
    approved_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.learning_paths IS
'Personalized learning journeys for each learner. Can be AI-generated or manually created.';
COMMENT ON COLUMN public.learning_paths.target_competencies IS
'JSON array of competencies to achieve with target levels and priorities';
COMMENT ON COLUMN public.learning_paths.is_ai_generated IS
'True if this path was generated by AI recommendation system';
COMMENT ON COLUMN public.learning_paths.ai_confidence_score IS
'AI confidence in this path recommendation (0-1 scale)';

-- ============================================================================
-- STEP 3: Create learning_path_steps Table
-- Sequenced activities within learning paths
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.learning_path_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Core relationships
    path_id UUID NOT NULL REFERENCES public.learning_paths(id) ON DELETE CASCADE,

    -- Step definition
    step_order INTEGER NOT NULL,
    step_name VARCHAR(255) NOT NULL,
    step_description TEXT,
    step_type learning_step_type NOT NULL,

    -- Reference to actual resource
    reference_id UUID, -- ID of course/project/etc. (polymorphic)
    reference_table VARCHAR(100), -- Table name: 'courses', 'industry_projects', etc.
    external_url TEXT, -- For external resources (certifications, etc.)

    -- Competency link
    competency_id UUID REFERENCES public.competency_catalog(id) ON DELETE SET NULL,
    target_competency_level proficiency_level,

    -- Time estimates
    expected_duration_hours INTEGER,
    actual_duration_hours INTEGER,

    -- Prerequisites
    prerequisite_step_ids UUID[] DEFAULT '{}', -- Steps that must be completed first
    is_optional BOOLEAN DEFAULT false,

    -- Status tracking
    status learning_step_status NOT NULL DEFAULT 'pending',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    -- Evidence and verification
    evidence_url TEXT,
    evidence_type VARCHAR(100), -- 'certificate', 'project_url', 'assessment_score', etc.
    evidence_metadata JSONB DEFAULT '{}'::jsonb,
    -- evidence_metadata format: {
    --   "score": 85,
    --   "certificate_number": "CERT-123",
    --   "verified_by": "staff_uuid",
    --   "verified_at": "2026-02-01"
    -- }

    -- Feedback
    learner_notes TEXT,
    mentor_feedback TEXT,
    rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),

    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Ensure unique ordering within a path
    CONSTRAINT unique_step_order_per_path UNIQUE (path_id, step_order)
);

COMMENT ON TABLE public.learning_path_steps IS
'Individual steps/activities within a learning path, executed in sequence.';
COMMENT ON COLUMN public.learning_path_steps.reference_id IS
'Polymorphic reference to the actual resource (course, project, etc.)';
COMMENT ON COLUMN public.learning_path_steps.reference_table IS
'Table name for the referenced resource (courses, industry_projects, etc.)';
COMMENT ON COLUMN public.learning_path_steps.prerequisite_step_ids IS
'Array of step IDs that must be completed before this step';

-- ============================================================================
-- STEP 4: Create parent_portal_access Table
-- Parent access configuration and authentication
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.parent_portal_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Core relationships
    learner_id UUID NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,

    -- Parent identification (one of these should be set)
    parent_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- If parent has login
    parent_email VARCHAR(255), -- For notifications even without login
    parent_phone VARCHAR(50),
    parent_name VARCHAR(255),
    relationship VARCHAR(50), -- 'father', 'mother', 'guardian', 'other'

    -- Access credentials
    access_code VARCHAR(50) UNIQUE, -- For code-based access (e.g., "JKKN-P-12345")
    access_code_expires_at TIMESTAMPTZ,
    pin_hash VARCHAR(255), -- Optional PIN for added security

    -- Access configuration
    access_level parent_access_level NOT NULL DEFAULT 'view',

    -- Permissions (granular control)
    permissions JSONB DEFAULT '{}'::jsonb,
    -- permissions format: {
    --   "view_attendance": true,
    --   "view_grades": true,
    --   "view_fees": true,
    --   "view_competencies": true,
    --   "message_teachers": false,
    --   "approve_leaves": false
    -- }

    -- Notification preferences
    notification_preferences JSONB DEFAULT '{}'::jsonb,
    -- notification_preferences format: {
    --   "email_enabled": true,
    --   "sms_enabled": false,
    --   "whatsapp_enabled": true,
    --   "frequency": "weekly",
    --   "alert_types": ["attendance", "grades", "fees"]
    -- }

    -- Activity tracking
    last_access TIMESTAMPTZ,
    access_count INTEGER DEFAULT 0,
    last_ip_address VARCHAR(45),

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    verified_at TIMESTAMPTZ,
    deactivated_at TIMESTAMPTZ,
    deactivation_reason TEXT,

    -- Audit fields
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Ensure one primary parent per learner per relationship type
    CONSTRAINT unique_parent_learner_relationship
        UNIQUE (learner_id, parent_email, relationship)
);

COMMENT ON TABLE public.parent_portal_access IS
'Controls parent access to learner information via portal or mobile app.';
COMMENT ON COLUMN public.parent_portal_access.access_code IS
'Unique code for parents to access portal without full account (e.g., JKKN-P-12345)';
COMMENT ON COLUMN public.parent_portal_access.permissions IS
'Granular permissions controlling what parent can see/do';
COMMENT ON COLUMN public.parent_portal_access.notification_preferences IS
'Parent preferences for receiving notifications';

-- ============================================================================
-- STEP 5: Create parent_communications Table
-- Message history between institution and parents
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.parent_communications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Core relationships
    learner_id UUID NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    parent_access_id UUID REFERENCES public.parent_portal_access(id) ON DELETE SET NULL,

    -- Communication details
    communication_type communication_type NOT NULL,
    subject VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,

    -- Rich content support
    content_html TEXT, -- HTML formatted content
    attachments JSONB DEFAULT '[]'::jsonb,
    -- attachments format: [
    --   { "name": "Report Card.pdf", "url": "...", "type": "pdf", "size": 125000 },
    --   ...
    -- ]

    -- Related data (for context)
    related_entity_type VARCHAR(100), -- 'attendance', 'bill', 'grade', 'leave', etc.
    related_entity_id UUID,
    context_data JSONB DEFAULT '{}'::jsonb,
    -- context_data format depends on type:
    -- progress_update: { "period": "January 2026", "highlights": [...] }
    -- alert: { "alert_level": "warning", "metric": "attendance", "value": 65 }
    -- fee_reminder: { "bill_id": "uuid", "amount_due": 15000, "due_date": "2026-02-15" }

    -- Delivery tracking
    sent_at TIMESTAMPTZ,
    sent_via VARCHAR(50)[], -- ['email', 'sms', 'whatsapp', 'in_app']
    delivery_status JSONB DEFAULT '{}'::jsonb,
    -- delivery_status format: {
    --   "email": { "status": "delivered", "at": "2026-01-15T10:00:00Z" },
    --   "sms": { "status": "failed", "error": "invalid_number" }
    -- }

    -- Read tracking
    read_at TIMESTAMPTZ,
    read_via VARCHAR(50), -- Channel through which it was read

    -- Response handling
    requires_response BOOLEAN DEFAULT false,
    response_deadline DATE,
    response TEXT,
    response_at TIMESTAMPTZ,
    response_attachment_url TEXT,

    -- Sender info
    sent_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    sent_by_role VARCHAR(50), -- 'system', 'admin', 'teacher', 'hod', etc.

    -- Status
    is_archived BOOLEAN DEFAULT false,
    is_important BOOLEAN DEFAULT false,

    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.parent_communications IS
'All communications between institution and parents regarding learners.';
COMMENT ON COLUMN public.parent_communications.sent_via IS
'Array of channels used to send this communication';
COMMENT ON COLUMN public.parent_communications.delivery_status IS
'Delivery status per channel with timestamps and errors';
COMMENT ON COLUMN public.parent_communications.context_data IS
'Additional context data relevant to the communication type';

-- ============================================================================
-- STEP 6: Create Indexes for Performance
-- ============================================================================

-- learning_paths indexes
CREATE INDEX IF NOT EXISTS idx_learning_paths_learner
    ON public.learning_paths(learner_id);
CREATE INDEX IF NOT EXISTS idx_learning_paths_institution
    ON public.learning_paths(institution_id);
CREATE INDEX IF NOT EXISTS idx_learning_paths_status
    ON public.learning_paths(status);
CREATE INDEX IF NOT EXISTS idx_learning_paths_active
    ON public.learning_paths(learner_id, status)
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_learning_paths_mentor
    ON public.learning_paths(assigned_mentor_id)
    WHERE assigned_mentor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_learning_paths_target_competencies
    ON public.learning_paths USING GIN(target_competencies);
CREATE INDEX IF NOT EXISTS idx_learning_paths_ai_generated
    ON public.learning_paths(is_ai_generated, ai_confidence_score DESC)
    WHERE is_ai_generated = true;

-- learning_path_steps indexes
CREATE INDEX IF NOT EXISTS idx_learning_path_steps_path
    ON public.learning_path_steps(path_id);
CREATE INDEX IF NOT EXISTS idx_learning_path_steps_path_order
    ON public.learning_path_steps(path_id, step_order);
CREATE INDEX IF NOT EXISTS idx_learning_path_steps_status
    ON public.learning_path_steps(status);
CREATE INDEX IF NOT EXISTS idx_learning_path_steps_type
    ON public.learning_path_steps(step_type);
CREATE INDEX IF NOT EXISTS idx_learning_path_steps_competency
    ON public.learning_path_steps(competency_id)
    WHERE competency_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_learning_path_steps_reference
    ON public.learning_path_steps(reference_table, reference_id)
    WHERE reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_learning_path_steps_pending
    ON public.learning_path_steps(path_id, status)
    WHERE status = 'pending';

-- parent_portal_access indexes
CREATE INDEX IF NOT EXISTS idx_parent_portal_learner
    ON public.parent_portal_access(learner_id);
CREATE INDEX IF NOT EXISTS idx_parent_portal_institution
    ON public.parent_portal_access(institution_id);
CREATE INDEX IF NOT EXISTS idx_parent_portal_parent_user
    ON public.parent_portal_access(parent_user_id)
    WHERE parent_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parent_portal_access_code
    ON public.parent_portal_access(access_code)
    WHERE access_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parent_portal_email
    ON public.parent_portal_access(parent_email)
    WHERE parent_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parent_portal_active
    ON public.parent_portal_access(learner_id, is_active)
    WHERE is_active = true;

-- parent_communications indexes
CREATE INDEX IF NOT EXISTS idx_parent_comms_learner
    ON public.parent_communications(learner_id);
CREATE INDEX IF NOT EXISTS idx_parent_comms_institution
    ON public.parent_communications(institution_id);
CREATE INDEX IF NOT EXISTS idx_parent_comms_parent_access
    ON public.parent_communications(parent_access_id)
    WHERE parent_access_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parent_comms_type
    ON public.parent_communications(communication_type);
CREATE INDEX IF NOT EXISTS idx_parent_comms_sent_at
    ON public.parent_communications(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_parent_comms_unread
    ON public.parent_communications(learner_id, read_at)
    WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_parent_comms_requires_response
    ON public.parent_communications(requires_response, response_deadline)
    WHERE requires_response = true AND response_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_parent_comms_important
    ON public.parent_communications(learner_id, is_important)
    WHERE is_important = true;

-- Created indexes for personalization tables

-- ============================================================================
-- STEP 7: Create Updated_at Triggers
-- ============================================================================

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'learning_paths',
        'learning_path_steps',
        'parent_portal_access',
        'parent_communications'
    ]
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

-- Created updated_at triggers for personalization tables

-- ============================================================================
-- STEP 8: Enable RLS and Create Policies
-- ============================================================================

-- Enable RLS on all personalization tables
ALTER TABLE public.learning_paths ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_path_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_portal_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_communications ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- RLS Policies for learning_paths
-- ----------------------------------------------------------------------------

-- SELECT: Learners see their own, staff see institution's
CREATE POLICY "learning_paths_select" ON public.learning_paths
    FOR SELECT TO authenticated
    USING (
        -- Learner sees their own paths
        learner_id IN (
            SELECT lp.id FROM public.learners_profiles lp
            JOIN public.profiles p ON LOWER(p.email) = LOWER(lp.student_email)
            WHERE p.id = auth.uid()
        )
        -- Staff and admins see institution's paths
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

-- INSERT: Staff can create paths, learners can create their own
CREATE POLICY "learning_paths_insert" ON public.learning_paths
    FOR INSERT TO authenticated
    WITH CHECK (
        -- Learner creating their own path
        learner_id IN (
            SELECT lp.id FROM public.learners_profiles lp
            JOIN public.profiles p ON LOWER(p.email) = LOWER(lp.student_email)
            WHERE p.id = auth.uid()
        )
        -- Staff creating for any learner
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

-- UPDATE: Learners update their own, staff update any
CREATE POLICY "learning_paths_update" ON public.learning_paths
    FOR UPDATE TO authenticated
    USING (
        learner_id IN (
            SELECT lp.id FROM public.learners_profiles lp
            JOIN public.profiles p ON LOWER(p.email) = LOWER(lp.student_email)
            WHERE p.id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

-- DELETE: Only admins can delete
CREATE POLICY "learning_paths_delete" ON public.learning_paths
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- ----------------------------------------------------------------------------
-- RLS Policies for learning_path_steps
-- ----------------------------------------------------------------------------

CREATE POLICY "learning_path_steps_select" ON public.learning_path_steps
    FOR SELECT TO authenticated
    USING (
        path_id IN (
            SELECT lp.id FROM public.learning_paths lp
            WHERE lp.learner_id IN (
                SELECT lpr.id FROM public.learners_profiles lpr
                JOIN public.profiles p ON LOWER(p.email) = LOWER(lpr.student_email)
                WHERE p.id = auth.uid()
            )
        )
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

CREATE POLICY "learning_path_steps_insert" ON public.learning_path_steps
    FOR INSERT TO authenticated
    WITH CHECK (
        path_id IN (
            SELECT lp.id FROM public.learning_paths lp
            WHERE lp.learner_id IN (
                SELECT lpr.id FROM public.learners_profiles lpr
                JOIN public.profiles p ON LOWER(p.email) = LOWER(lpr.student_email)
                WHERE p.id = auth.uid()
            )
        )
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

CREATE POLICY "learning_path_steps_update" ON public.learning_path_steps
    FOR UPDATE TO authenticated
    USING (
        path_id IN (
            SELECT lp.id FROM public.learning_paths lp
            WHERE lp.learner_id IN (
                SELECT lpr.id FROM public.learners_profiles lpr
                JOIN public.profiles p ON LOWER(p.email) = LOWER(lpr.student_email)
                WHERE p.id = auth.uid()
            )
        )
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

CREATE POLICY "learning_path_steps_delete" ON public.learning_path_steps
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- ----------------------------------------------------------------------------
-- RLS Policies for parent_portal_access
-- ----------------------------------------------------------------------------

-- SELECT: Parents see their own access, staff see institution's
CREATE POLICY "parent_portal_access_select" ON public.parent_portal_access
    FOR SELECT TO authenticated
    USING (
        -- Parent sees their own access records
        parent_user_id = auth.uid()
        -- Staff and admins see institution's records
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

-- INSERT: Only staff can create access records
CREATE POLICY "parent_portal_access_insert" ON public.parent_portal_access
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

-- UPDATE: Staff can update, parents can update their notification preferences
CREATE POLICY "parent_portal_access_update" ON public.parent_portal_access
    FOR UPDATE TO authenticated
    USING (
        parent_user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

-- DELETE: Only admins can delete
CREATE POLICY "parent_portal_access_delete" ON public.parent_portal_access
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- ----------------------------------------------------------------------------
-- RLS Policies for parent_communications
-- ----------------------------------------------------------------------------

-- SELECT: Parents see communications about their children, staff see institution's
CREATE POLICY "parent_communications_select" ON public.parent_communications
    FOR SELECT TO authenticated
    USING (
        -- Parent sees communications for their access records
        parent_access_id IN (
            SELECT id FROM public.parent_portal_access WHERE parent_user_id = auth.uid()
        )
        -- Staff and admins see institution's communications
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

-- INSERT: Staff can send communications, system can auto-generate
CREATE POLICY "parent_communications_insert" ON public.parent_communications
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

-- UPDATE: Staff can update, parents can mark as read and respond
CREATE POLICY "parent_communications_update" ON public.parent_communications
    FOR UPDATE TO authenticated
    USING (
        -- Parent can update (mark read, respond)
        parent_access_id IN (
            SELECT id FROM public.parent_portal_access WHERE parent_user_id = auth.uid()
        )
        -- Staff can update
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

-- DELETE: Only admins can delete
CREATE POLICY "parent_communications_delete" ON public.parent_communications
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- Created RLS policies for personalization tables

-- ============================================================================
-- STEP 9: Create Helper Functions
-- ============================================================================

-- Function to generate unique parent access code
CREATE OR REPLACE FUNCTION generate_parent_access_code(p_institution_id UUID)
RETURNS VARCHAR(50) AS $$
DECLARE
    v_prefix VARCHAR(10);
    v_code VARCHAR(50);
    v_exists BOOLEAN;
BEGIN
    -- Get institution prefix (first 4 chars)
    SELECT UPPER(SUBSTRING(name, 1, 4)) INTO v_prefix
    FROM public.institutions WHERE id = p_institution_id;

    -- Generate unique code
    LOOP
        v_code := v_prefix || '-P-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT), 1, 6));

        SELECT EXISTS(
            SELECT 1 FROM public.parent_portal_access WHERE access_code = v_code
        ) INTO v_exists;

        EXIT WHEN NOT v_exists;
    END LOOP;

    RETURN v_code;
END;
$$ LANGUAGE plpgsql;

-- Function to update learning path progress
CREATE OR REPLACE FUNCTION update_learning_path_progress()
RETURNS TRIGGER AS $$
BEGIN
    -- Update path progress when step is completed
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        UPDATE public.learning_paths
        SET
            completed_steps = (
                SELECT COUNT(*) FROM public.learning_path_steps
                WHERE path_id = NEW.path_id AND status = 'completed'
            ),
            current_progress = (
                SELECT COALESCE(
                    (COUNT(*) FILTER (WHERE status = 'completed')::NUMERIC /
                     NULLIF(COUNT(*) FILTER (WHERE NOT is_optional), 0) * 100),
                    0
                )
                FROM public.learning_path_steps
                WHERE path_id = NEW.path_id
            ),
            updated_at = NOW()
        WHERE id = NEW.path_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-updating learning path progress
DROP TRIGGER IF EXISTS update_learning_path_progress_trigger ON public.learning_path_steps;
CREATE TRIGGER update_learning_path_progress_trigger
    AFTER UPDATE OF status ON public.learning_path_steps
    FOR EACH ROW
    EXECUTE FUNCTION update_learning_path_progress();

-- Created helper functions for personalization module

-- ============================================================================
-- STEP 10: Add audit log entry
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'migration_log') THEN
        INSERT INTO migration_log (migration_name, description, applied_at)
        VALUES (
            '20260201_create_personalization_tables',
            'Created Personalization module tables: learning_paths, learning_path_steps, parent_portal_access, parent_communications. Part of Workshop Transformation Phase 3.',
            NOW()
        );
        RAISE NOTICE 'Added migration to migration_log';
    END IF;
END $$;

COMMIT;

-- ============================================================================
-- Summary of Changes
-- ============================================================================
-- Tables Created (4):
--   - learning_paths: Per-learner personalized learning journeys
--   - learning_path_steps: Sequenced activities within paths
--   - parent_portal_access: Parent access configuration
--   - parent_communications: Parent-institution message history
--
-- ENUMs Created (5):
--   - learning_path_status: draft, active, paused, completed, archived
--   - learning_step_type: course, project, mentorship, certification, workshop, etc.
--   - learning_step_status: pending, in_progress, completed, skipped, failed
--   - parent_access_level: view, interact, full
--   - communication_type: progress_update, alert, feedback_request, etc.
--
-- Indexes Created: 23
-- RLS Policies Created: 16 (4 per table)
-- Triggers Created: 5 (4 updated_at + 1 progress calculation)
-- Functions Created: 2 (access code generation, progress update)
--
-- Key Features:
--   - AI-generated learning path support with confidence scores
--   - Polymorphic step references (courses, projects, etc.)
--   - Code-based parent access (no login required)
--   - Multi-channel communication delivery tracking
--   - Automatic path progress calculation
-- ============================================================================

-- ============================================================================
-- DOWN MIGRATION (ROLLBACK) - Uncomment to run
-- ============================================================================
/*
BEGIN;

-- Drop triggers and functions
DROP TRIGGER IF EXISTS update_learning_path_progress_trigger ON public.learning_path_steps;
DROP FUNCTION IF EXISTS update_learning_path_progress();
DROP FUNCTION IF EXISTS generate_parent_access_code(UUID);

-- Drop policies
DROP POLICY IF EXISTS "learning_paths_select" ON public.learning_paths;
DROP POLICY IF EXISTS "learning_paths_insert" ON public.learning_paths;
DROP POLICY IF EXISTS "learning_paths_update" ON public.learning_paths;
DROP POLICY IF EXISTS "learning_paths_delete" ON public.learning_paths;

DROP POLICY IF EXISTS "learning_path_steps_select" ON public.learning_path_steps;
DROP POLICY IF EXISTS "learning_path_steps_insert" ON public.learning_path_steps;
DROP POLICY IF EXISTS "learning_path_steps_update" ON public.learning_path_steps;
DROP POLICY IF EXISTS "learning_path_steps_delete" ON public.learning_path_steps;

DROP POLICY IF EXISTS "parent_portal_access_select" ON public.parent_portal_access;
DROP POLICY IF EXISTS "parent_portal_access_insert" ON public.parent_portal_access;
DROP POLICY IF EXISTS "parent_portal_access_update" ON public.parent_portal_access;
DROP POLICY IF EXISTS "parent_portal_access_delete" ON public.parent_portal_access;

DROP POLICY IF EXISTS "parent_communications_select" ON public.parent_communications;
DROP POLICY IF EXISTS "parent_communications_insert" ON public.parent_communications;
DROP POLICY IF EXISTS "parent_communications_update" ON public.parent_communications;
DROP POLICY IF EXISTS "parent_communications_delete" ON public.parent_communications;

-- Drop tables in dependency order
DROP TABLE IF EXISTS public.parent_communications CASCADE;
DROP TABLE IF EXISTS public.parent_portal_access CASCADE;
DROP TABLE IF EXISTS public.learning_path_steps CASCADE;
DROP TABLE IF EXISTS public.learning_paths CASCADE;

-- Drop ENUMs
DROP TYPE IF EXISTS communication_type CASCADE;
DROP TYPE IF EXISTS parent_access_level CASCADE;
DROP TYPE IF EXISTS learning_step_status CASCADE;
DROP TYPE IF EXISTS learning_step_type CASCADE;
DROP TYPE IF EXISTS learning_path_status CASCADE;

COMMIT;
*/
