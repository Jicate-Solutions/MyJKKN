-- =============================================================================
-- Campus Living Module - Part 2: RLS Policies, Indexes, and Triggers
-- Applied to: STAGING (hhprjbgknupaplivtoib) ONLY
-- Created: 2026-02-22
-- Description: Row Level Security, performance indexes, and updated_at triggers
--              for all 34 Campus Living tables
-- NOTE: Idempotent — safe to re-run
-- =============================================================================

-- ============================================================
-- ENSURE updated_at trigger function exists
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- ENABLE RLS ON ALL 34 TABLES
-- (ALTER TABLE ... ENABLE ROW LEVEL SECURITY is idempotent)
-- ============================================================
ALTER TABLE hostel_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE hostel_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE hostel_beds ENABLE ROW LEVEL SECURITY;
ALTER TABLE hostel_wardens ENABLE ROW LEVEL SECURITY;
ALTER TABLE hostel_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE hostel_roommate_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE hostel_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE hostel_leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE hostel_gate_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mess_caterers ENABLE ROW LEVEL SECURITY;
ALTER TABLE mess_menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE mess_meal_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE mess_billing_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE mess_student_billing ENABLE ROW LEVEL SECURITY;
ALTER TABLE mess_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE mess_waste_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE mess_meal_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE hostel_visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE hostel_maintenance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE hostel_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE anti_ragging_affidavits ENABLE ROW LEVEL SECURITY;
ALTER TABLE hostel_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE hostel_fee_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE hostel_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE mess_caterer_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE hostel_incident_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE hostel_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE hostel_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE hostel_known_visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE hostel_curfew_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE hostel_alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE hostel_risk_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE hostel_leave_type_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE hostel_maintenance_sla_config ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES: Institution Isolation (FOR ALL) on all tables
-- Drop existing policies first to make idempotent, then create
-- ============================================================
DO $$
DECLARE
    tbl TEXT;
    policy_name TEXT;
BEGIN
    FOR tbl IN
        SELECT unnest(ARRAY[
            'hostel_blocks', 'hostel_rooms', 'hostel_beds', 'hostel_wardens',
            'hostel_allocations', 'hostel_roommate_preferences', 'hostel_attendance',
            'hostel_leave_requests', 'hostel_gate_passes', 'mess_caterers',
            'mess_menus', 'mess_meal_records', 'mess_billing_periods',
            'mess_student_billing', 'mess_feedback', 'mess_waste_log',
            'mess_meal_bookings', 'hostel_visitors', 'hostel_maintenance_requests',
            'hostel_incidents', 'anti_ragging_affidavits', 'hostel_inspections',
            'hostel_fee_config', 'hostel_deposits', 'mess_caterer_blocks',
            'hostel_incident_parties', 'hostel_waitlist', 'hostel_access_log',
            'hostel_known_visitors', 'hostel_curfew_exceptions', 'hostel_alert_rules',
            'hostel_risk_alerts', 'hostel_leave_type_config', 'hostel_maintenance_sla_config'
        ])
    LOOP
        policy_name := tbl || '_institution_isolation';
        -- Drop existing policy if any
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', policy_name, tbl);
        -- Create institution isolation policy
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR ALL USING (institution_id IN (SELECT institution_id FROM profiles WHERE id = auth.uid()))',
            policy_name, tbl
        );
    END LOOP;
END $$;

-- ============================================================
-- INDEXES: institution_id + frequently queried columns
-- Using IF NOT EXISTS for idempotency
-- ============================================================

-- hostel_blocks
CREATE INDEX IF NOT EXISTS idx_hostel_blocks_institution ON hostel_blocks(institution_id);

-- hostel_rooms
CREATE INDEX IF NOT EXISTS idx_hostel_rooms_institution ON hostel_rooms(institution_id);
CREATE INDEX IF NOT EXISTS idx_hostel_rooms_block ON hostel_rooms(block_id);

-- hostel_beds
CREATE INDEX IF NOT EXISTS idx_hostel_beds_institution ON hostel_beds(institution_id);
CREATE INDEX IF NOT EXISTS idx_hostel_beds_room ON hostel_beds(room_id);

