-- Migration: Extend hostel_gate_passes schema
-- Purpose: Add missing columns and enum values required by gate-pass-service.ts
-- The service code references columns and enum values not present in the original
-- 20260222000015_campus_living_enums_and_tables.sql migration.

-- ============================================================
-- 1. Add missing enum values to gate_pass_status_enum
-- ============================================================
-- Service uses: 'requested', 'rejected' (in addition to existing 'issued','active','returned','overdue','cancelled')
ALTER TYPE gate_pass_status_enum ADD VALUE IF NOT EXISTS 'requested' BEFORE 'issued';
ALTER TYPE gate_pass_status_enum ADD VALUE IF NOT EXISTS 'rejected' AFTER 'cancelled';

-- ============================================================
-- 2. Add missing enum value to gate_pass_type_enum
-- ============================================================
-- Service uses: 'home_visit' (in addition to existing 'regular_out','overnight','emergency','visitor_accompanied')
ALTER TYPE gate_pass_type_enum ADD VALUE IF NOT EXISTS 'home_visit';

-- ============================================================
-- 3. Add missing columns to hostel_gate_passes
-- ============================================================

-- Request/approval workflow columns
ALTER TABLE hostel_gate_passes
    ALTER COLUMN approved_by DROP NOT NULL,
    ALTER COLUMN pass_number DROP NOT NULL,
    ALTER COLUMN qr_code DROP NOT NULL;

ALTER TABLE hostel_gate_passes
    ADD COLUMN IF NOT EXISTS reason TEXT,
    ADD COLUMN IF NOT EXISTS block_id UUID REFERENCES hostel_blocks(id),
    ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES profiles(id),
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
    ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES profiles(id),
    ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- Home visit checkpoint tracking columns
ALTER TABLE hostel_gate_passes
    ADD COLUMN IF NOT EXISTS left_campus_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reached_home_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reached_home_confirmed_by UUID REFERENCES profiles(id),
    ADD COLUMN IF NOT EXISTS left_home_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS left_home_confirmed_by UUID REFERENCES profiles(id),
    ADD COLUMN IF NOT EXISTS reached_campus_at TIMESTAMPTZ;

-- Change default status from 'issued' to 'requested' for new request workflow
-- (existing records keep 'issued' default; new requests use 'requested')
-- Note: We keep the default as 'issued' since generateGatePass sets status explicitly
-- and requestGatePass also sets status='requested' explicitly.

-- ============================================================
-- 4. Add indexes for new columns
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_gate_passes_block_id
    ON hostel_gate_passes(block_id)
    WHERE block_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gate_passes_status_requested
    ON hostel_gate_passes(institution_id, status)
    WHERE status = 'requested';

COMMENT ON TABLE hostel_gate_passes IS 'Gate passes for hostel learners. Supports both direct-issue and request/approve workflows, plus home visit checkpoint tracking.';
