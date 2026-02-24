-- Phase 0: Add super_admin bypass to all 46 hostel/mess RLS policies
-- Previously: policies only checked institution_id match via profiles subquery
-- Now: also allows super_admin role to access all records
-- Affects: 37 hostel_* tables + 9 mess_* tables = 46 total

DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'hostel_access_log', 'hostel_alert_rules', 'hostel_allocations',
    'hostel_amc_contracts', 'hostel_attendance', 'hostel_beds',
    'hostel_blocks', 'hostel_cleaning_schedules', 'hostel_cleaning_tasks',
    'hostel_community_config', 'hostel_curfew_exceptions', 'hostel_deposits',
    'hostel_fee_config', 'hostel_gate_passes', 'hostel_health_cases',
    'hostel_incident_parties', 'hostel_incidents', 'hostel_inspections',
    'hostel_known_visitors', 'hostel_laundry_configs', 'hostel_laundry_orders',
    'hostel_leave_requests', 'hostel_leave_type_config', 'hostel_maintenance_requests',
    'hostel_maintenance_sla_config', 'hostel_onboarding_checklists',
    'hostel_onboarding_templates', 'hostel_pm_schedules', 'hostel_pm_tasks',
    'hostel_pulse_configs', 'hostel_pulse_responses', 'hostel_risk_alerts',
    'hostel_roommate_preferences', 'hostel_rooms', 'hostel_visitors',
    'hostel_waitlist', 'hostel_wardens',
    'mess_billing_periods', 'mess_caterer_blocks', 'mess_caterers',
    'mess_feedback', 'mess_meal_bookings', 'mess_meal_records',
    'mess_menus', 'mess_student_billing', 'mess_waste_log'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- Drop existing institution-only policy
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      tbl || '_institution_isolation',
      tbl
    );

    -- Create new policy with super_admin bypass
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL
        USING (
          institution_id = auth_institution_id()
          OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = ''super_admin'')
        )
        WITH CHECK (
          institution_id = auth_institution_id()
          OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = ''super_admin'')
        )',
      tbl || '_institution_isolation',
      tbl
    );
  END LOOP;
END;
$$;