-- hostel_wardens
CREATE INDEX IF NOT EXISTS idx_hostel_wardens_institution ON hostel_wardens(institution_id);
CREATE INDEX IF NOT EXISTS idx_hostel_wardens_block ON hostel_wardens(block_id);

-- hostel_allocations
CREATE INDEX IF NOT EXISTS idx_hostel_allocations_institution ON hostel_allocations(institution_id);
CREATE INDEX IF NOT EXISTS idx_hostel_allocations_learner ON hostel_allocations(learner_id);
CREATE INDEX IF NOT EXISTS idx_hostel_allocations_block ON hostel_allocations(block_id);
CREATE INDEX IF NOT EXISTS idx_hostel_allocations_room ON hostel_allocations(room_id);
CREATE INDEX IF NOT EXISTS idx_hostel_allocations_status ON hostel_allocations(status);

-- hostel_roommate_preferences
CREATE INDEX IF NOT EXISTS idx_hostel_roommate_prefs_institution ON hostel_roommate_preferences(institution_id);
CREATE INDEX IF NOT EXISTS idx_hostel_roommate_prefs_learner ON hostel_roommate_preferences(learner_id);

-- hostel_attendance
CREATE INDEX IF NOT EXISTS idx_hostel_attendance_institution ON hostel_attendance(institution_id);
CREATE INDEX IF NOT EXISTS idx_hostel_attendance_learner ON hostel_attendance(learner_id);
CREATE INDEX IF NOT EXISTS idx_hostel_attendance_block ON hostel_attendance(block_id);
CREATE INDEX IF NOT EXISTS idx_hostel_attendance_date ON hostel_attendance(date);
CREATE INDEX IF NOT EXISTS idx_hostel_attendance_learner_date ON hostel_attendance(learner_id, date);

-- hostel_leave_requests
CREATE INDEX IF NOT EXISTS idx_hostel_leave_requests_institution ON hostel_leave_requests(institution_id);
CREATE INDEX IF NOT EXISTS idx_hostel_leave_requests_learner ON hostel_leave_requests(learner_id);
CREATE INDEX IF NOT EXISTS idx_hostel_leave_requests_status ON hostel_leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_hostel_leave_requests_block ON hostel_leave_requests(block_id);

-- hostel_gate_passes
CREATE INDEX IF NOT EXISTS idx_hostel_gate_passes_institution ON hostel_gate_passes(institution_id);
CREATE INDEX IF NOT EXISTS idx_hostel_gate_passes_learner ON hostel_gate_passes(learner_id);
CREATE INDEX IF NOT EXISTS idx_hostel_gate_passes_status ON hostel_gate_passes(status);

-- mess_caterers
CREATE INDEX IF NOT EXISTS idx_mess_caterers_institution ON mess_caterers(institution_id);
CREATE INDEX IF NOT EXISTS idx_mess_caterers_status ON mess_caterers(status);

-- mess_menus
CREATE INDEX IF NOT EXISTS idx_mess_menus_institution ON mess_menus(institution_id);
CREATE INDEX IF NOT EXISTS idx_mess_menus_caterer ON mess_menus(caterer_id);
CREATE INDEX IF NOT EXISTS idx_mess_menus_date_meal ON mess_menus(week_start_date, day_of_week, meal_type);

-- mess_meal_records
CREATE INDEX IF NOT EXISTS idx_mess_meal_records_institution ON mess_meal_records(institution_id);
CREATE INDEX IF NOT EXISTS idx_mess_meal_records_learner ON mess_meal_records(learner_id);
CREATE INDEX IF NOT EXISTS idx_mess_meal_records_date ON mess_meal_records(date);
CREATE INDEX IF NOT EXISTS idx_mess_meal_records_learner_date ON mess_meal_records(learner_id, date);

-- mess_billing_periods
CREATE INDEX IF NOT EXISTS idx_mess_billing_periods_institution ON mess_billing_periods(institution_id);
CREATE INDEX IF NOT EXISTS idx_mess_billing_periods_caterer ON mess_billing_periods(caterer_id);

-- mess_student_billing
CREATE INDEX IF NOT EXISTS idx_mess_student_billing_institution ON mess_student_billing(institution_id);
CREATE INDEX IF NOT EXISTS idx_mess_student_billing_learner ON mess_student_billing(learner_id);
CREATE INDEX IF NOT EXISTS idx_mess_student_billing_period ON mess_student_billing(billing_period_id);
CREATE INDEX IF NOT EXISTS idx_mess_student_billing_status ON mess_student_billing(payment_status);

