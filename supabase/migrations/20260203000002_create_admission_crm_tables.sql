-- ============================================================================
-- Admission CRM Module - Complete Database Schema
-- Created: 2026-02-03
-- Description: Creates all tables for the Admission CRM lead management system
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

-- Lead source enum
DO $$ BEGIN
    CREATE TYPE lead_source AS ENUM (
        'website', 'walk_in', 'referral', 'social_media', 'newspaper',
        'education_fair', 'agent', 'publisher', 'google_ads', 'facebook_ads', 'other'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Funnel stage enum (lead progression)
DO $$ BEGIN
    CREATE TYPE funnel_stage AS ENUM (
        'new', 'contacted', 'qualified', 'application_started', 'application_submitted',
        'documents_pending', 'documents_verified', 'interview_scheduled', 'interview_completed',
        'offer_sent', 'offer_accepted', 'token_paid', 'enrolled', 'lost'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Lead priority enum
DO $$ BEGIN
    CREATE TYPE lead_priority AS ENUM ('hot', 'warm', 'cold');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Document type enum
DO $$ BEGIN
    CREATE TYPE admission_document_type AS ENUM (
        'photo', 'id_proof', 'address_proof', 'marksheet_10th', 'marksheet_12th',
        'degree_certificate', 'transfer_certificate', 'migration_certificate',
        'income_certificate', 'caste_certificate', 'medical_certificate', 'other'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Document status enum
DO $$ BEGIN
    CREATE TYPE document_verification_status AS ENUM ('pending', 'approved', 'rejected', 'reupload_requested');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Application status enum
DO $$ BEGIN
    CREATE TYPE admission_application_status AS ENUM (
        'draft', 'submitted', 'under_review', 'documents_pending', 'interview_pending',
        'approved', 'rejected', 'waitlisted', 'enrolled'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Interview type enum
DO $$ BEGIN
    CREATE TYPE interview_type AS ENUM ('in_person', 'video', 'phone');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Interview status enum
DO $$ BEGIN
    CREATE TYPE interview_status AS ENUM ('scheduled', 'completed', 'cancelled', 'no_show', 'rescheduled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Offer status enum
DO $$ BEGIN
    CREATE TYPE offer_status AS ENUM ('draft', 'sent', 'accepted', 'rejected', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Payment status enum
DO $$ BEGIN
    CREATE TYPE admission_payment_status AS ENUM ('pending', 'partial', 'completed', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Template type enum
DO $$ BEGIN
    CREATE TYPE communication_template_type AS ENUM ('sms', 'email', 'whatsapp');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Workflow trigger type enum
DO $$ BEGIN
    CREATE TYPE workflow_trigger_type AS ENUM (
        'stage_change', 'document_upload', 'application_submit',
        'payment_received', 'time_based', 'manual'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Workflow action type enum
DO $$ BEGIN
    CREATE TYPE workflow_action_type AS ENUM (
        'send_sms', 'send_email', 'send_whatsapp', 'assign_counselor',
        'update_stage', 'create_task', 'webhook'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Counselors table
CREATE TABLE IF NOT EXISTS admission_counselors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    is_active BOOLEAN DEFAULT true,
    max_leads INTEGER DEFAULT 50,
    current_leads INTEGER DEFAULT 0,
    specializations TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Leads table (main table)
CREATE TABLE IF NOT EXISTS admission_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

    -- Personal details
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT NOT NULL,
    alternate_phone TEXT,
    date_of_birth DATE,
    gender TEXT CHECK (gender IN ('male', 'female', 'other')),

    -- Address
    address TEXT,
    city TEXT,
    state TEXT,
    pincode TEXT,
    country TEXT DEFAULT 'India',

    -- Academic details
    program_interest TEXT,
    preferred_batch TEXT,
    previous_qualification TEXT,
    percentage DECIMAL(5,2),
    board TEXT,
    passing_year INTEGER,

    -- Source & Attribution
    source lead_source NOT NULL DEFAULT 'website',
    source_detail TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT,
    referrer_id UUID REFERENCES admission_leads(id) ON DELETE SET NULL,
    publisher_id UUID,

    -- Status & Scoring
    funnel_stage funnel_stage NOT NULL DEFAULT 'new',
    priority lead_priority DEFAULT 'warm',
    score INTEGER DEFAULT 0,
    engagement_score INTEGER DEFAULT 0,
    quality_score INTEGER DEFAULT 0,

    -- Assignment
    counselor_id UUID REFERENCES admission_counselors(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ,
    last_contacted_at TIMESTAMPTZ,
    next_followup_at TIMESTAMPTZ,

    -- Metadata
    notes TEXT,
    tags TEXT[] DEFAULT '{}',
    is_duplicate BOOLEAN DEFAULT false,
    duplicate_of UUID REFERENCES admission_leads(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Lead stage history (audit trail)
CREATE TABLE IF NOT EXISTS admission_lead_stage_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES admission_leads(id) ON DELETE CASCADE,
    from_stage funnel_stage,
    to_stage funnel_stage NOT NULL,
    changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Lead activities (interactions)
CREATE TABLE IF NOT EXISTS admission_lead_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES admission_leads(id) ON DELETE CASCADE,
    activity_type TEXT NOT NULL, -- call, email, meeting, note, sms, whatsapp
    subject TEXT,
    description TEXT,
    outcome TEXT,
    scheduled_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Applications table
CREATE TABLE IF NOT EXISTS admission_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES admission_leads(id) ON DELETE SET NULL,
    application_number TEXT UNIQUE NOT NULL,
    status admission_application_status NOT NULL DEFAULT 'draft',
    program_id UUID REFERENCES programs(id) ON DELETE SET NULL,
    batch_id UUID,

    -- Personal details
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    date_of_birth DATE,
    gender TEXT CHECK (gender IN ('male', 'female', 'other')),

    -- Address
    address TEXT,
    city TEXT,
    state TEXT,
    pincode TEXT,

    -- Academic
    previous_qualification TEXT,
    percentage DECIMAL(5,2),
    board TEXT,
    passing_year INTEGER,

    -- Parent/Guardian
    father_name TEXT,
    mother_name TEXT,
    guardian_phone TEXT,
    guardian_email TEXT,

    -- Fees
    total_fees DECIMAL(12,2),
    paid_amount DECIMAL(12,2) DEFAULT 0,
    discount_amount DECIMAL(12,2) DEFAULT 0,
    scholarship_amount DECIMAL(12,2) DEFAULT 0,

    -- Metadata
    submitted_at TIMESTAMPTZ,
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Application documents
CREATE TABLE IF NOT EXISTS admission_application_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES admission_applications(id) ON DELETE CASCADE,
    document_type admission_document_type NOT NULL,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    status document_verification_status DEFAULT 'pending',
    verified_at TIMESTAMPTZ,
    verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Interviews table
CREATE TABLE IF NOT EXISTS admission_interviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES admission_applications(id) ON DELETE CASCADE,
    interview_type interview_type NOT NULL DEFAULT 'in_person',
    scheduled_at TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER DEFAULT 30,
    location TEXT,
    meeting_link TEXT,
    interviewer_ids UUID[] DEFAULT '{}',
    status interview_status DEFAULT 'scheduled',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Interview results
CREATE TABLE IF NOT EXISTS admission_interview_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id UUID NOT NULL REFERENCES admission_interviews(id) ON DELETE CASCADE,
    overall_rating INTEGER CHECK (overall_rating >= 1 AND overall_rating <= 10),
    communication_score INTEGER CHECK (communication_score >= 1 AND communication_score <= 10),
    technical_score INTEGER CHECK (technical_score >= 1 AND technical_score <= 10),
    attitude_score INTEGER CHECK (attitude_score >= 1 AND attitude_score <= 10),
    recommendation TEXT CHECK (recommendation IN ('strongly_recommend', 'recommend', 'neutral', 'not_recommend')),
    feedback TEXT,
    recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    recorded_at TIMESTAMPTZ DEFAULT now()
);

-- GD-PI Sessions
CREATE TABLE IF NOT EXISTS admission_gdpi_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    session_name TEXT NOT NULL,
    session_date DATE NOT NULL,
    venue TEXT,
    gd_topic TEXT,
    max_participants INTEGER DEFAULT 20,
    panelist_ids UUID[] DEFAULT '{}',
    status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- GD-PI Participants
CREATE TABLE IF NOT EXISTS admission_gdpi_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES admission_gdpi_sessions(id) ON DELETE CASCADE,
    application_id UUID NOT NULL REFERENCES admission_applications(id) ON DELETE CASCADE,
    gd_score INTEGER CHECK (gd_score >= 0 AND gd_score <= 100),
    gd_remarks TEXT,
    pi_score INTEGER CHECK (pi_score >= 0 AND pi_score <= 100),
    pi_remarks TEXT,
    overall_score INTEGER CHECK (overall_score >= 0 AND overall_score <= 100),
    recommendation TEXT CHECK (recommendation IN ('select', 'waitlist', 'reject')),
    recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    recorded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(session_id, application_id)
);

-- Offer letters
CREATE TABLE IF NOT EXISTS admission_offer_letters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES admission_applications(id) ON DELETE CASCADE,
    offer_number TEXT UNIQUE NOT NULL,
    program_name TEXT NOT NULL,
    batch_name TEXT,
    total_fees DECIMAL(12,2) NOT NULL,
    scholarship_amount DECIMAL(12,2) DEFAULT 0,
    discount_amount DECIMAL(12,2) DEFAULT 0,
    net_fees DECIMAL(12,2) NOT NULL,
    token_amount DECIMAL(12,2) NOT NULL,
    token_deadline TIMESTAMPTZ NOT NULL,
    full_payment_deadline TIMESTAMPTZ NOT NULL,
    status offer_status DEFAULT 'draft',
    sent_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seat confirmations
CREATE TABLE IF NOT EXISTS admission_seat_confirmations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES admission_applications(id) ON DELETE CASCADE,
    offer_id UUID NOT NULL REFERENCES admission_offer_letters(id) ON DELETE CASCADE,
    confirmation_number TEXT UNIQUE NOT NULL,
    token_payment_status admission_payment_status DEFAULT 'pending',
    token_paid_at TIMESTAMPTZ,
    token_transaction_id TEXT,
    full_payment_status admission_payment_status DEFAULT 'pending',
    full_paid_at TIMESTAMPTZ,
    enrollment_status TEXT DEFAULT 'pending' CHECK (enrollment_status IN ('pending', 'confirmed', 'cancelled')),
    enrollment_number TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- CONFIGURATION TABLES
-- ============================================================================

-- Scoring rules
CREATE TABLE IF NOT EXISTS admission_scoring_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    criteria JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Assignment rules
CREATE TABLE IF NOT EXISTS admission_assignment_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    priority INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    criteria JSONB NOT NULL DEFAULT '[]',
    action JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Communication templates
CREATE TABLE IF NOT EXISTS admission_communication_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type communication_template_type NOT NULL,
    subject TEXT,
    content TEXT NOT NULL,
    variables JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Workflows
CREATE TABLE IF NOT EXISTS admission_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    trigger JSONB NOT NULL,
    conditions JSONB DEFAULT '[]',
    actions JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Workflow execution log
CREATE TABLE IF NOT EXISTS admission_workflow_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES admission_workflows(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES admission_leads(id) ON DELETE SET NULL,
    application_id UUID REFERENCES admission_applications(id) ON DELETE SET NULL,
    trigger_data JSONB,
    actions_executed JSONB DEFAULT '[]',
    status TEXT DEFAULT 'completed' CHECK (status IN ('running', 'completed', 'failed')),
    error_message TEXT,
    executed_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- FINANCIAL AID TABLES
-- ============================================================================

-- Scholarships
CREATE TABLE IF NOT EXISTS admission_scholarships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    type TEXT CHECK (type IN ('merit', 'need_based', 'sports', 'special')),
    amount DECIMAL(12,2),
    percentage DECIMAL(5,2),
    eligibility_criteria TEXT,
    max_recipients INTEGER,
    is_active BOOLEAN DEFAULT true,
    deadline TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Scholarship applications
CREATE TABLE IF NOT EXISTS admission_scholarship_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scholarship_id UUID NOT NULL REFERENCES admission_scholarships(id) ON DELETE CASCADE,
    application_id UUID NOT NULL REFERENCES admission_applications(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'applied' CHECK (status IN ('applied', 'under_review', 'approved', 'rejected', 'disbursed')),
    applied_at TIMESTAMPTZ DEFAULT now(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_amount DECIMAL(12,2),
    remarks TEXT,
    UNIQUE(scholarship_id, application_id)
);

-- Loan applications
CREATE TABLE IF NOT EXISTS admission_loan_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES admission_applications(id) ON DELETE CASCADE,
    bank_name TEXT,
    loan_amount DECIMAL(12,2) NOT NULL,
    interest_rate DECIMAL(5,2),
    tenure_months INTEGER,
    status TEXT DEFAULT 'inquiry' CHECK (status IN ('inquiry', 'applied', 'processing', 'approved', 'rejected', 'disbursed')),
    applied_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    disbursed_at TIMESTAMPTZ,
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- PUBLISHER/AGENT TRACKING
-- ============================================================================

-- Publishers (lead sources/agents)
CREATE TABLE IF NOT EXISTS admission_publishers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    contact_person TEXT,
    email TEXT,
    phone TEXT,
    commission_type TEXT CHECK (commission_type IN ('fixed', 'percentage')),
    commission_value DECIMAL(10,2),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Publisher leads tracking
CREATE TABLE IF NOT EXISTS admission_publisher_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    publisher_id UUID NOT NULL REFERENCES admission_publishers(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES admission_leads(id) ON DELETE CASCADE,
    commission_status TEXT DEFAULT 'pending' CHECK (commission_status IN ('pending', 'approved', 'paid')),
    commission_amount DECIMAL(10,2),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(publisher_id, lead_id)
);

-- ============================================================================
-- DEDUPLICATION
-- ============================================================================

-- Duplicate matches
CREATE TABLE IF NOT EXISTS admission_deduplication_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id_1 UUID NOT NULL REFERENCES admission_leads(id) ON DELETE CASCADE,
    lead_id_2 UUID NOT NULL REFERENCES admission_leads(id) ON DELETE CASCADE,
    confidence_score DECIMAL(5,2) NOT NULL,
    matching_fields TEXT[] DEFAULT '{}',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'merged', 'ignored')),
    created_at TIMESTAMPTZ DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    UNIQUE(lead_id_1, lead_id_2)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Lead indexes
CREATE INDEX IF NOT EXISTS idx_admission_leads_institution ON admission_leads(institution_id);
CREATE INDEX IF NOT EXISTS idx_admission_leads_funnel_stage ON admission_leads(funnel_stage);
CREATE INDEX IF NOT EXISTS idx_admission_leads_priority ON admission_leads(priority);
CREATE INDEX IF NOT EXISTS idx_admission_leads_counselor ON admission_leads(counselor_id);
CREATE INDEX IF NOT EXISTS idx_admission_leads_source ON admission_leads(source);
CREATE INDEX IF NOT EXISTS idx_admission_leads_phone ON admission_leads(phone);
CREATE INDEX IF NOT EXISTS idx_admission_leads_email ON admission_leads(email);
CREATE INDEX IF NOT EXISTS idx_admission_leads_created_at ON admission_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admission_leads_next_followup ON admission_leads(next_followup_at) WHERE next_followup_at IS NOT NULL;

-- Application indexes
CREATE INDEX IF NOT EXISTS idx_admission_applications_institution ON admission_applications(institution_id);
CREATE INDEX IF NOT EXISTS idx_admission_applications_lead ON admission_applications(lead_id);
CREATE INDEX IF NOT EXISTS idx_admission_applications_status ON admission_applications(status);
CREATE INDEX IF NOT EXISTS idx_admission_applications_program ON admission_applications(program_id);
CREATE INDEX IF NOT EXISTS idx_admission_applications_number ON admission_applications(application_number);

-- Interview indexes
CREATE INDEX IF NOT EXISTS idx_admission_interviews_application ON admission_interviews(application_id);
CREATE INDEX IF NOT EXISTS idx_admission_interviews_scheduled ON admission_interviews(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_admission_interviews_status ON admission_interviews(status);

-- Activity indexes
CREATE INDEX IF NOT EXISTS idx_admission_lead_activities_lead ON admission_lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_admission_lead_activities_type ON admission_lead_activities(activity_type);

-- Stage history index
CREATE INDEX IF NOT EXISTS idx_admission_lead_stage_history_lead ON admission_lead_stage_history(lead_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_admission_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'admission_leads', 'admission_applications', 'admission_application_documents',
        'admission_interviews', 'admission_offer_letters', 'admission_seat_confirmations',
        'admission_counselors', 'admission_scoring_rules', 'admission_assignment_rules',
        'admission_communication_templates', 'admission_workflows', 'admission_scholarships',
        'admission_loan_applications', 'admission_publishers', 'admission_gdpi_sessions'
    ])
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS trigger_update_%s_updated_at ON %s;
            CREATE TRIGGER trigger_update_%s_updated_at
            BEFORE UPDATE ON %s
            FOR EACH ROW
            EXECUTE FUNCTION update_admission_updated_at();
        ', t, t, t, t);
    END LOOP;
END $$;

-- Lead stage change trigger
CREATE OR REPLACE FUNCTION log_admission_lead_stage_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.funnel_stage IS DISTINCT FROM NEW.funnel_stage THEN
        INSERT INTO admission_lead_stage_history (lead_id, from_stage, to_stage, changed_by)
        VALUES (NEW.id, OLD.funnel_stage, NEW.funnel_stage, auth.uid());
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_log_lead_stage_change ON admission_leads;
CREATE TRIGGER trigger_log_lead_stage_change
AFTER UPDATE ON admission_leads
FOR EACH ROW
EXECUTE FUNCTION log_admission_lead_stage_change();

-- Update counselor lead count
CREATE OR REPLACE FUNCTION update_counselor_lead_count()
RETURNS TRIGGER AS $$
BEGIN
    -- Decrease old counselor count
    IF OLD.counselor_id IS NOT NULL AND (TG_OP = 'DELETE' OR OLD.counselor_id IS DISTINCT FROM NEW.counselor_id) THEN
        UPDATE admission_counselors
        SET current_leads = GREATEST(0, current_leads - 1)
        WHERE id = OLD.counselor_id;
    END IF;

    -- Increase new counselor count
    IF TG_OP != 'DELETE' AND NEW.counselor_id IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.counselor_id IS DISTINCT FROM NEW.counselor_id) THEN
        UPDATE admission_counselors
        SET current_leads = current_leads + 1
        WHERE id = NEW.counselor_id;

        -- Set assigned_at if not set
        IF NEW.assigned_at IS NULL THEN
            NEW.assigned_at = now();
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_counselor_lead_count ON admission_leads;
CREATE TRIGGER trigger_update_counselor_lead_count
BEFORE INSERT OR UPDATE OR DELETE ON admission_leads
FOR EACH ROW
EXECUTE FUNCTION update_counselor_lead_count();

-- Auto-generate application number
CREATE OR REPLACE FUNCTION generate_application_number()
RETURNS TRIGGER AS $$
DECLARE
    year_suffix TEXT;
    seq_num INTEGER;
BEGIN
    IF NEW.application_number IS NULL OR NEW.application_number = '' THEN
        year_suffix := to_char(now(), 'YY');

        SELECT COALESCE(MAX(
            CASE
                WHEN application_number ~ ('^APP' || year_suffix || '[0-9]+$')
                THEN CAST(substring(application_number from 6) AS INTEGER)
                ELSE 0
            END
        ), 0) + 1
        INTO seq_num
        FROM admission_applications
        WHERE institution_id = NEW.institution_id;

        NEW.application_number := 'APP' || year_suffix || LPAD(seq_num::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_generate_application_number ON admission_applications;
CREATE TRIGGER trigger_generate_application_number
BEFORE INSERT ON admission_applications
FOR EACH ROW
EXECUTE FUNCTION generate_application_number();

-- Auto-generate offer number
CREATE OR REPLACE FUNCTION generate_offer_number()
RETURNS TRIGGER AS $$
DECLARE
    year_suffix TEXT;
    seq_num INTEGER;
    inst_id UUID;
BEGIN
    IF NEW.offer_number IS NULL OR NEW.offer_number = '' THEN
        -- Get institution_id from application
        SELECT institution_id INTO inst_id
        FROM admission_applications
        WHERE id = NEW.application_id;

        year_suffix := to_char(now(), 'YY');

        SELECT COALESCE(MAX(
            CASE
                WHEN ol.offer_number ~ ('^OFR' || year_suffix || '[0-9]+$')
                THEN CAST(substring(ol.offer_number from 6) AS INTEGER)
                ELSE 0
            END
        ), 0) + 1
        INTO seq_num
        FROM admission_offer_letters ol
        JOIN admission_applications a ON a.id = ol.application_id
        WHERE a.institution_id = inst_id;

        NEW.offer_number := 'OFR' || year_suffix || LPAD(seq_num::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_generate_offer_number ON admission_offer_letters;
CREATE TRIGGER trigger_generate_offer_number
BEFORE INSERT ON admission_offer_letters
FOR EACH ROW
EXECUTE FUNCTION generate_offer_number();

-- Auto-generate confirmation number
CREATE OR REPLACE FUNCTION generate_confirmation_number()
RETURNS TRIGGER AS $$
DECLARE
    year_suffix TEXT;
    seq_num INTEGER;
    inst_id UUID;
BEGIN
    IF NEW.confirmation_number IS NULL OR NEW.confirmation_number = '' THEN
        -- Get institution_id from application
        SELECT institution_id INTO inst_id
        FROM admission_applications
        WHERE id = NEW.application_id;

        year_suffix := to_char(now(), 'YY');

        SELECT COALESCE(MAX(
            CASE
                WHEN sc.confirmation_number ~ ('^CNF' || year_suffix || '[0-9]+$')
                THEN CAST(substring(sc.confirmation_number from 6) AS INTEGER)
                ELSE 0
            END
        ), 0) + 1
        INTO seq_num
        FROM admission_seat_confirmations sc
        JOIN admission_applications a ON a.id = sc.application_id
        WHERE a.institution_id = inst_id;

        NEW.confirmation_number := 'CNF' || year_suffix || LPAD(seq_num::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_generate_confirmation_number ON admission_seat_confirmations;
CREATE TRIGGER trigger_generate_confirmation_number
BEFORE INSERT ON admission_seat_confirmations
FOR EACH ROW
EXECUTE FUNCTION generate_confirmation_number();

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE admission_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_lead_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_application_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_interview_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_gdpi_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_gdpi_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_offer_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_seat_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_counselors ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_scoring_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_assignment_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_communication_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_workflow_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_scholarships ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_scholarship_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_loan_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_publishers ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_publisher_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_deduplication_matches ENABLE ROW LEVEL SECURITY;

-- RLS policies for leads (institution-based access)
CREATE POLICY "Users can view leads in their institution"
    ON admission_leads FOR SELECT
    USING (
        institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Users can insert leads in their institution"
    ON admission_leads FOR INSERT
    WITH CHECK (
        institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Users can update leads in their institution"
    ON admission_leads FOR UPDATE
    USING (
        institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Users can delete leads in their institution"
    ON admission_leads FOR DELETE
    USING (
        institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

-- Similar policies for applications
CREATE POLICY "Users can view applications in their institution"
    ON admission_applications FOR SELECT
    USING (
        institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Users can manage applications in their institution"
    ON admission_applications FOR ALL
    USING (
        institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

-- Counselors RLS
CREATE POLICY "Users can view counselors in their institution"
    ON admission_counselors FOR SELECT
    USING (
        institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Users can manage counselors in their institution"
    ON admission_counselors FOR ALL
    USING (
        institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

-- Stage history - read through lead
CREATE POLICY "Users can view stage history for accessible leads"
    ON admission_lead_stage_history FOR SELECT
    USING (
        lead_id IN (
            SELECT id FROM admission_leads WHERE institution_id IN (
                SELECT institution_id FROM profiles WHERE id = auth.uid()
            )
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Users can insert stage history"
    ON admission_lead_stage_history FOR INSERT
    WITH CHECK (true);

-- Activities - read through lead
CREATE POLICY "Users can view activities for accessible leads"
    ON admission_lead_activities FOR SELECT
    USING (
        lead_id IN (
            SELECT id FROM admission_leads WHERE institution_id IN (
                SELECT institution_id FROM profiles WHERE id = auth.uid()
            )
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Users can manage activities for accessible leads"
    ON admission_lead_activities FOR ALL
    USING (
        lead_id IN (
            SELECT id FROM admission_leads WHERE institution_id IN (
                SELECT institution_id FROM profiles WHERE id = auth.uid()
            )
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

-- Documents - read through application
CREATE POLICY "Users can view documents for accessible applications"
    ON admission_application_documents FOR SELECT
    USING (
        application_id IN (
            SELECT id FROM admission_applications WHERE institution_id IN (
                SELECT institution_id FROM profiles WHERE id = auth.uid()
            )
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Users can manage documents for accessible applications"
    ON admission_application_documents FOR ALL
    USING (
        application_id IN (
            SELECT id FROM admission_applications WHERE institution_id IN (
                SELECT institution_id FROM profiles WHERE id = auth.uid()
            )
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

-- Interviews - read through application
CREATE POLICY "Users can view interviews for accessible applications"
    ON admission_interviews FOR SELECT
    USING (
        application_id IN (
            SELECT id FROM admission_applications WHERE institution_id IN (
                SELECT institution_id FROM profiles WHERE id = auth.uid()
            )
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Users can manage interviews for accessible applications"
    ON admission_interviews FOR ALL
    USING (
        application_id IN (
            SELECT id FROM admission_applications WHERE institution_id IN (
                SELECT institution_id FROM profiles WHERE id = auth.uid()
            )
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

-- Interview results
CREATE POLICY "Users can view interview results"
    ON admission_interview_results FOR SELECT
    USING (
        interview_id IN (
            SELECT i.id FROM admission_interviews i
            JOIN admission_applications a ON a.id = i.application_id
            WHERE a.institution_id IN (
                SELECT institution_id FROM profiles WHERE id = auth.uid()
            )
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Users can manage interview results"
    ON admission_interview_results FOR ALL
    USING (
        interview_id IN (
            SELECT i.id FROM admission_interviews i
            JOIN admission_applications a ON a.id = i.application_id
            WHERE a.institution_id IN (
                SELECT institution_id FROM profiles WHERE id = auth.uid()
            )
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

-- GD-PI sessions
CREATE POLICY "Users can view gdpi sessions in their institution"
    ON admission_gdpi_sessions FOR SELECT
    USING (
        institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Users can manage gdpi sessions in their institution"
    ON admission_gdpi_sessions FOR ALL
    USING (
        institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

-- GD-PI participants
CREATE POLICY "Users can view gdpi participants"
    ON admission_gdpi_participants FOR SELECT
    USING (
        session_id IN (
            SELECT id FROM admission_gdpi_sessions WHERE institution_id IN (
                SELECT institution_id FROM profiles WHERE id = auth.uid()
            )
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Users can manage gdpi participants"
    ON admission_gdpi_participants FOR ALL
    USING (
        session_id IN (
            SELECT id FROM admission_gdpi_sessions WHERE institution_id IN (
                SELECT institution_id FROM profiles WHERE id = auth.uid()
            )
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

-- Offer letters
CREATE POLICY "Users can view offer letters"
    ON admission_offer_letters FOR SELECT
    USING (
        application_id IN (
            SELECT id FROM admission_applications WHERE institution_id IN (
                SELECT institution_id FROM profiles WHERE id = auth.uid()
            )
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Users can manage offer letters"
    ON admission_offer_letters FOR ALL
    USING (
        application_id IN (
            SELECT id FROM admission_applications WHERE institution_id IN (
                SELECT institution_id FROM profiles WHERE id = auth.uid()
            )
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

-- Seat confirmations
CREATE POLICY "Users can view seat confirmations"
    ON admission_seat_confirmations FOR SELECT
    USING (
        application_id IN (
            SELECT id FROM admission_applications WHERE institution_id IN (
                SELECT institution_id FROM profiles WHERE id = auth.uid()
            )
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Users can manage seat confirmations"
    ON admission_seat_confirmations FOR ALL
    USING (
        application_id IN (
            SELECT id FROM admission_applications WHERE institution_id IN (
                SELECT institution_id FROM profiles WHERE id = auth.uid()
            )
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

-- Configuration tables (institution-based)
CREATE POLICY "Users can view scoring rules in their institution"
    ON admission_scoring_rules FOR SELECT
    USING (
        institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Users can manage scoring rules in their institution"
    ON admission_scoring_rules FOR ALL
    USING (
        institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Users can view assignment rules in their institution"
    ON admission_assignment_rules FOR SELECT
    USING (
        institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Users can manage assignment rules in their institution"
    ON admission_assignment_rules FOR ALL
    USING (
        institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Users can view templates in their institution"
    ON admission_communication_templates FOR SELECT
    USING (
        institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Users can manage templates in their institution"
    ON admission_communication_templates FOR ALL
    USING (
        institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Users can view workflows in their institution"
    ON admission_workflows FOR SELECT
    USING (
        institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Users can manage workflows in their institution"
    ON admission_workflows FOR ALL
    USING (
        institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

-- Workflow executions
CREATE POLICY "Users can view workflow executions"
    ON admission_workflow_executions FOR SELECT
    USING (
        workflow_id IN (
            SELECT id FROM admission_workflows WHERE institution_id IN (
                SELECT institution_id FROM profiles WHERE id = auth.uid()
            )
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "System can insert workflow executions"
    ON admission_workflow_executions FOR INSERT
    WITH CHECK (true);

-- Scholarships
CREATE POLICY "Users can view scholarships in their institution"
    ON admission_scholarships FOR SELECT
    USING (
        institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Users can manage scholarships in their institution"
    ON admission_scholarships FOR ALL
    USING (
        institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

-- Scholarship applications
CREATE POLICY "Users can view scholarship applications"
    ON admission_scholarship_applications FOR SELECT
    USING (
        scholarship_id IN (
            SELECT id FROM admission_scholarships WHERE institution_id IN (
                SELECT institution_id FROM profiles WHERE id = auth.uid()
            )
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Users can manage scholarship applications"
    ON admission_scholarship_applications FOR ALL
    USING (
        scholarship_id IN (
            SELECT id FROM admission_scholarships WHERE institution_id IN (
                SELECT institution_id FROM profiles WHERE id = auth.uid()
            )
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

-- Loan applications
CREATE POLICY "Users can view loan applications"
    ON admission_loan_applications FOR SELECT
    USING (
        application_id IN (
            SELECT id FROM admission_applications WHERE institution_id IN (
                SELECT institution_id FROM profiles WHERE id = auth.uid()
            )
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Users can manage loan applications"
    ON admission_loan_applications FOR ALL
    USING (
        application_id IN (
            SELECT id FROM admission_applications WHERE institution_id IN (
                SELECT institution_id FROM profiles WHERE id = auth.uid()
            )
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

-- Publishers
CREATE POLICY "Users can view publishers in their institution"
    ON admission_publishers FOR SELECT
    USING (
        institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Users can manage publishers in their institution"
    ON admission_publishers FOR ALL
    USING (
        institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

-- Publisher leads
CREATE POLICY "Users can view publisher leads"
    ON admission_publisher_leads FOR SELECT
    USING (
        publisher_id IN (
            SELECT id FROM admission_publishers WHERE institution_id IN (
                SELECT institution_id FROM profiles WHERE id = auth.uid()
            )
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Users can manage publisher leads"
    ON admission_publisher_leads FOR ALL
    USING (
        publisher_id IN (
            SELECT id FROM admission_publishers WHERE institution_id IN (
                SELECT institution_id FROM profiles WHERE id = auth.uid()
            )
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

-- Deduplication matches
CREATE POLICY "Users can view deduplication matches"
    ON admission_deduplication_matches FOR SELECT
    USING (
        lead_id_1 IN (
            SELECT id FROM admission_leads WHERE institution_id IN (
                SELECT institution_id FROM profiles WHERE id = auth.uid()
            )
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Users can manage deduplication matches"
    ON admission_deduplication_matches FOR ALL
    USING (
        lead_id_1 IN (
            SELECT id FROM admission_leads WHERE institution_id IN (
                SELECT institution_id FROM profiles WHERE id = auth.uid()
            )
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

-- ============================================================================
-- GRANTS
-- ============================================================================

-- Grant access to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE admission_leads IS 'Main table for admission lead management';
COMMENT ON TABLE admission_applications IS 'Student admission applications';
COMMENT ON TABLE admission_interviews IS 'Interview scheduling and tracking';
COMMENT ON TABLE admission_offer_letters IS 'Offer letters sent to applicants';
COMMENT ON TABLE admission_workflows IS 'Automated workflow configurations';
COMMENT ON COLUMN admission_leads.funnel_stage IS 'Current stage in the admission funnel';
COMMENT ON COLUMN admission_leads.score IS 'Lead score calculated from scoring rules';
