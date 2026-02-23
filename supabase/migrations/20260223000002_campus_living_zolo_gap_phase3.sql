-- =============================================================================
-- Campus Living: Zolo Gap Phase 3 Features
-- AMC & Contract Tracking | Cleaning & Housekeeping | Student Health Workflow
-- (Management Dashboard has no new tables — aggregates existing data)
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: ENUM TYPES
-- ─────────────────────────────────────────────────────────────────────────────

-- Feature 6: AMC & Contract Tracking
DO $$ BEGIN
    CREATE TYPE amc_status_enum AS ENUM (
        'active', 'expiring_soon', 'expired', 'renewed', 'cancelled'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Feature 7: Cleaning & Housekeeping
DO $$ BEGIN
    CREATE TYPE cleaning_type_enum AS ENUM (
        'daily_sweep', 'daily_mop', 'toilet_cleaning', 'common_area',
        'deep_cleaning', 'window_cleaning', 'water_tank', 'disinfection', 'other'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE cleaning_task_status_enum AS ENUM (
        'scheduled', 'in_progress', 'completed', 'missed', 'rescheduled'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Feature 8: Student Health & Wellness Workflow
DO $$ BEGIN
    CREATE TYPE health_severity_enum AS ENUM (
        'minor', 'moderate', 'serious', 'emergency'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE health_case_status_enum AS ENUM (
        'reported', 'first_aid', 'doctor_referred', 'hospitalized',
        'recovering', 'cleared', 'closed'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: TABLES
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Feature 6: AMC & Contract Tracking ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS hostel_amc_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    block_id UUID REFERENCES hostel_blocks(id),
    title TEXT NOT NULL,
    vendor_name TEXT NOT NULL,
    vendor_phone TEXT,
    vendor_email TEXT,
    category maintenance_category_enum NOT NULL,
    contract_number TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    renewal_reminder_days INT DEFAULT 30,
    annual_cost NUMERIC(15,2),
    coverage_details TEXT,
    document_urls TEXT[],
    status amc_status_enum NOT NULL DEFAULT 'active',
    last_service_date DATE,
    next_service_date DATE,
    service_frequency pm_frequency_enum,
    notes TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Feature 7: Cleaning & Housekeeping ─────────────────────────────────────

-- Cleaning schedule templates (recurring rules)
CREATE TABLE IF NOT EXISTS hostel_cleaning_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    block_id UUID REFERENCES hostel_blocks(id),
    floor_number INT,
    cleaning_type cleaning_type_enum NOT NULL,
    frequency pm_frequency_enum NOT NULL,
    scheduled_time TIME DEFAULT '06:00',
    assigned_staff TEXT,
    assigned_staff_phone TEXT,
    checklist JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Daily cleaning task instances (generated from schedules)
CREATE TABLE IF NOT EXISTS hostel_cleaning_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    schedule_id UUID NOT NULL REFERENCES hostel_cleaning_schedules(id),
    block_id UUID REFERENCES hostel_blocks(id),
    floor_number INT,
    date DATE NOT NULL,
    cleaning_type cleaning_type_enum NOT NULL,
    assigned_staff TEXT,
    status cleaning_task_status_enum NOT NULL DEFAULT 'scheduled',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    completed_by TEXT,
    quality_rating INT,
    inspector_notes TEXT,
    photo_urls TEXT[],
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(schedule_id, date)
);

-- ── Feature 8: Student Health & Wellness Workflow ──────────────────────────

CREATE TABLE IF NOT EXISTS hostel_health_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    learner_id UUID NOT NULL REFERENCES profiles(id),
    block_id UUID REFERENCES hostel_blocks(id),
    case_number TEXT NOT NULL UNIQUE,
    symptoms TEXT NOT NULL,
    severity health_severity_enum NOT NULL DEFAULT 'minor',
    temperature NUMERIC(4,1),
    status health_case_status_enum NOT NULL DEFAULT 'reported',
    first_aid_given TEXT,
    first_aid_by TEXT,
    first_aid_at TIMESTAMPTZ,
    doctor_name TEXT,
    doctor_referral_at TIMESTAMPTZ,
    hospital_name TEXT,
    diagnosis TEXT,
    medication TEXT,
    parent_notified BOOLEAN DEFAULT false,
    parent_notified_at TIMESTAMPTZ,
    parent_notified_by UUID REFERENCES profiles(id),
    recovery_notes TEXT,
    cleared_by UUID REFERENCES profiles(id),
    cleared_at TIMESTAMPTZ,
    follow_up_dates DATE[],
    created_by UUID REFERENCES profiles(id),
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
            'hostel_amc_contracts',
            'hostel_cleaning_schedules',
            'hostel_cleaning_tasks',
            'hostel_health_cases'
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

-- Feature 6: AMC Contracts
CREATE INDEX IF NOT EXISTS idx_hostel_amc_contracts_institution ON hostel_amc_contracts(institution_id);
CREATE INDEX IF NOT EXISTS idx_hostel_amc_contracts_block ON hostel_amc_contracts(block_id);
CREATE INDEX IF NOT EXISTS idx_hostel_amc_contracts_status ON hostel_amc_contracts(status);
CREATE INDEX IF NOT EXISTS idx_hostel_amc_contracts_category ON hostel_amc_contracts(category);
CREATE INDEX IF NOT EXISTS idx_hostel_amc_contracts_end_date ON hostel_amc_contracts(end_date);

-- Feature 7: Cleaning
CREATE INDEX IF NOT EXISTS idx_hostel_cleaning_schedules_institution ON hostel_cleaning_schedules(institution_id);
CREATE INDEX IF NOT EXISTS idx_hostel_cleaning_schedules_block ON hostel_cleaning_schedules(block_id);
CREATE INDEX IF NOT EXISTS idx_hostel_cleaning_schedules_type ON hostel_cleaning_schedules(cleaning_type);

CREATE INDEX IF NOT EXISTS idx_hostel_cleaning_tasks_institution ON hostel_cleaning_tasks(institution_id);
CREATE INDEX IF NOT EXISTS idx_hostel_cleaning_tasks_schedule ON hostel_cleaning_tasks(schedule_id);
CREATE INDEX IF NOT EXISTS idx_hostel_cleaning_tasks_block ON hostel_cleaning_tasks(block_id);
CREATE INDEX IF NOT EXISTS idx_hostel_cleaning_tasks_date ON hostel_cleaning_tasks(date);
CREATE INDEX IF NOT EXISTS idx_hostel_cleaning_tasks_status ON hostel_cleaning_tasks(status);

-- Feature 8: Health Cases
CREATE INDEX IF NOT EXISTS idx_hostel_health_cases_institution ON hostel_health_cases(institution_id);
CREATE INDEX IF NOT EXISTS idx_hostel_health_cases_learner ON hostel_health_cases(learner_id);
CREATE INDEX IF NOT EXISTS idx_hostel_health_cases_block ON hostel_health_cases(block_id);
CREATE INDEX IF NOT EXISTS idx_hostel_health_cases_status ON hostel_health_cases(status);
CREATE INDEX IF NOT EXISTS idx_hostel_health_cases_severity ON hostel_health_cases(severity);


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5: TRIGGERS (auto-update updated_at)
-- ─────────────────────────────────────────────────────────────────────────────

-- Feature 6
DROP TRIGGER IF EXISTS trg_hostel_amc_contracts_updated_at ON hostel_amc_contracts;
CREATE TRIGGER trg_hostel_amc_contracts_updated_at
    BEFORE UPDATE ON hostel_amc_contracts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Feature 7
DROP TRIGGER IF EXISTS trg_hostel_cleaning_schedules_updated_at ON hostel_cleaning_schedules;
CREATE TRIGGER trg_hostel_cleaning_schedules_updated_at
    BEFORE UPDATE ON hostel_cleaning_schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_hostel_cleaning_tasks_updated_at ON hostel_cleaning_tasks;
CREATE TRIGGER trg_hostel_cleaning_tasks_updated_at
    BEFORE UPDATE ON hostel_cleaning_tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Feature 8
DROP TRIGGER IF EXISTS trg_hostel_health_cases_updated_at ON hostel_health_cases;
CREATE TRIGGER trg_hostel_health_cases_updated_at
    BEFORE UPDATE ON hostel_health_cases
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