-- mess_feedback
CREATE INDEX IF NOT EXISTS idx_mess_feedback_institution ON mess_feedback(institution_id);
CREATE INDEX IF NOT EXISTS idx_mess_feedback_caterer ON mess_feedback(caterer_id);
CREATE INDEX IF NOT EXISTS idx_mess_feedback_date ON mess_feedback(date);

-- mess_waste_log
CREATE INDEX IF NOT EXISTS idx_mess_waste_log_institution ON mess_waste_log(institution_id);
CREATE INDEX IF NOT EXISTS idx_mess_waste_log_caterer ON mess_waste_log(caterer_id);
CREATE INDEX IF NOT EXISTS idx_mess_waste_log_date ON mess_waste_log(date);

-- mess_meal_bookings
CREATE INDEX IF NOT EXISTS idx_mess_meal_bookings_institution ON mess_meal_bookings(institution_id);
CREATE INDEX IF NOT EXISTS idx_mess_meal_bookings_learner ON mess_meal_bookings(learner_id);
CREATE INDEX IF NOT EXISTS idx_mess_meal_bookings_date ON mess_meal_bookings(date);
CREATE INDEX IF NOT EXISTS idx_mess_meal_bookings_learner_date ON mess_meal_bookings(learner_id, date);

-- hostel_visitors
CREATE INDEX IF NOT EXISTS idx_hostel_visitors_institution ON hostel_visitors(institution_id);
CREATE INDEX IF NOT EXISTS idx_hostel_visitors_learner ON hostel_visitors(learner_id);
CREATE INDEX IF NOT EXISTS idx_hostel_visitors_block ON hostel_visitors(block_id);
CREATE INDEX IF NOT EXISTS idx_hostel_visitors_status ON hostel_visitors(status);

-- hostel_maintenance_requests
CREATE INDEX IF NOT EXISTS idx_hostel_maintenance_institution ON hostel_maintenance_requests(institution_id);
CREATE INDEX IF NOT EXISTS idx_hostel_maintenance_learner ON hostel_maintenance_requests(learner_id);
CREATE INDEX IF NOT EXISTS idx_hostel_maintenance_block ON hostel_maintenance_requests(block_id);
CREATE INDEX IF NOT EXISTS idx_hostel_maintenance_status ON hostel_maintenance_requests(status);
CREATE INDEX IF NOT EXISTS idx_hostel_maintenance_priority ON hostel_maintenance_requests(priority);
CREATE INDEX IF NOT EXISTS idx_hostel_maintenance_sla ON hostel_maintenance_requests(sla_status);

-- hostel_incidents
CREATE INDEX IF NOT EXISTS idx_hostel_incidents_institution ON hostel_incidents(institution_id);
CREATE INDEX IF NOT EXISTS idx_hostel_incidents_block ON hostel_incidents(block_id);
CREATE INDEX IF NOT EXISTS idx_hostel_incidents_status ON hostel_incidents(status);
CREATE INDEX IF NOT EXISTS idx_hostel_incidents_type ON hostel_incidents(incident_type);
CREATE INDEX IF NOT EXISTS idx_hostel_incidents_severity ON hostel_incidents(severity);

-- anti_ragging_affidavits
CREATE INDEX IF NOT EXISTS idx_anti_ragging_institution ON anti_ragging_affidavits(institution_id);
CREATE INDEX IF NOT EXISTS idx_anti_ragging_learner ON anti_ragging_affidavits(learner_id);
CREATE INDEX IF NOT EXISTS idx_anti_ragging_status ON anti_ragging_affidavits(status);

-- hostel_inspections
CREATE INDEX IF NOT EXISTS idx_hostel_inspections_institution ON hostel_inspections(institution_id);
CREATE INDEX IF NOT EXISTS idx_hostel_inspections_block ON hostel_inspections(block_id);
CREATE INDEX IF NOT EXISTS idx_hostel_inspections_date ON hostel_inspections(inspection_date);

