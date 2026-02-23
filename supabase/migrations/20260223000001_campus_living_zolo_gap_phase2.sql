-- =============================================================================
-- Campus Living: Zolo Gap Phase 2 Features
-- Preventive Maintenance | Onboarding | Wellness Pulse | Laundry
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: ENUM TYPES
-- ─────────────────────────────────────────────────────────────────────────────

-- Feature 1: Preventive Maintenance
DO $$ BEGIN
    CREATE TYPE pm_frequency_enum AS ENUM (
        'daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'half_yearly', 'yearly'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE pm_schedule_status_enum AS ENUM (
        'active', 'paused', 'completed', 'cancelled'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Feature 2: Onboarding
DO $$ BEGIN
    CREATE TYPE onboarding_status_enum AS ENUM (
        'not_started', 'in_progress', 'completed', 'skipped'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE onboarding_item_type_enum AS ENUM (
        'room_readiness', 'document_collection', 'welcome_kit', 'orientation',
        'emergency_contact', 'rules_acknowledgment', 'id_card', 'mess_registration',
        'wifi_setup', 'custom'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Feature 3: Wellness Pulse
DO $$ BEGIN
    CREATE TYPE pulse_frequency_enum AS ENUM (
        'weekly', 'biweekly', 'monthly'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE pulse_status_enum AS ENUM (
        'draft', 'active', 'paused', 'completed', 'archived'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE pulse_question_type_enum AS ENUM (
        'emoji_scale', 'rating_5', 'yes_no', 'text'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Feature 4: Laundry
DO $$ BEGIN
    CREATE TYPE laundry_service_type_enum AS ENUM (
        'in_house', 'vendor'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE laundry_order_status_enum AS ENUM (
        'submitted', 'collected', 'washing', 'ready', 'delivered', 'disputed'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE laundry_item_type_enum AS ENUM (
        'shirt', 'pant', 'tshirt', 'shorts', 'bedsheet', 'towel', 'uniform',
        'traditional', 'innerwear', 'other'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: TABLES
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Feature 1: Preventive Maintenance ────────────────────────────────────────

-- Recurring schedule definitions
CREATE TABLE IF NOT EXISTS hostel_pm_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    block_id UUID REFERENCES hostel_blocks(id),
    title TEXT NOT NULL,
    description TEXT,
    category maintenance_category_enum NOT NULL,
    priority maintenance_priority_enum NOT NULL DEFAULT 'medium',
    frequency pm_frequency_enum NOT NULL,
    day_of_week INT,
    day_of_month INT,
    month_of_year INT,
    time_of_day TIME DEFAULT '09:00',
    assigned_to_name TEXT,
    assigned_to_phone TEXT,
    vendor_name TEXT,
    estimated_cost NUMERIC(15,2),
    checklist JSONB,
    next_due_date DATE NOT NULL,
    last_completed_date DATE,
    total_completions INT DEFAULT 0,
    status pm_schedule_status_enum NOT NULL DEFAULT 'active',
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Individual task instances generated from schedules
CREATE TABLE IF NOT EXISTS hostel_pm_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    schedule_id UUID NOT NULL REFERENCES hostel_pm_schedules(id),
    block_id UUID REFERENCES hostel_blocks(id),
    due_date DATE NOT NULL,
    title TEXT NOT NULL,
    category maintenance_category_enum NOT NULL,
    priority maintenance_priority_enum NOT NULL,
    assigned_to_name TEXT,
    assigned_to_phone TEXT,
    checklist JSONB,
    status maintenance_status_enum NOT NULL DEFAULT 'open',
    completed_by UUID REFERENCES profiles(id),
    completed_at TIMESTAMPTZ,
    completion_notes TEXT,
    photo_urls TEXT[],
    cost_actual NUMERIC(15,2),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(schedule_id, due_date)
);

-- ── Feature 2: Onboarding ───────────────────────────────────────────────────

-- Institution-level onboarding checklist templates
CREATE TABLE IF NOT EXISTS hostel_onboarding_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    name TEXT NOT NULL DEFAULT 'Default Onboarding',
    items JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(institution_id, name)
);

-- Per-student onboarding progress tracker
CREATE TABLE IF NOT EXISTS hostel_onboarding_checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    allocation_id UUID NOT NULL REFERENCES hostel_allocations(id),
    learner_id UUID NOT NULL REFERENCES profiles(id),
    template_id UUID REFERENCES hostel_onboarding_templates(id),
    status onboarding_status_enum NOT NULL DEFAULT 'not_started',
    items JSONB NOT NULL DEFAULT '[]',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    completed_by UUID REFERENCES profiles(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(allocation_id)
);

-- ── Feature 3: Wellness Pulse ────────────────────────────────────────────────

-- Pulse survey configuration
CREATE TABLE IF NOT EXISTS hostel_pulse_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    title TEXT NOT NULL,
    description TEXT,
    frequency pulse_frequency_enum NOT NULL DEFAULT 'weekly',
    questions JSONB NOT NULL DEFAULT '[]',
    target_blocks UUID[],
    status pulse_status_enum NOT NULL DEFAULT 'draft',
    starts_at DATE,
    ends_at DATE,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Individual student responses per pulse period
CREATE TABLE IF NOT EXISTS hostel_pulse_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    config_id UUID NOT NULL REFERENCES hostel_pulse_configs(id),
    learner_id UUID NOT NULL REFERENCES profiles(id),
    period_start DATE NOT NULL,
    answers JSONB NOT NULL DEFAULT '{}',
    overall_mood INT,
    submitted_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(config_id, learner_id, period_start)
);

-- ── Feature 4: Laundry ──────────────────────────────────────────────────────

-- Laundry service configuration per block
CREATE TABLE IF NOT EXISTS hostel_laundry_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    block_id UUID REFERENCES hostel_blocks(id),
    service_type laundry_service_type_enum NOT NULL DEFAULT 'vendor',
    vendor_name TEXT,
    vendor_phone TEXT,
    vendor_contract_start DATE,
    vendor_contract_end DATE,
    collection_days INT[] DEFAULT '{1,4}',
    delivery_days INT[] DEFAULT '{3,6}',
    max_items_per_student INT DEFAULT 15,
    cost_per_item NUMERIC(10,2),
    is_included_in_fees BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Laundry orders per student per collection
CREATE TABLE IF NOT EXISTS hostel_laundry_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    learner_id UUID NOT NULL REFERENCES profiles(id),
    block_id UUID NOT NULL REFERENCES hostel_blocks(id),
    config_id UUID REFERENCES hostel_laundry_configs(id),
    order_number TEXT NOT NULL UNIQUE,
    items JSONB NOT NULL DEFAULT '[]',
    total_items INT NOT NULL,
    total_returned INT DEFAULT 0,
    total_damaged INT DEFAULT 0,
    total_missing INT DEFAULT 0,
    status laundry_order_status_enum NOT NULL DEFAULT 'submitted',
    collected_at TIMESTAMPTZ,
    ready_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    student_confirmed BOOLEAN DEFAULT false,
    dispute_reason TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
    tbl TEXT;
    policy_name TEXT;
BEGIN
    FOR tbl IN
        SELECT unnest(ARRAY[
            'hostel_pm_schedules',
            'hostel_pm_tasks',
            'hostel_onboarding_templates',
            'hostel_onboarding_checklists',
            'hostel_pulse_configs',
            'hostel_pulse_responses',
            'hostel_laundry_configs',
            'hostel_laundry_orders'
        ])
    LOOP
        -- Enable RLS
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);

        -- Drop existing policy if any
        policy_name := tbl || '_institution_isolation';
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', policy_name, tbl);

        -- Create institution isolation policy
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR ALL USING (institution_id IN (SELECT institution_id FROM profiles WHERE id = auth.uid()))',
            policy_name, tbl
        );
    END LOOP;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4: INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

-- Feature 1: Preventive Maintenance
CREATE INDEX IF NOT EXISTS idx_hostel_pm_schedules_institution ON hostel_pm_schedules(institution_id);
CREATE INDEX IF NOT EXISTS idx_hostel_pm_schedules_block ON hostel_pm_schedules(block_id);
CREATE INDEX IF NOT EXISTS idx_hostel_pm_schedules_status ON hostel_pm_schedules(status);
CREATE INDEX IF NOT EXISTS idx_hostel_pm_schedules_category ON hostel_pm_schedules(category);
CREATE INDEX IF NOT EXISTS idx_hostel_pm_schedules_next_due ON hostel_pm_schedules(next_due_date);

CREATE INDEX IF NOT EXISTS idx_hostel_pm_tasks_institution ON hostel_pm_tasks(institution_id);
CREATE INDEX IF NOT EXISTS idx_hostel_pm_tasks_schedule ON hostel_pm_tasks(schedule_id);
CREATE INDEX IF NOT EXISTS idx_hostel_pm_tasks_block ON hostel_pm_tasks(block_id);
CREATE INDEX IF NOT EXISTS idx_hostel_pm_tasks_status ON hostel_pm_tasks(status);
CREATE INDEX IF NOT EXISTS idx_hostel_pm_tasks_due_date ON hostel_pm_tasks(due_date);

-- Feature 2: Onboarding
CREATE INDEX IF NOT EXISTS idx_hostel_onboarding_templates_institution ON hostel_onboarding_templates(institution_id);

CREATE INDEX IF NOT EXISTS idx_hostel_onboarding_checklists_institution ON hostel_onboarding_checklists(institution_id);
CREATE INDEX IF NOT EXISTS idx_hostel_onboarding_checklists_allocation ON hostel_onboarding_checklists(allocation_id);
CREATE INDEX IF NOT EXISTS idx_hostel_onboarding_checklists_learner ON hostel_onboarding_checklists(learner_id);
CREATE INDEX IF NOT EXISTS idx_hostel_onboarding_checklists_status ON hostel_onboarding_checklists(status);

-- Feature 3: Wellness Pulse
CREATE INDEX IF NOT EXISTS idx_hostel_pulse_configs_institution ON hostel_pulse_configs(institution_id);
CREATE INDEX IF NOT EXISTS idx_hostel_pulse_configs_status ON hostel_pulse_configs(status);

CREATE INDEX IF NOT EXISTS idx_hostel_pulse_responses_institution ON hostel_pulse_responses(institution_id);
CREATE INDEX IF NOT EXISTS idx_hostel_pulse_responses_config ON hostel_pulse_responses(config_id);
CREATE INDEX IF NOT EXISTS idx_hostel_pulse_responses_learner ON hostel_pulse_responses(learner_id);
CREATE INDEX IF NOT EXISTS idx_hostel_pulse_responses_period ON hostel_pulse_responses(period_start);

-- Feature 4: Laundry
CREATE INDEX IF NOT EXISTS idx_hostel_laundry_configs_institution ON hostel_laundry_configs(institution_id);
CREATE INDEX IF NOT EXISTS idx_hostel_laundry_configs_block ON hostel_laundry_configs(block_id);

CREATE INDEX IF NOT EXISTS idx_hostel_laundry_orders_institution ON hostel_laundry_orders(institution_id);
CREATE INDEX IF NOT EXISTS idx_hostel_laundry_orders_learner ON hostel_laundry_orders(learner_id);
CREATE INDEX IF NOT EXISTS idx_hostel_laundry_orders_block ON hostel_laundry_orders(block_id);
CREATE INDEX IF NOT EXISTS idx_hostel_laundry_orders_config ON hostel_laundry_orders(config_id);
CREATE INDEX IF NOT EXISTS idx_hostel_laundry_orders_status ON hostel_laundry_orders(status);


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5: TRIGGERS (auto-update updated_at)
-- ─────────────────────────────────────────────────────────────────────────────

-- Feature 1
DROP TRIGGER IF EXISTS trg_hostel_pm_schedules_updated_at ON hostel_pm_schedules;
CREATE TRIGGER trg_hostel_pm_schedules_updated_at
    BEFORE UPDATE ON hostel_pm_schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_hostel_pm_tasks_updated_at ON hostel_pm_tasks;
CREATE TRIGGER trg_hostel_pm_tasks_updated_at
    BEFORE UPDATE ON hostel_pm_tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Feature 2
DROP TRIGGER IF EXISTS trg_hostel_onboarding_templates_updated_at ON hostel_onboarding_templates;
CREATE TRIGGER trg_hostel_onboarding_templates_updated_at
    BEFORE UPDATE ON hostel_onboarding_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_hostel_onboarding_checklists_updated_at ON hostel_onboarding_checklists;
CREATE TRIGGER trg_hostel_onboarding_checklists_updated_at
    BEFORE UPDATE ON hostel_onboarding_checklists
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Feature 3
DROP TRIGGER IF EXISTS trg_hostel_pulse_configs_updated_at ON hostel_pulse_configs;
CREATE TRIGGER trg_hostel_pulse_configs_updated_at
    BEFORE UPDATE ON hostel_pulse_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- hostel_pulse_responses has no updated_at (immutable once submitted)

-- Feature 4
DROP TRIGGER IF EXISTS trg_hostel_laundry_configs_updated_at ON hostel_laundry_configs;
CREATE TRIGGER trg_hostel_laundry_configs_updated_at
    BEFORE UPDATE ON hostel_laundry_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_hostel_laundry_orders_updated_at ON hostel_laundry_orders;
CREATE TRIGGER trg_hostel_laundry_orders_updated_at
    BEFORE UPDATE ON hostel_laundry_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
