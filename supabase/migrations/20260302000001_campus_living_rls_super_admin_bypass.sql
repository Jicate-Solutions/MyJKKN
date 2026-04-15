-- =============================================================================
-- Campus Living Module — RLS Super Admin Bypass + auth_institution_id()
-- Created: 2026-03-02
-- Description: Replaces all 46 campus-living RLS policies to:
--   1. Use auth_institution_id() instead of inline subquery
--   2. Add super_admin bypass (full cross-institution access)
--   3. Add WITH CHECK clause for INSERT/UPDATE operations
-- NOTE: Idempotent — safe to re-run (drops before creating)
-- =============================================================================

DO $$
DECLARE
    tbl TEXT;
    policy_name TEXT;
BEGIN
    FOR tbl IN
        SELECT unnest(ARRAY[
            -- Hostel tables (37)
            'hostel_access_log',
            'hostel_alert_rules',
            'hostel_amc_contracts',
            'hostel_attendance',
            'hostel_blocks',
            'hostel_cleaning_schedules',
            'hostel_cleaning_tasks',
            'hostel_community_config',
            'hostel_curfew_exceptions',
            'hostel_deposits',
            'hostel_emergency_contacts',
            'hostel_fee_config',
            'hostel_gate_passes',
            'hostel_health_cases',
            'hostel_incident_parties',
            'hostel_incidents',
            'hostel_inspections',
            'hostel_known_visitors',
            'hostel_laundry_configs',
            'hostel_laundry_orders',
            'hostel_leave_requests',
            'hostel_leave_type_config',
            'hostel_maintenance_requests',
            'hostel_maintenance_sla_config',
            'hostel_onboarding_checklists',
            'hostel_onboarding_templates',
            'hostel_pm_schedules',
            'hostel_pm_tasks',
            'hostel_pulse_configs',
            'hostel_pulse_responses',
            'hostel_risk_alerts',
            'hostel_roommate_preferences',
            'hostel_safety_equipment',
            'hostel_visitors',
            'hostel_waitlist',
            'hostel_wardens',
            'anti_ragging_affidavits',
            -- Mess tables (9)
            'mess_billing_periods',
            'mess_caterer_blocks',
            'mess_caterers',
            'mess_feedback',
            'mess_meal_bookings',
            'mess_meal_records',
            'mess_menus',
            'mess_student_billing',
            'mess_waste_log'
        ])
    LOOP
        policy_name := tbl || '_institution_isolation';

        -- Drop existing policy (from original migration 20260222000016)
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', policy_name, tbl);

        -- Create new policy with super_admin bypass + auth_institution_id()
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR ALL
             USING (
                 institution_id = auth_institution_id()
                 OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = ''super_admin'')
             )
             WITH CHECK (
                 institution_id = auth_institution_id()
                 OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = ''super_admin'')
             )',
            policy_name, tbl
        );
    END LOOP;
END $$;