-- hostel_fee_config
CREATE INDEX IF NOT EXISTS idx_hostel_fee_config_institution ON hostel_fee_config(institution_id);
CREATE INDEX IF NOT EXISTS idx_hostel_fee_config_year ON hostel_fee_config(academic_year_id);

-- hostel_deposits
CREATE INDEX IF NOT EXISTS idx_hostel_deposits_institution ON hostel_deposits(institution_id);
CREATE INDEX IF NOT EXISTS idx_hostel_deposits_learner ON hostel_deposits(learner_id);
CREATE INDEX IF NOT EXISTS idx_hostel_deposits_allocation ON hostel_deposits(allocation_id);
CREATE INDEX IF NOT EXISTS idx_hostel_deposits_status ON hostel_deposits(status);

-- mess_caterer_blocks
CREATE INDEX IF NOT EXISTS idx_mess_caterer_blocks_institution ON mess_caterer_blocks(institution_id);
CREATE INDEX IF NOT EXISTS idx_mess_caterer_blocks_caterer ON mess_caterer_blocks(caterer_id);
CREATE INDEX IF NOT EXISTS idx_mess_caterer_blocks_block ON mess_caterer_blocks(block_id);

-- hostel_incident_parties
CREATE INDEX IF NOT EXISTS idx_hostel_incident_parties_incident ON hostel_incident_parties(incident_id);
CREATE INDEX IF NOT EXISTS idx_hostel_incident_parties_institution ON hostel_incident_parties(institution_id);

-- hostel_waitlist
CREATE INDEX IF NOT EXISTS idx_hostel_waitlist_institution ON hostel_waitlist(institution_id);
CREATE INDEX IF NOT EXISTS idx_hostel_waitlist_learner ON hostel_waitlist(learner_id);
CREATE INDEX IF NOT EXISTS idx_hostel_waitlist_status ON hostel_waitlist(status);

-- hostel_access_log
CREATE INDEX IF NOT EXISTS idx_hostel_access_log_institution ON hostel_access_log(institution_id);
CREATE INDEX IF NOT EXISTS idx_hostel_access_log_block ON hostel_access_log(block_id);
CREATE INDEX IF NOT EXISTS idx_hostel_access_log_person ON hostel_access_log(person_id);
CREATE INDEX IF NOT EXISTS idx_hostel_access_log_timestamp ON hostel_access_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_hostel_access_log_direction ON hostel_access_log(direction);

-- hostel_known_visitors
CREATE INDEX IF NOT EXISTS idx_hostel_known_visitors_institution ON hostel_known_visitors(institution_id);
CREATE INDEX IF NOT EXISTS idx_hostel_known_visitors_learner ON hostel_known_visitors(learner_id);

-- hostel_curfew_exceptions
CREATE INDEX IF NOT EXISTS idx_hostel_curfew_exceptions_institution ON hostel_curfew_exceptions(institution_id);
CREATE INDEX IF NOT EXISTS idx_hostel_curfew_exceptions_block ON hostel_curfew_exceptions(block_id);

-- hostel_alert_rules
CREATE INDEX IF NOT EXISTS idx_hostel_alert_rules_institution ON hostel_alert_rules(institution_id);
CREATE INDEX IF NOT EXISTS idx_hostel_alert_rules_type ON hostel_alert_rules(alert_type);

-- hostel_risk_alerts
CREATE INDEX IF NOT EXISTS idx_hostel_risk_alerts_institution ON hostel_risk_alerts(institution_id);
CREATE INDEX IF NOT EXISTS idx_hostel_risk_alerts_type ON hostel_risk_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_hostel_risk_alerts_status ON hostel_risk_alerts(status);
CREATE INDEX IF NOT EXISTS idx_hostel_risk_alerts_learner ON hostel_risk_alerts(learner_id);
CREATE INDEX IF NOT EXISTS idx_hostel_risk_alerts_block ON hostel_risk_alerts(block_id);

-- hostel_leave_type_config
CREATE INDEX IF NOT EXISTS idx_hostel_leave_type_config_institution ON hostel_leave_type_config(institution_id);

-- hostel_maintenance_sla_config
CREATE INDEX IF NOT EXISTS idx_hostel_maintenance_sla_config_institution ON hostel_maintenance_sla_config(institution_id);
CREATE INDEX IF NOT EXISTS idx_hostel_maintenance_sla_config_category ON hostel_maintenance_sla_config(category);

-- ============================================================
-- TRIGGERS: updated_at auto-update
-- Drop + create pattern for idempotency
-- ============================================================
DROP TRIGGER IF EXISTS trg_hostel_blocks_updated_at ON hostel_blocks;
CREATE TRIGGER trg_hostel_blocks_updated_at
    BEFORE UPDATE ON hostel_blocks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_hostel_rooms_updated_at ON hostel_rooms;
CREATE TRIGGER trg_hostel_rooms_updated_at
    BEFORE UPDATE ON hostel_rooms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_hostel_beds_updated_at ON hostel_beds;
CREATE TRIGGER trg_hostel_beds_updated_at
    BEFORE UPDATE ON hostel_beds
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_hostel_wardens_updated_at ON hostel_wardens;
CREATE TRIGGER trg_hostel_wardens_updated_at
    BEFORE UPDATE ON hostel_wardens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_hostel_allocations_updated_at ON hostel_allocations;
CREATE TRIGGER trg_hostel_allocations_updated_at
    BEFORE UPDATE ON hostel_allocations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_hostel_roommate_preferences_updated_at ON hostel_roommate_preferences;
CREATE TRIGGER trg_hostel_roommate_preferences_updated_at
    BEFORE UPDATE ON hostel_roommate_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_hostel_attendance_updated_at ON hostel_attendance;
CREATE TRIGGER trg_hostel_attendance_updated_at
    BEFORE UPDATE ON hostel_attendance
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_hostel_leave_requests_updated_at ON hostel_leave_requests;
CREATE TRIGGER trg_hostel_leave_requests_updated_at
    BEFORE UPDATE ON hostel_leave_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_hostel_gate_passes_updated_at ON hostel_gate_passes;
CREATE TRIGGER trg_hostel_gate_passes_updated_at
    BEFORE UPDATE ON hostel_gate_passes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_mess_caterers_updated_at ON mess_caterers;
CREATE TRIGGER trg_mess_caterers_updated_at
    BEFORE UPDATE ON mess_caterers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_mess_menus_updated_at ON mess_menus;
CREATE TRIGGER trg_mess_menus_updated_at
    BEFORE UPDATE ON mess_menus
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_hostel_maintenance_requests_updated_at ON hostel_maintenance_requests;
CREATE TRIGGER trg_hostel_maintenance_requests_updated_at
    BEFORE UPDATE ON hostel_maintenance_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_hostel_incidents_updated_at ON hostel_incidents;
CREATE TRIGGER trg_hostel_incidents_updated_at
    BEFORE UPDATE ON hostel_incidents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_hostel_waitlist_updated_at ON hostel_waitlist;
CREATE TRIGGER trg_hostel_waitlist_updated_at
    BEFORE UPDATE ON hostel_waitlist
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_hostel_known_visitors_updated_at ON hostel_known_visitors;
CREATE TRIGGER trg_hostel_known_visitors_updated_at
    BEFORE UPDATE ON hostel_known_visitors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_hostel_curfew_exceptions_updated_at ON hostel_curfew_exceptions;
CREATE TRIGGER trg_hostel_curfew_exceptions_updated_at
    BEFORE UPDATE ON hostel_curfew_exceptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_hostel_alert_rules_updated_at ON hostel_alert_rules;
CREATE TRIGGER trg_hostel_alert_rules_updated_at
    BEFORE UPDATE ON hostel_alert_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_hostel_risk_alerts_updated_at ON hostel_risk_alerts;
CREATE TRIGGER trg_hostel_risk_alerts_updated_at
    BEFORE UPDATE ON hostel_risk_alerts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_hostel_leave_type_config_updated_at ON hostel_leave_type_config;
CREATE TRIGGER trg_hostel_leave_type_config_updated_at
    BEFORE UPDATE ON hostel_leave_type_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_hostel_maintenance_sla_config_updated_at ON hostel_maintenance_sla_config;
CREATE TRIGGER trg_hostel_maintenance_sla_config_updated_at
    BEFORE UPDATE ON hostel_maintenance_sla_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- DONE: Campus Living schema fully configured
-- 34 tables with RLS, institution isolation policies,
-- 90+ indexes, 20 updated_at triggers
-- ============================================================
