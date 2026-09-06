-- ================================================================================
-- MYJKKN DATABASE TRIGGERS
-- Generated: 2025-01-17
-- Description: All database triggers organized by module
-- ================================================================================

-- ================================================================================
-- SECTION 1: TIMESTAMP UPDATE TRIGGERS
-- ================================================================================

-- Generic updated_at trigger for all tables
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_institutions_updated_at BEFORE UPDATE ON institutions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON students
    FOR EACH ROW EXECUTE FUNCTION update_students_updated_at();

CREATE TRIGGER update_staff_updated_at BEFORE UPDATE ON staff
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_degrees_updated_at BEFORE UPDATE ON degrees
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON departments
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_programs_updated_at BEFORE UPDATE ON programs
    FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

CREATE TRIGGER update_semesters_updated_at BEFORE UPDATE ON semesters
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_sections_updated_at BEFORE UPDATE ON sections
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON courses
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_course_mappings_updated_at BEFORE UPDATE ON course_mappings
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_academic_years_updated_at BEFORE UPDATE ON academic_years
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_periods_updated_at BEFORE UPDATE ON periods
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_timetables_updated_at BEFORE UPDATE ON timetables
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_student_attendance_updated_at BEFORE UPDATE ON student_attendance
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_staff_plans_updated_at BEFORE UPDATE ON staff_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_staff_plan_courses_updated_at BEFORE UPDATE ON staff_plan_courses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_class_incharges_updated_at BEFORE UPDATE ON class_incharges
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================================================
-- SECTION 2: ADMISSION MODULE TRIGGERS
-- ================================================================================

-- Set admission updated_at
CREATE TRIGGER set_admissions_updated_at BEFORE UPDATE ON admissions
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Generate institution application ID
CREATE TRIGGER set_institution_application_id_trigger BEFORE INSERT ON admissions
    FOR EACH ROW EXECUTE FUNCTION set_institution_application_id();

-- Auto-populate admission institution
CREATE TRIGGER trigger_auto_populate_admission_institution BEFORE INSERT ON admissions
    FOR EACH ROW EXECUTE FUNCTION auto_populate_admission_institution();

-- Set application ID
CREATE TRIGGER trigger_set_application_id BEFORE INSERT ON admissions
    FOR EACH ROW EXECUTE FUNCTION set_application_id();

-- ================================================================================
-- SECTION 3: BILLING MODULE TRIGGERS
-- ================================================================================

-- Billing updated_at triggers
CREATE TRIGGER trigger_billing_student_bills_updated_at BEFORE UPDATE ON billing_student_bills
    FOR EACH ROW EXECUTE FUNCTION update_billing_updated_at();

CREATE TRIGGER trigger_billing_receipts_updated_at BEFORE UPDATE ON billing_receipts
    FOR EACH ROW EXECUTE FUNCTION update_billing_updated_at();

CREATE TRIGGER trigger_billing_invoices_updated_at BEFORE UPDATE ON billing_invoices
    FOR EACH ROW EXECUTE FUNCTION update_billing_updated_at();

CREATE TRIGGER trigger_billing_discounts_updated_at BEFORE UPDATE ON billing_discounts
    FOR EACH ROW EXECUTE FUNCTION update_billing_updated_at();

CREATE TRIGGER trigger_billing_refunds_updated_at BEFORE UPDATE ON billing_refunds
    FOR EACH ROW EXECUTE FUNCTION update_billing_updated_at();

-- Updated: 2026-04-15 - Consolidated 3-tier category triggers into single flat billing_categories trigger.
CREATE TRIGGER trigger_billing_categories_updated_at BEFORE UPDATE ON billing_categories
    FOR EACH ROW EXECUTE FUNCTION update_billing_updated_at();

-- Billing status update triggers
CREATE TRIGGER trigger_update_bill_status_on_payment AFTER INSERT ON billing_receipt_items
    FOR EACH ROW EXECUTE FUNCTION update_bill_status();

CREATE TRIGGER trigger_update_bill_status_on_delete AFTER DELETE ON billing_receipt_items
    FOR EACH ROW EXECUTE FUNCTION update_bill_status_on_delete();

-- 20260611150000: re-check hostel upgrade payment-threshold holds on every payment
-- (gateway callbacks and office receipts both insert receipt items). The function
-- computes paid % from receipt items, so its order relative to
-- trigger_update_bill_status_on_payment does not matter.
CREATE TRIGGER trg_cl_upgrade_holds_after_payment AFTER INSERT ON billing_receipt_items
    FOR EACH ROW EXECUTE FUNCTION _on_receipt_item_process_upgrade_holds();

CREATE TRIGGER trigger_update_bill_balance_on_amount_change AFTER UPDATE OF bill_amount ON billing_student_bills
    FOR EACH ROW EXECUTE FUNCTION update_bill_balance_on_amount_change();

CREATE TRIGGER trigger_update_bill_on_refund_status_change AFTER UPDATE OF approval_status ON billing_refunds
    FOR EACH ROW EXECUTE FUNCTION update_bill_on_refund_status_change();

-- Billing summary refresh triggers
CREATE TRIGGER trigger_bills_refresh_summary AFTER INSERT OR UPDATE OR DELETE ON billing_student_bills
    FOR EACH ROW EXECUTE FUNCTION trigger_refresh_student_billing_summary();

CREATE TRIGGER trigger_receipts_refresh_summary AFTER INSERT OR UPDATE OR DELETE ON billing_receipts
    FOR EACH ROW EXECUTE FUNCTION trigger_refresh_student_billing_summary();

CREATE TRIGGER trigger_refunds_refresh_summary AFTER INSERT OR UPDATE OR DELETE ON billing_refunds
    FOR EACH ROW EXECUTE FUNCTION trigger_refresh_student_billing_summary();

-- BILLING REFUND WORKFLOW (2026-07-11) updated_at triggers
CREATE TRIGGER trigger_refund_flow_configs_updated_at BEFORE UPDATE ON billing_refund_flow_configs
    FOR EACH ROW EXECUTE FUNCTION update_billing_updated_at();

CREATE TRIGGER trigger_refund_requests_updated_at BEFORE UPDATE ON billing_refund_requests
    FOR EACH ROW EXECUTE FUNCTION update_billing_updated_at();

-- Global XOR institution-specific scope exclusivity backstop (2026-07-14,
-- refund_flow_scope_exclusivity). See fn_enforce_refund_flow_scope_exclusivity
-- in 02_functions.sql.
CREATE TRIGGER trigger_refund_flow_scope_exclusivity BEFORE INSERT OR UPDATE ON billing_refund_flow_configs
    FOR EACH ROW EXECUTE FUNCTION fn_enforce_refund_flow_scope_exclusivity();

-- ================================================================================
-- SECTION 4: ACADEMIC MODULE TRIGGERS
-- ================================================================================

-- Institution ID auto-population triggers
CREATE TRIGGER trg_degrees_set_institution_id BEFORE INSERT ON degrees
    FOR EACH ROW EXECUTE FUNCTION set_degree_institution_id();

CREATE TRIGGER trg_departments_set_institution_id BEFORE INSERT ON departments
    FOR EACH ROW EXECUTE FUNCTION set_department_institution_id();

CREATE TRIGGER trg_programs_set_institution_id BEFORE INSERT ON programs
    FOR EACH ROW EXECUTE FUNCTION set_program_institution_id();

CREATE TRIGGER trg_semesters_set_institution_id BEFORE INSERT ON semesters
    FOR EACH ROW EXECUTE FUNCTION set_semester_institution_id();

CREATE TRIGGER trg_sections_set_institution_id BEFORE INSERT ON sections
    FOR EACH ROW EXECUTE FUNCTION set_section_institution_id();

CREATE TRIGGER trg_courses_set_institution_id BEFORE INSERT ON courses
    FOR EACH ROW EXECUTE FUNCTION set_course_institution_id();

CREATE TRIGGER trg_course_mappings_set_institution_id BEFORE INSERT ON course_mappings
    FOR EACH ROW EXECUTE FUNCTION set_course_mapping_institution_id();

-- Program validation triggers
CREATE TRIGGER trigger_validate_program_changes BEFORE UPDATE ON programs
    FOR EACH ROW EXECUTE FUNCTION validate_program_changes();

-- Semester validation triggers
CREATE TRIGGER trigger_validate_semester_program_hierarchy BEFORE INSERT OR UPDATE ON semesters
    FOR EACH ROW EXECUTE FUNCTION validate_semester_program_hierarchy();

-- ================================================================================
-- SECTION 5: STUDENT MODULE TRIGGERS
-- ================================================================================

-- Auto-populate student institution
CREATE TRIGGER trigger_auto_populate_student_institution BEFORE INSERT ON students
    FOR EACH ROW EXECUTE FUNCTION auto_populate_student_institution();

-- Validate student semester consistency
CREATE TRIGGER trigger_validate_student_semester_consistency BEFORE INSERT OR UPDATE ON students
    FOR EACH ROW EXECUTE FUNCTION validate_student_semester_consistency();

-- ================================================================================
-- SECTION 6: STAFF MODULE TRIGGERS
-- ================================================================================

-- Sync staff to profiles (INSERT OR UPDATE)
-- Updated: 2025-10-15 - Changed to BEFORE trigger to allow storing profile_id
-- Updated: 2025-10-15 - Removed duplicate triggers, this handles ALL sync
-- Updated: 2026-04-14 - Dynamic role (role_key) support; added dept-scope validation trigger below.
CREATE TRIGGER trg_sync_staff_to_profiles BEFORE INSERT OR UPDATE ON staff
    FOR EACH ROW EXECUTE FUNCTION sync_staff_to_profiles();

-- Validate department scope based on category.is_teaching
-- Updated: 2026-04-14 - Enforces: teaching => department_id required; non-teaching => department_id must be NULL.
-- Must run BEFORE sync_staff_to_profiles so the profile row mirrors validated/cleared values.
DROP TRIGGER IF EXISTS trg_validate_staff_department_scope ON staff;
CREATE TRIGGER trg_validate_staff_department_scope BEFORE INSERT OR UPDATE OF category_id, department_id, role_key ON staff
    FOR EACH ROW EXECUTE FUNCTION validate_staff_department_scope();

-- Delete staff profile when staff is deleted
-- Updated: 2025-10-15 - Added to sync staff deletion to profiles table
CREATE TRIGGER trg_delete_staff_profile AFTER DELETE ON staff
    FOR EACH ROW EXECUTE FUNCTION delete_staff_profile();

-- Lowercase institution email
CREATE TRIGGER trigger_lowercase_institution_email BEFORE INSERT OR UPDATE ON staff
    FOR EACH ROW EXECUTE FUNCTION lowercase_institution_email();

-- Auto-populate staff plan institution
CREATE TRIGGER trigger_auto_populate_staff_plan_institution BEFORE INSERT ON staff_plans
    FOR EACH ROW EXECUTE FUNCTION auto_populate_staff_plan_institution();

-- Auto-sync timetables when staff planning changes
CREATE TRIGGER trigger_auto_sync_timetables_on_staff_plan_insert AFTER INSERT ON staff_plan_courses
    FOR EACH ROW EXECUTE FUNCTION auto_sync_timetables_on_staff_plan_change();

CREATE TRIGGER trigger_auto_sync_timetables_on_staff_plan_update AFTER UPDATE ON staff_plan_courses
    FOR EACH ROW EXECUTE FUNCTION auto_sync_timetables_on_staff_plan_change();

CREATE TRIGGER trigger_auto_sync_timetables_on_staff_plan_delete AFTER DELETE ON staff_plan_courses
    FOR EACH ROW EXECUTE FUNCTION auto_sync_timetables_on_staff_plan_change();

-- ================================================================================
-- SECTION 7: PROFILE MODULE TRIGGERS
-- ================================================================================

-- Profile update triggers
CREATE TRIGGER on_profiles_updated BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_set_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ================================================================================
-- SECTION 8: BUG REPORT MODULE TRIGGERS
-- ================================================================================

-- Set bug display ID
CREATE TRIGGER trigger_set_bug_display_id BEFORE INSERT ON bug_reports
    FOR EACH ROW EXECUTE FUNCTION set_bug_display_id();

-- Add bug reporter as participant
CREATE TRIGGER trigger_add_bug_reporter_participant AFTER INSERT ON bug_reports
    FOR EACH ROW EXECUTE FUNCTION add_bug_reporter_as_participant();

-- Create bug status change message (DISABLED - Auto messages not needed)
-- CREATE TRIGGER trigger_bug_status_change_message AFTER UPDATE OF status ON bug_reports
--     FOR EACH ROW EXECUTE FUNCTION create_bug_status_change_message();

-- ================================================================================
-- SECTION 9: RESOURCE MANAGEMENT MODULE TRIGGERS
-- ================================================================================

-- Resource updated_at triggers
CREATE TRIGGER update_resources_updated_at BEFORE UPDATE ON resources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reservations_updated_at BEFORE UPDATE ON resource_reservations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_approvals_updated_at BEFORE UPDATE ON resource_approvals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_parent_categories_updated_at BEFORE UPDATE ON resource_parent_categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sub_categories_updated_at BEFORE UPDATE ON resource_sub_categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_attribute_definitions_updated_at BEFORE UPDATE ON resource_attribute_definitions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Resource usage logging
CREATE TRIGGER log_resource_usage_trigger AFTER INSERT ON resource_reservations
    FOR EACH ROW EXECUTE FUNCTION log_resource_usage();

-- Update resource reservation count
CREATE TRIGGER update_resource_reservation_count_trigger AFTER INSERT OR UPDATE OR DELETE ON resource_reservations
    FOR EACH ROW EXECUTE FUNCTION update_resource_reservation_count();

-- Pending-aware, capacity-aware slot lock (replaces tr_reservation_approved_decrement_stock)
DROP TRIGGER IF EXISTS tr_reservation_approved_decrement_stock ON public.resource_reservations;
DROP FUNCTION IF EXISTS public.fn_reservation_approved_decrement_stock();
CREATE TRIGGER tr_reservation_enforce_slot_lock
  BEFORE INSERT OR UPDATE OF start_time, end_time, quantity, resource_id, status
  ON public.resource_reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_reservation_enforce_slot_lock();

-- Update category usage count
CREATE TRIGGER update_category_usage_count_trigger AFTER INSERT OR UPDATE OR DELETE ON resources
    FOR EACH ROW EXECUTE FUNCTION update_category_usage_count();

-- ================================================================================
-- SECTION 10: NOTIFICATION MODULE TRIGGERS
-- ================================================================================

-- Notification timestamps
CREATE TRIGGER set_timestamp_notifications BEFORE UPDATE ON notifications
    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_timestamp_push_subscriptions BEFORE UPDATE ON push_subscriptions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- ================================================================================
-- SECTION 11: APPLICATION MODULE TRIGGERS
-- ================================================================================

-- Application timestamps
CREATE TRIGGER update_applications_timestamp BEFORE UPDATE ON applications
    FOR EACH ROW EXECUTE FUNCTION update_applications_timestamp();

-- Set applications created_by
CREATE TRIGGER set_applications_created_by_trigger BEFORE INSERT ON applications
    FOR EACH ROW EXECUTE FUNCTION set_applications_created_by();

-- ================================================================================
-- SECTION 12: CATEGORY MODULE TRIGGERS
-- ================================================================================

-- Category triggers
CREATE TRIGGER set_categories_created_by_trigger BEFORE INSERT ON categories
    FOR EACH ROW EXECUTE FUNCTION set_categories_created_by();

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Subcategory triggers
CREATE TRIGGER set_subcategory_updated_at BEFORE UPDATE ON subcategories
    FOR EACH ROW EXECUTE FUNCTION update_subcategory_updated_at();

-- ================================================================================
-- SECTION 13: API KEY MODULE TRIGGERS (Previously SECTION 14)
-- ================================================================================

-- API key timestamp triggers
CREATE TRIGGER trigger_update_api_key_timestamp BEFORE UPDATE ON api_keys
    FOR EACH ROW EXECUTE FUNCTION update_api_key_updated_at();

CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================================================
-- SECTION 15: CUSTOM ROLES MODULE TRIGGERS
-- ================================================================================

-- Custom roles updated_at
CREATE TRIGGER set_custom_roles_updated_at BEFORE UPDATE ON custom_roles
    FOR EACH ROW EXECUTE FUNCTION update_custom_roles_updated_at();

-- ================================================================================
-- SECTION 16: USER INSTITUTION ACCESS TRIGGERS
-- ================================================================================

-- User institution access updated_at
CREATE TRIGGER trigger_update_user_institution_access_updated_at BEFORE UPDATE ON user_institution_access
    FOR EACH ROW EXECUTE FUNCTION update_user_institution_access_updated_at();

-- ================================================================================
-- SECTION 17: ATTENDANCE VALIDATION TRIGGERS
-- ================================================================================

-- Updated: 2025-09-05 - Added staff assignment validation trigger
-- Validate staff assignment before allowing attendance marking
CREATE TRIGGER validate_attendance_staff_assignment_trigger
    BEFORE INSERT OR UPDATE ON student_attendance
    FOR EACH ROW
    EXECUTE FUNCTION validate_attendance_staff_assignment();

-- ================================================================================
-- SECTION 18: AUTH MODULE TRIGGERS (IF NEEDED)
-- ================================================================================

-- Handle new user trigger (for auth.users table if accessible)
-- Note: This trigger would be on auth.users table, not public schema
-- CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
--     FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ================================================================================
-- SECTION 18: STORAGE TRIGGERS (IF NEEDED)
-- ================================================================================

-- Storage object deleted trigger (for storage.objects table if accessible)
-- CREATE TRIGGER on_storage_object_deleted AFTER DELETE ON storage.objects
--     FOR EACH ROW EXECUTE FUNCTION on_storage_object_deleted();

-- ================================================================================
-- SECTION 19: STUDENT ROLE AUTO-ASSIGNMENT TRIGGER
-- Added: 2025-12-27
-- ================================================================================

-- Function: Auto-assign student role when learner_id is set on profile
CREATE OR REPLACE FUNCTION public.auto_assign_student_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_role_id UUID;
    v_existing_roles_count INT;
BEGIN
    -- Only proceed if learner_id is being set (student account)
    IF NEW.learner_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Only proceed if learner_id was just added or changed
    IF TG_OP = 'UPDATE' AND OLD.learner_id IS NOT DISTINCT FROM NEW.learner_id THEN
        RETURN NEW;
    END IF;

    -- Check if user already has roles assigned
    SELECT COUNT(*) INTO v_existing_roles_count
    FROM user_roles
    WHERE user_id = NEW.id;

    -- If user already has roles, don't auto-assign
    IF v_existing_roles_count > 0 THEN
        RETURN NEW;
    END IF;

    -- Ensure student role exists and get its ID
    SELECT ensure_student_role() INTO v_student_role_id;

    -- Assign student role as primary role
    INSERT INTO user_roles (user_id, role_id, is_primary, assigned_at)
    VALUES (NEW.id, v_student_role_id, true, NOW())
    ON CONFLICT (user_id, role_id) DO NOTHING;

    RAISE NOTICE 'Auto-assigned student role to user: %', NEW.id;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION auto_assign_student_role IS
'Automatically assigns student role when learner_id is set on profile. Called by trigger on profiles table.';

-- Create trigger on profiles table
DROP TRIGGER IF EXISTS trigger_auto_assign_student_role ON public.profiles;
CREATE TRIGGER trigger_auto_assign_student_role
    AFTER INSERT OR UPDATE OF learner_id ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION auto_assign_student_role();

COMMENT ON TRIGGER trigger_auto_assign_student_role ON profiles IS
'Auto-assigns student role when learner_id is set. Ensures students automatically get proper permissions.';

-- ================================================================================
-- SECTION 20: AUTO-LINK PROFILE TO APPROVED LEARNER
-- Added: 2025-12-27
-- ================================================================================

-- Function: Auto-link profile to approved learner on first login
-- Purpose: When user signs in with college email, auto-link to approved learner
-- Sets: learner_id, institution_id, department_id, role=student, full_name
CREATE OR REPLACE FUNCTION public.auto_link_profile_to_approved_learner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_learner_record RECORD;
    v_full_name TEXT;
BEGIN
    -- Only proceed if this is a NEW profile without learner_id
    IF TG_OP = 'INSERT' AND NEW.learner_id IS NULL AND NEW.email IS NOT NULL THEN

        -- Match an eligible learner by college_email. 'approved'/'active'/
        -- 'graduated' = full access; the 4 induction statuses = pre-onboarding
        -- induction-only access (scoped by proxy.ts). Keep in sync with
        -- INDUCTION_ELIGIBLE_LIFECYCLE_STATUSES + the OAuth callback lookup.
        -- (20260629100000_induction_only_access_widen_provisioning.sql)
        SELECT
            id,
            first_name,
            last_name,
            institution_id,
            department_id,
            lifecycle_status
        INTO v_learner_record
        FROM learners_profiles
        WHERE LOWER(college_email) = LOWER(NEW.email)
        AND lifecycle_status IN (
            'approved', 'active', 'graduated',
            'admitted', 'reserved', 'enquiry_submitted', 'enquiry', 'account'
        )
        LIMIT 1;

        -- If learner found, link it to this profile
        IF v_learner_record.id IS NOT NULL THEN

            -- Build full name from learner if not set
            v_full_name := NEW.full_name;
            IF v_full_name IS NULL OR v_full_name = '' THEN
                v_full_name := TRIM(CONCAT(v_learner_record.first_name, ' ', COALESCE(v_learner_record.last_name, '')));
            END IF;

            -- Update the NEW record before it's inserted
            NEW.learner_id := v_learner_record.id;
            NEW.institution_id := COALESCE(NEW.institution_id, v_learner_record.institution_id);
            NEW.department_id := COALESCE(NEW.department_id, v_learner_record.department_id);
            NEW.role := COALESCE(NEW.role, 'student');
            NEW.full_name := v_full_name;
            NEW.profile_completed := true;

            RAISE NOTICE 'Auto-linked new profile to learner: % (email: %, status: %)',
                v_learner_record.id, NEW.email, v_learner_record.lifecycle_status;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION auto_link_profile_to_approved_learner IS
'Auto-links new user profiles to approved/active/graduated learners with matching email. Sets institution_id, department_id, role=student.';

-- Create trigger on profiles table
DROP TRIGGER IF EXISTS trigger_auto_link_profile_to_approved_learner ON public.profiles;
CREATE TRIGGER trigger_auto_link_profile_to_approved_learner
    BEFORE INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION auto_link_profile_to_approved_learner();

COMMENT ON TRIGGER trigger_auto_link_profile_to_approved_learner ON profiles IS
'Auto-links new profiles to approved learners on first login. Includes institution/department from learner.';

-- ================================================================================
-- SECTION 8: LEARNER PROFILE SYNC TRIGGERS
-- Created: 2026-01-28 - Auto-sync learner changes to profiles table
-- ================================================================================

-- Sync learner college_email changes to profiles table
-- Runs on both INSERT and UPDATE to handle new learners and email changes
DROP TRIGGER IF EXISTS trg_sync_learner_email_to_profile ON public.learners_profiles;
CREATE TRIGGER trg_sync_learner_email_to_profile
  AFTER INSERT OR UPDATE OF college_email ON public.learners_profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_learner_email_to_profile();

COMMENT ON TRIGGER trg_sync_learner_email_to_profile ON learners_profiles IS
'Auto-syncs college_email changes from learners to profiles. Handles email updates and orphaned profile linking.';

-- Sync learner lifecycle_status changes to profile is_active
-- Ensures users can only log in when learner status is active
DROP TRIGGER IF EXISTS trg_sync_learner_status_to_profile ON public.learners_profiles;
CREATE TRIGGER trg_sync_learner_status_to_profile
  AFTER UPDATE OF lifecycle_status ON public.learners_profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_learner_status_to_profile();

COMMENT ON TRIGGER trg_sync_learner_status_to_profile ON learners_profiles IS
'Auto-syncs lifecycle_status changes to profile is_active. Only active learners can log in.';

-- Stamp activated_at once when learner first becomes active (seat analytics baseline)
DROP TRIGGER IF EXISTS trg_set_learner_activated_at ON public.learners_profiles;
CREATE TRIGGER trg_set_learner_activated_at
  BEFORE UPDATE OF lifecycle_status ON public.learners_profiles
  FOR EACH ROW
  EXECUTE FUNCTION set_learner_activated_at();

COMMENT ON TRIGGER trg_set_learner_activated_at ON learners_profiles IS
'Sets activated_at once on first active transition. Used as the canonical seat-fill date for analytics.';

-- ================================================================================
-- SERVICE REQUEST MODULE TRIGGERS
-- Updated: 2026-02-09
-- ================================================================================

CREATE TRIGGER update_service_types_updated_at
    BEFORE UPDATE ON service_types
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_service_requests_updated_at
    BEFORE UPDATE ON service_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- STARTUP STUDIO: trg_prevent_duplicate_event_member
-- Added: 2026-03-07
-- Fires BEFORE INSERT OR UPDATE on event_team_members.
-- Prevents same learner_id from being accepted in
-- more than one team per event (DB-level enforcement).
-- Function: prevent_duplicate_event_member() in 02_functions.sql
-- =====================================================
DROP TRIGGER IF EXISTS trg_prevent_duplicate_event_member ON event_team_members;
CREATE TRIGGER trg_prevent_duplicate_event_member
BEFORE INSERT OR UPDATE ON event_team_members
FOR EACH ROW EXECUTE FUNCTION prevent_duplicate_event_member();

-- Added: 2026-03-08 - Auto-update updated_at on appathon_verifications
CREATE TRIGGER update_appathon_verifications_updated_at
    BEFORE UPDATE ON appathon_verifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- updated_at trigger for case_studies
-- Added: 2026-03-09

CREATE TRIGGER update_case_studies_updated_at
  BEFORE UPDATE ON case_studies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_track_declarations_updated_at
  BEFORE UPDATE ON track_declarations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════
-- EXPO MODULE TRIGGERS
-- Updated: 2026-03-13 - Initial creation
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_expo_team_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE expo_events SET total_team_members = (
      SELECT COUNT(*) FROM expo_event_team_members WHERE expo_event_id = OLD.expo_event_id
    ), updated_at = now() WHERE id = OLD.expo_event_id;
    RETURN OLD;
  ELSE
    UPDATE expo_events SET total_team_members = (
      SELECT COUNT(*) FROM expo_event_team_members WHERE expo_event_id = NEW.expo_event_id
    ), updated_at = now() WHERE id = NEW.expo_event_id;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_expo_team_count
  AFTER INSERT OR DELETE ON expo_event_team_members
  FOR EACH ROW EXECUTE FUNCTION update_expo_team_count();

CREATE OR REPLACE FUNCTION update_expo_report_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_event_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_event_id := OLD.expo_event_id;
  ELSE
    v_event_id := NEW.expo_event_id;
  END IF;

  UPDATE expo_events SET
    total_expenses = COALESCE((
      SELECT SUM(total_expense) FROM expo_daily_reports WHERE expo_event_id = v_event_id
    ), 0),
    total_leads_collected = COALESCE((
      SELECT SUM(leads_collected) FROM expo_daily_reports WHERE expo_event_id = v_event_id
    ), 0),
    updated_at = now()
  WHERE id = v_event_id;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_expo_report_totals
  AFTER INSERT OR UPDATE OR DELETE ON expo_daily_reports
  FOR EACH ROW EXECUTE FUNCTION update_expo_report_totals();

CREATE TRIGGER set_expo_masters_updated_at
  BEFORE UPDATE ON expo_masters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_expo_events_updated_at
  BEFORE UPDATE ON expo_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_expo_daily_reports_updated_at
  BEFORE UPDATE ON expo_daily_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Expo WhatsApp Message Queue updated_at trigger (Added: 2026-03-31)
CREATE TRIGGER set_expo_wa_queue_updated_at
  BEFORE UPDATE ON expo_wa_message_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- BYOW WhatsApp Personal Connections updated_at trigger (Added: 2026-03-16)
CREATE TRIGGER wa_personal_connections_updated_at
    BEFORE UPDATE ON wa_personal_connections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER wa_personal_message_logs_updated_at
    BEFORE UPDATE ON wa_personal_message_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Personal WhatsApp Templates updated_at trigger (Added: 2026-04-02)
CREATE TRIGGER wa_personal_templates_updated_at
    BEFORE UPDATE ON wa_personal_message_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Auto-Trigger Rules updated_at trigger (Added: 2026-04-02)
CREATE TRIGGER wa_auto_trigger_rules_updated_at
    BEFORE UPDATE ON wa_auto_trigger_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Personal WhatsApp Message Queue updated_at trigger (Added: 2026-04-02)
CREATE TRIGGER wa_personal_queue_updated_at
    BEFORE UPDATE ON wa_personal_message_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ================================================================================
-- SECTION: VAC + CASE Module Triggers (Added: 2026-04-02)
-- ================================================================================

-- Timestamp triggers for VAC tables
CREATE TRIGGER update_vac_courses_updated_at
    BEFORE UPDATE ON vac_courses
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_vac_lessons_updated_at
    BEFORE UPDATE ON vac_lessons
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_vac_enrollments_updated_at
    BEFORE UPDATE ON vac_enrollments
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_vac_learner_progress_updated_at
    BEFORE UPDATE ON vac_learner_progress
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Timestamp triggers for CASE tables
CREATE TRIGGER update_case_tracks_updated_at
    BEFORE UPDATE ON case_tracks
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_case_track_enrollments_updated_at
    BEFORE UPDATE ON case_track_enrollments
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_case_batches_updated_at
    BEFORE UPDATE ON case_batches
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_case_learner_progress_updated_at
    BEFORE UPDATE ON case_learner_progress
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_case_graduation_requirements_updated_at
    BEFORE UPDATE ON case_graduation_requirements
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Business logic trigger: Check CASE track prerequisites before enrollment
CREATE TRIGGER check_case_track_prerequisite_trigger
    BEFORE INSERT ON case_track_enrollments
    FOR EACH ROW EXECUTE FUNCTION check_case_track_prerequisite();

-- Business logic trigger: Auto-update learner progress when track enrollment completes
CREATE TRIGGER update_case_progress_on_track_complete
    AFTER UPDATE OF status ON case_track_enrollments
    FOR EACH ROW
    WHEN (NEW.status = 'completed' AND OLD.status != 'completed')
    EXECUTE FUNCTION update_case_learner_progress();

-- ================================================================================
-- End of Triggers File
-- Total Triggers: 103 (Updated: 2026-04-02) — Added 11 VAC/CASE triggers
-- ================================================================================
-- ═══════════════════════════════════════════════════════════════════════════
-- ADMISSION FORM BUILDER TRIGGERS
-- Added: 2026-04-08
-- ═══════════════════════════════════════════════════════════════════════════

-- Auto-update updated_at on admission_forms
CREATE TRIGGER trg_admission_forms_updated
  BEFORE UPDATE ON admission_forms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════
-- MARATHON COMPATIBILITY VIEW TRIGGERS
-- Added: 2026-04-09
-- Purpose: INSTEAD OF INSERT trigger for marathon_registrations view.
-- Allows the kbm-marathon-public external site to INSERT into
-- marathon_registrations (a view) which writes to events_registrations
-- (the real table). Auto-sets participant_type='external' and
-- source='public_site'.
-- See: supabase/setup/05_views.sql for the view definitions.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.marathon_registrations_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  INSERT INTO public.events_registrations (
    event_id,
    category_id,
    participant_name,
    participant_phone,
    participant_email,
    participant_age,
    participant_gender,
    institution_id,
    institution_name,
    department,
    bib_number,
    status,
    payment_status,
    payment_amount,
    payment_method,
    payment_reference,
    discount_code,
    discount_amount,
    custom_data,
    participant_type,
    source,
    referral_source
  ) VALUES (
    NEW.event_id,
    NEW.category_id,
    NEW.participant_name,
    NEW.participant_phone,
    NEW.participant_email,
    NEW.participant_age,
    NEW.participant_gender,
    NEW.institution_id,
    NEW.institution_name,
    NEW.department,
    NEW.bib_number,
    COALESCE(NEW.status, 'registered'),
    COALESCE(NEW.payment_status, 'pending'),
    COALESCE(NEW.payment_amount, 0),
    NEW.payment_method,
    NEW.payment_reference,
    NEW.discount_code,
    COALESCE(NEW.discount_amount, 0),
    COALESCE(NEW.custom_data, '{}'::jsonb),
    'external',
    COALESCE(NEW.source, 'public_site'),
    NEW.referral_source
  )
  RETURNING id INTO new_id;

  NEW.id := new_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS marathon_registrations_insert_trg ON public.marathon_registrations;
CREATE TRIGGER marathon_registrations_insert_trg
  INSTEAD OF INSERT ON public.marathon_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.marathon_registrations_insert();


-- =====================================================
-- Dashboard v2 — Triggers
-- Added: 2026-04-15 - Day 1 migration
-- Decision: Round 1.4 (frozen lineage — first activity timestamps lead permanently)
-- =====================================================

CREATE OR REPLACE FUNCTION trg_lead_first_touch_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE admission_leads
  SET first_touch_at = NEW.created_at
  WHERE id = NEW.lead_id AND first_touch_at IS NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_first_touch ON admission_lead_activities;
CREATE TRIGGER trg_lead_first_touch
  AFTER INSERT ON admission_lead_activities
  FOR EACH ROW
  EXECUTE FUNCTION trg_lead_first_touch_fn();

-- END Dashboard v2 triggers
-- =====================================================================
-- 2026-04-15 — HR Recruitment Phase 1A: updated_at triggers
-- Spec: specs/hr-recruitment-module-spec.md
-- Reuses the existing set_updated_at() function (assumed present from other HR tables).
-- =====================================================================

DROP TRIGGER IF EXISTS hr_recruitment_candidates_updated_at
  ON public.hr_recruitment_candidates;
CREATE TRIGGER hr_recruitment_candidates_updated_at
  BEFORE UPDATE ON public.hr_recruitment_candidates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- 2026-04-15 — Dashboard v2: Web Push auto-trigger
-- Spec: specs/myjkkn-dashboard-v2-spec.md §4.4, §6.2
-- Agent B (PR feat/dashboard-v2-push-send)
-- Functions live in supabase/setup/02_functions.sql (fn_trigger_push_send,
-- trg_notify_push_on_queue_insert_fn).
-- =====================================================================

DROP TRIGGER IF EXISTS trg_notify_push_on_queue_insert ON public.user_notifications;
CREATE TRIGGER trg_notify_push_on_queue_insert
  AFTER INSERT ON public.user_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notify_push_on_queue_insert_fn();

-- =====================================================================
-- Updated: 2026-04-21 - BUG-003146 expo_event_stalls updated_at trigger
-- =====================================================================

CREATE OR REPLACE FUNCTION touch_expo_event_stalls_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expo_event_stalls_touch ON expo_event_stalls;
CREATE TRIGGER trg_expo_event_stalls_touch
  BEFORE UPDATE ON expo_event_stalls
  FOR EACH ROW
  EXECUTE FUNCTION touch_expo_event_stalls_updated_at();

-- END BUG-003146 expo_event_stalls trigger

-- =====================================================
-- learners_profiles admission_year_id scope validator — Added 2026-04-23
-- Fires BEFORE INSERT/UPDATE OF admission_year_id, institution_id, program_id.
-- Calls validate_learner_admission_year_scope() (02_functions.sql) which
-- rejects cross-institution FK attachment (admission_years is institution-wide
-- as of 2026-06-05; the program check was dropped).
-- =====================================================
DROP TRIGGER IF EXISTS trg_validate_learner_admission_year_scope
  ON public.learners_profiles;

CREATE TRIGGER trg_validate_learner_admission_year_scope
  BEFORE INSERT OR UPDATE OF admission_year_id, institution_id, program_id
  ON public.learners_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_learner_admission_year_scope();

-- =====================================================
-- learners_profiles academic-scope validator — Added 2026-07-30
-- Fires BEFORE INSERT/UPDATE (all columns, so an institution_id move is caught
-- alongside the FK columns). Calls validate_learner_semester_year_scope()
-- (02_functions.sql), which rejects a degree_id / department_id / semester_id /
-- academic_year_id belonging to another institution.
-- =====================================================
DROP TRIGGER IF EXISTS trg_validate_learner_semester_year_scope
  ON public.learners_profiles;

CREATE TRIGGER trg_validate_learner_semester_year_scope
  BEFORE INSERT OR UPDATE
  ON public.learners_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_learner_semester_year_scope();

-- =====================================================
-- admission_years single-current enforcement — Added 2026-07-25
-- Migration: supabase/migrations/20260725_admission_years_is_current_flag.sql
-- Calls admission_years_enforce_single_current() (02_functions.sql), which
-- demotes the institution's previous is_current row and clears is_current on
-- any cohort being deactivated. Runs BEFORE the partial unique index
-- admission_years_one_current_per_institution is evaluated, so promoting a
-- cohort is a single toggle instead of a 23505 the client has to work around.
-- =====================================================
DROP TRIGGER IF EXISTS trg_admission_years_single_current
  ON public.admission_years;

CREATE TRIGGER trg_admission_years_single_current
  BEFORE INSERT OR UPDATE OF is_current, is_active
  ON public.admission_years
  FOR EACH ROW
  EXECUTE FUNCTION public.admission_years_enforce_single_current();

-- =====================================================================
-- Updated: 2026-04-24 - Auto-assign counselor on admission_leads INSERT
-- Pairs with fn_auto_assign_counselor() in 02_functions.sql.
-- =====================================================================
DROP TRIGGER IF EXISTS trg_admission_leads_auto_assign_counselor ON admission_leads;

CREATE TRIGGER trg_admission_leads_auto_assign_counselor
  BEFORE INSERT ON admission_leads
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_assign_counselor();

-- Updated: 2026-04-25 - decisions-spec.md v1.0 Sprint 0
-- Keep director_decisions.updated_at in sync on UPDATE.
DROP TRIGGER IF EXISTS trg_director_decisions_updated_at ON director_decisions;
CREATE TRIGGER trg_director_decisions_updated_at
  BEFORE UPDATE ON director_decisions
  FOR EACH ROW EXECUTE FUNCTION fn_director_decisions_set_updated_at();

-- ================================================================================
-- 2026-04-29: HR Sprint 5 Attendance — recompute triggers
-- (per specs/hrapp-sprint-5-attendance-spec.md, Round 3.2 + 3.3)
-- ================================================================================

DROP TRIGGER IF EXISTS tr_recompute_attendance_on_holiday_change ON institution_leaves;
CREATE TRIGGER tr_recompute_attendance_on_holiday_change
  AFTER INSERT OR UPDATE OR DELETE ON institution_leaves
  FOR EACH ROW
  EXECUTE FUNCTION fn_recompute_attendance_on_holiday_change();

DROP TRIGGER IF EXISTS tr_recompute_attendance_on_leave_approval ON hr_leave_applications;
CREATE TRIGGER tr_recompute_attendance_on_leave_approval
  AFTER UPDATE OF status ON hr_leave_applications
  FOR EACH ROW
  EXECUTE FUNCTION fn_recompute_attendance_on_leave_approval();

-- =====================================================================
-- Updated: 2026-04-29 - Wave B.1 — Notification Generator Policy triggers.
-- BEFORE UPDATE: touch updated_at via fn_notif_gen_cfg_set_updated_at.
-- AFTER INSERT/UPDATE/DELETE: log to audit table via fn_log_notif_gen_cfg_change.
-- =====================================================================
DROP TRIGGER IF EXISTS trg_notif_gen_cfg_updated_at ON public.notification_generator_config;
CREATE TRIGGER trg_notif_gen_cfg_updated_at
BEFORE UPDATE ON public.notification_generator_config
FOR EACH ROW EXECUTE FUNCTION public.fn_notif_gen_cfg_set_updated_at();

DROP TRIGGER IF EXISTS trg_notif_gen_cfg_audit ON public.notification_generator_config;
CREATE TRIGGER trg_notif_gen_cfg_audit
AFTER INSERT OR UPDATE OR DELETE ON public.notification_generator_config
FOR EACH ROW EXECUTE FUNCTION public.fn_log_notif_gen_cfg_change();

-- =====================================================================
-- Plan 5 — Detect matrix-dim changes on learners_profiles
-- Spec §8.4 — fires AFTER UPDATE on learners_profiles.
-- Three behaviors:
--   1. Always re-resolves fee_items via admission_resolve_fee_items_for_lead
--      so the profile always reflects the current fee structure.
--   2. If active (non-superseded) bills exist AND no pending event →
--      creates admission_fee_change_events + event_lines for admin review.
--   3. If active bills exist AND a pending event already exists →
--      UPDATES the existing event with current new_fee_structure_id and
--      regenerates event_lines with correct new amounts.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.trigger_detect_fee_dimension_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_changed_field         text;
    v_has_active_bills      boolean;
    v_pending_event_id      uuid;
    v_old_structure_id      uuid;
    v_new_structure_id      uuid;
    v_event_id              uuid;
    v_caller                uuid := auth.uid();
BEGIN
    -- Skip if legacy mode or if legacy_fee_mode itself is what changed
    IF NEW.legacy_fee_mode = true OR NEW.legacy_fee_mode IS DISTINCT FROM OLD.legacy_fee_mode THEN
        RETURN NEW;
    END IF;

    -- Detect which fee-matrix dimension changed (first match wins)
    v_changed_field := CASE
        WHEN NEW.program_id IS DISTINCT FROM OLD.program_id THEN 'program_id'
        WHEN NEW.quota_id IS DISTINCT FROM OLD.quota_id THEN 'quota_id'
        WHEN NEW.community_category_id IS DISTINCT FROM OLD.community_category_id THEN 'community_category_id'
        WHEN NEW.accommodation_type_id IS DISTINCT FROM OLD.accommodation_type_id THEN 'accommodation_type_id'
        WHEN NEW.admission_year_id IS DISTINCT FROM OLD.admission_year_id THEN 'admission_year_id'
        ELSE NULL
    END;

    IF v_changed_field IS NULL THEN
        RETURN NEW;
    END IF;

    -- Always re-resolve fee_items so profile reflects current structure
    PERFORM public.admission_resolve_fee_items_for_lead(NEW.id);

    -- Check if bills exist — only create/update change events when they do
    SELECT EXISTS (
        SELECT 1 FROM public.billing_student_bills
         WHERE student_id = NEW.id AND status <> 'superseded'
    ) INTO v_has_active_bills;

    IF NOT v_has_active_bills THEN
        -- No bills → fee_items already refreshed above, nothing else to do
        RETURN NEW;
    END IF;

    -- OLD structure — match 7 dims + community via junction
    SELECT afs.id INTO v_old_structure_id
      FROM public.admission_fee_structures afs
     WHERE afs.institution_id        = OLD.institution_id
       AND afs.degree_id             = OLD.degree_id
       AND afs.department_id         = OLD.department_id
       AND afs.programme_id          = OLD.program_id
       AND afs.quota_id              = OLD.quota_id
       AND afs.accommodation_type_id = OLD.accommodation_type_id
       AND afs.admission_year_id     = OLD.admission_year_id
       AND afs.status = 'active'
       AND EXISTS (
             SELECT 1 FROM public.admission_fee_structure_communities j
              WHERE j.fee_structure_id      = afs.id
                AND j.community_category_id = OLD.community_category_id
           )
     LIMIT 1;

    -- NEW structure — same shape, learner's NEW dimensions
    SELECT afs.id INTO v_new_structure_id
      FROM public.admission_fee_structures afs
     WHERE afs.institution_id        = NEW.institution_id
       AND afs.degree_id             = NEW.degree_id
       AND afs.department_id         = NEW.department_id
       AND afs.programme_id          = NEW.program_id
       AND afs.quota_id              = NEW.quota_id
       AND afs.accommodation_type_id = NEW.accommodation_type_id
       AND afs.admission_year_id     = NEW.admission_year_id
       AND afs.status = 'active'
       AND EXISTS (
             SELECT 1 FROM public.admission_fee_structure_communities j
              WHERE j.fee_structure_id      = afs.id
                AND j.community_category_id = NEW.community_category_id
           )
     LIMIT 1;

    -- Check for existing pending event
    SELECT id INTO v_pending_event_id
      FROM public.admission_fee_change_events
     WHERE learner_id = NEW.id AND status = 'pending_review'
     LIMIT 1;

    IF v_pending_event_id IS NOT NULL THEN
        -- Update existing pending event with latest change info
        UPDATE public.admission_fee_change_events
           SET trigger_field         = v_changed_field,
               new_fee_structure_id  = v_new_structure_id,
               updated_at            = now()
         WHERE id = v_pending_event_id;

        -- Regenerate event lines with current amounts
        DELETE FROM public.admission_fee_change_event_lines
         WHERE event_id = v_pending_event_id;

        INSERT INTO public.admission_fee_change_event_lines (
            event_id, billing_category_id, old_amount, new_amount, paid_amount_so_far
        )
        SELECT
            v_pending_event_id,
            cat_id,
            old_amount,
            new_amount,
            paid
        FROM (
            SELECT cat_id,
                   MAX(old_amount) AS old_amount,
                   MAX(new_amount) AS new_amount,
                   COALESCE(MAX(paid), 0) AS paid
              FROM (
                  SELECT fsi.billing_category_id AS cat_id,
                         fsi.amount AS old_amount,
                         NULL::numeric AS new_amount,
                         NULL::numeric AS paid
                    FROM public.admission_fee_structure_items fsi
                    JOIN public.admission_fee_change_events evt ON evt.id = v_pending_event_id
                   WHERE fsi.fee_structure_id = evt.old_fee_structure_id
                  UNION ALL
                  SELECT fsi.billing_category_id,
                         NULL::numeric,
                         fsi.amount,
                         NULL::numeric
                    FROM public.admission_fee_structure_items fsi
                   WHERE fsi.fee_structure_id = v_new_structure_id
                  UNION ALL
                  SELECT b.item_category_id,
                         NULL::numeric,
                         NULL::numeric,
                         b.final_amount - b.balance_amount
                    FROM public.billing_student_bills b
                   WHERE b.student_id = NEW.id
                     AND b.status <> 'superseded'
                     AND b.item_category_id IS NOT NULL
              ) u
             GROUP BY cat_id
        ) g
        WHERE cat_id IS NOT NULL;

        RETURN NEW;
    END IF;

    -- No pending event — create a new one
    INSERT INTO public.admission_fee_change_events (
        learner_id, trigger_field,
        old_program_id, old_quota_id, old_community_category_id,
        old_accommodation_type_id, old_admission_year_id,
        old_fee_structure_id, new_fee_structure_id,
        requested_by
    ) VALUES (
        NEW.id, v_changed_field,
        OLD.program_id, OLD.quota_id, OLD.community_category_id,
        OLD.accommodation_type_id, OLD.admission_year_id,
        v_old_structure_id, v_new_structure_id,
        v_caller
    )
    RETURNING id INTO v_event_id;

    INSERT INTO public.admission_fee_change_event_lines (
        event_id, billing_category_id, old_amount, new_amount, paid_amount_so_far
    )
    SELECT
        v_event_id,
        cat_id,
        old_amount,
        new_amount,
        paid
    FROM (
        SELECT cat_id,
               MAX(old_amount) AS old_amount,
               MAX(new_amount) AS new_amount,
               COALESCE(MAX(paid), 0) AS paid
          FROM (
              SELECT fsi.billing_category_id AS cat_id,
                     fsi.amount AS old_amount,
                     NULL::numeric AS new_amount,
                     NULL::numeric AS paid
                FROM public.admission_fee_structure_items fsi
               WHERE fsi.fee_structure_id = v_old_structure_id
              UNION ALL
              SELECT fsi.billing_category_id,
                     NULL::numeric,
                     fsi.amount,
                     NULL::numeric
                FROM public.admission_fee_structure_items fsi
               WHERE fsi.fee_structure_id = v_new_structure_id
              UNION ALL
              SELECT b.item_category_id,
                     NULL::numeric,
                     NULL::numeric,
                     b.final_amount - b.balance_amount
                FROM public.billing_student_bills b
               WHERE b.student_id = NEW.id
                 AND b.status <> 'superseded'
                 AND b.item_category_id IS NOT NULL
          ) u
         GROUP BY cat_id
    ) g
    WHERE cat_id IS NOT NULL;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_detect_fee_dimension_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_detect_fee_dimension_change ON public.learners_profiles;
CREATE TRIGGER trg_detect_fee_dimension_change
    AFTER UPDATE ON public.learners_profiles
    FOR EACH ROW EXECUTE FUNCTION public.trigger_detect_fee_dimension_change();

-- ============================================================================
-- trg_set_legacy_fee_mode_default — BEFORE INSERT default for legacy_fee_mode
-- (Plan 6 Task 1)
-- ============================================================================
-- Sets NEW.legacy_fee_mode := false when the institution's
-- admission_settings_per_institution.use_fee_structures flag is true.
-- Flag false or missing → DDL default of true is preserved.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_set_legacy_fee_mode_default ON public.learners_profiles;
CREATE TRIGGER trg_set_legacy_fee_mode_default
    BEFORE INSERT ON public.learners_profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_legacy_fee_mode_default();

-- ============================================================================
-- razorpay_accounts updated_at (migration 20260603130000)
-- ============================================================================
DROP TRIGGER IF EXISTS trigger_razorpay_accounts_updated_at ON public.razorpay_accounts;
CREATE TRIGGER trigger_razorpay_accounts_updated_at
BEFORE UPDATE ON public.razorpay_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_razorpay_accounts_updated_at();

-- ============================================================================
-- trg_sync_lead_referral_to_learner_profile (migration 20260610160000)
-- ============================================================================
-- Mirrors admission_leads referral attribution (referral_type, referred_by_id,
-- referred_by_name) onto the linked learners_profiles row so referral edits
-- made AFTER lead→learner conversion stay visible on the Enquiries page.
-- The leads module is the single edit surface for referral attribution
-- (enquiry-form Reference Information block removed 2026-05-21).
-- SECURITY DEFINER: lead editors don't necessarily hold learners_profiles
-- UPDATE rights. The nested learners_profiles UPDATE fires
-- trg_sync_learner_referral_to_attribution, whose NOT EXISTS guard finds the
-- already-updated lead row and skips — no duplicate attribution rows.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_lead_referral_to_learner_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.learner_profile_id IS NOT NULL THEN
    UPDATE learners_profiles lp
    SET referral_type    = NEW.referral_type,
        referred_by_id   = NEW.referred_by_id,
        referred_by_name = NEW.referred_by_name,
        updated_at       = now()
    WHERE lp.id = NEW.learner_profile_id
      AND (lp.referral_type    IS DISTINCT FROM NEW.referral_type
        OR lp.referred_by_id   IS DISTINCT FROM NEW.referred_by_id
        OR lp.referred_by_name IS DISTINCT FROM NEW.referred_by_name);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_lead_referral_to_learner_profile ON public.admission_leads;
CREATE TRIGGER trg_sync_lead_referral_to_learner_profile
AFTER INSERT OR UPDATE OF referral_type, referred_by_id, referred_by_name, learner_profile_id
ON public.admission_leads
FOR EACH ROW EXECUTE FUNCTION public.sync_lead_referral_to_learner_profile();

-- 20260611180000: seed today's hostel_cleaning_tasks row when a due cleaning
-- schedule is created (daily plans appear on the Tasks page immediately).
CREATE TRIGGER trg_cleaning_schedule_seed_task AFTER INSERT ON hostel_cleaning_schedules
    FOR EACH ROW EXECUTE FUNCTION _on_cleaning_schedule_seed_task();

-- 20260611190000: sync learners_profiles room/mess categories from the room
-- whenever an allocation becomes active (single enforcement point for manual,
-- batch-approval, auto-allocate and upgrade allocation paths).
CREATE TRIGGER trg_allocation_sync_learner_categories
AFTER INSERT OR UPDATE OF status ON hostel_allocations
FOR EACH ROW WHEN (NEW.status = 'active')
EXECUTE FUNCTION _on_allocation_sync_learner_categories();

-- Auto-apply fee-condition room/mess categories on academic bill writes
-- (mig 20260612130000). Transition tables can't span events => one per event.
DROP TRIGGER IF EXISTS trg_bill_apply_hostel_fee_categories_ins ON billing_student_bills;
CREATE TRIGGER trg_bill_apply_hostel_fee_categories_ins
AFTER INSERT ON billing_student_bills
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION trg_bill_apply_hostel_fee_categories();

DROP TRIGGER IF EXISTS trg_bill_apply_hostel_fee_categories_upd ON billing_student_bills;
CREATE TRIGGER trg_bill_apply_hostel_fee_categories_upd
AFTER UPDATE ON billing_student_bills
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION trg_bill_apply_hostel_fee_categories();

-- TMS transport-fee safe-delete: clean up soft-linked billing_student_bills
-- when a tms_fee_bill is deleted (mig 20260616160000). Closes the orphan trap
-- from the non-FK tms_fee_bill.billing_student_bill_id link; fails closed on paid.
DROP TRIGGER IF EXISTS trg_tms_fee_bill_cleanup_linked_billing ON tms_fee_bill;
CREATE TRIGGER trg_tms_fee_bill_cleanup_linked_billing
BEFORE DELETE ON tms_fee_bill
FOR EACH ROW
EXECUTE FUNCTION tms_fee_bill_cleanup_linked_billing();

-- Auto-derive hr_recruitment_jobs.hr_organization_id from the chosen college.
-- Mirrors 20260625120000_hr_recruitment_jobs_autofill_org.sql.
DROP TRIGGER IF EXISTS hr_recruitment_jobs_fill_org_biu ON public.hr_recruitment_jobs;
CREATE TRIGGER hr_recruitment_jobs_fill_org_biu
  BEFORE INSERT OR UPDATE OF institution_id, hr_organization_id
  ON public.hr_recruitment_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.hr_recruitment_jobs_fill_org();

-- Induction day/program feedback updated_at touch (2026-07-30).
-- Migration: supabase/migrations/20260730110000_induction_day_program_feedback.sql
DROP TRIGGER IF EXISTS trg_touch_updated_at ON public.event_day_feedback;
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON public.event_day_feedback
  FOR EACH ROW EXECUTE FUNCTION public.induction_touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_updated_at ON public.event_program_feedback;
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON public.event_program_feedback
  FOR EACH ROW EXECUTE FUNCTION public.induction_touch_updated_at();


-- hr_recruitment_candidate_comments updated_at (migration 20260703130200)
CREATE TRIGGER hr_rec_cand_comments_updated_at
  BEFORE UPDATE ON hr_recruitment_candidate_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Cohort Core updated_at (migration 20260731040000_cohort_core_spine.sql). 2026-07-05.
-- cohort_status_events is append-only (no updated_at column) → no trigger.
DROP TRIGGER IF EXISTS trg_cohorts_updated_at ON public.cohorts;
CREATE TRIGGER trg_cohorts_updated_at
  BEFORE UPDATE ON public.cohorts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_cohort_memberships_updated_at ON public.cohort_memberships;
CREATE TRIGGER trg_cohort_memberships_updated_at
  BEFORE UPDATE ON public.cohort_memberships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Cohort Core — M2: outcome-capture-at-close (Phase 7 · THE MOAT) ───────────
-- Migration: supabase/migrations/20260731091000_cohort_outcome_capture.sql (2026-07-05).
-- Snapshots ONE public.cohort_outcomes row when a cohort_memberships row
-- transitions INTO a terminal status (graduated | removed) from a non-terminal
-- one. The trigger is the single chokepoint every close passes through, so the
-- moat's fuel cannot be stranded by a service that forgets to record it.
-- SECURITY DEFINER (must INSERT regardless of who closed); anon/PUBLIC revoked
-- (invoked only by the trigger, never called directly). institution_id is copied
-- from the parent cohort — never a NULL-institution row.
-- UPGRADED 2026-07-06 (M7.1, migration 20260731092000): now CALLS the versioned
-- estimator fn_cohort_blended_score at close and MERGES the {blended_baseline,
-- blended_outcome, lift, …} envelope into outcome_snapshot. Scoring is best-effort
-- (an estimator error → unscored snapshot); the whole capture stays inside the
-- best-effort wrap so it can NEVER roll back the membership close.
CREATE OR REPLACE FUNCTION public.fn_capture_cohort_outcome()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind           text;
  v_institution_id uuid;
  v_score          jsonb;
BEGIN
  IF NEW.status NOT IN ('graduated','removed') THEN RETURN NEW; END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  IF OLD.status IN ('graduated','removed') THEN RETURN NEW; END IF;

  SELECT c.kind, c.institution_id INTO v_kind, v_institution_id
    FROM public.cohorts c WHERE c.id = NEW.cohort_id;

  IF v_institution_id IS NULL THEN
    RAISE NOTICE 'cohort_outcome capture skipped for membership % — parent cohort % has no institution', NEW.id, NEW.cohort_id;
    RETURN NEW;
  END IF;

  BEGIN
    BEGIN
      v_score := public.fn_cohort_blended_score(v_kind, NEW.member_type, NEW.member_ref, v_institution_id);
    EXCEPTION WHEN OTHERS THEN
      v_score := jsonb_build_object('scored', false, 'estimator_version', 'none',
                                    'reason', 'estimator raised: ' || SQLERRM, 'lift', NULL);
    END;

    INSERT INTO public.cohort_outcomes (
      cohort_id, membership_id, member_ref, member_type, kind,
      captured_at, outcome_snapshot, source, institution_id
    ) VALUES (
      NEW.cohort_id, NEW.id, NEW.member_ref, NEW.member_type, v_kind,
      now(),
      jsonb_build_object(
        'from_status',       OLD.status,
        'to_status',         NEW.status,
        'role',              NEW.role,
        'joined_at',         NEW.joined_at,
        'membership_config', NEW.config,
        'captured_by',       'trigger'
      ) || COALESCE(v_score, '{}'::jsonb),
      'trigger', v_institution_id
    )
    ON CONFLICT (membership_id) WHERE membership_id IS NOT NULL DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'cohort_outcome capture failed for membership % (kind %): %; close proceeds (best-effort M2)', NEW.id, v_kind, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_capture_cohort_outcome() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_cohort_capture_outcome ON public.cohort_memberships;
CREATE TRIGGER trg_cohort_capture_outcome
  AFTER UPDATE OF status ON public.cohort_memberships
  FOR EACH ROW
  WHEN (
    NEW.status IN ('graduated','removed')
    AND OLD.status IS DISTINCT FROM NEW.status
  )
  EXECUTE FUNCTION public.fn_capture_cohort_outcome();

-- ── Cohort Core — M7.3 proposals updated_at trigger (Phase 7) ────────────────
DROP TRIGGER IF EXISTS trg_cohort_proposals_updated_at ON public.cohort_adjustment_proposals;
CREATE TRIGGER trg_cohort_proposals_updated_at
  BEFORE UPDATE ON public.cohort_adjustment_proposals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Cohort Core — M7.3 proposal terminal-state + anti-spoof guard (Phase 7) ──
-- 'applied'/'rejected' are immutable (no re-apply of the additive delta); a human
-- decision binds reviewed_by to auth.uid(). Migration 20260731094000.
CREATE OR REPLACE FUNCTION public.fn_cohort_proposal_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF OLD.status IN ('applied','rejected') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'proposal % is % (terminal) — its status cannot change', OLD.id, OLD.status
      USING ERRCODE='check_violation';
  END IF;
  IF NEW.status IN ('approved','rejected') AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF auth.uid() IS NOT NULL THEN NEW.reviewed_by := auth.uid(); END IF;
    NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_cohort_proposal_guard() FROM anon, PUBLIC;
DROP TRIGGER IF EXISTS trg_cohort_proposals_guard ON public.cohort_adjustment_proposals;
CREATE TRIGGER trg_cohort_proposals_guard
  BEFORE UPDATE ON public.cohort_adjustment_proposals
  FOR EACH ROW EXECUTE FUNCTION public.fn_cohort_proposal_guard();

-- School Master: keep updated_at fresh
DROP TRIGGER IF EXISTS school_master_touch_updated_at ON public.school_master;
CREATE TRIGGER school_master_touch_updated_at
  BEFORE UPDATE ON public.school_master
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- Postal Codes: keep updated_at fresh
DROP TRIGGER IF EXISTS postal_codes_touch_updated_at ON public.postal_codes;
CREATE TRIGGER postal_codes_touch_updated_at
  BEFORE UPDATE ON public.postal_codes
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- ── events privileged-field guard (2026-07-10, tournament_incharge_privilege_guard) ──
-- Tier 1: only super admin / sports.tournaments.manage may change config->incharges.
-- Tier 2: only super admin / admin-coordinator roles / tournament managers may change
-- institution_id, event_type, created_by. service_role (auth.uid() IS NULL) bypasses.
-- Function body lives in 02_functions.sql (fn_guard_event_privileged_fields).

DROP TRIGGER IF EXISTS trg_events_guard_privileged_fields ON public.events;
CREATE TRIGGER trg_events_guard_privileged_fields
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_event_privileged_fields();

-- ── Tournament registration form event_id sync (2026-07-14,
--    event_registration_form_event_id_sync_triggers,
--    event_registration_form_sync_triggers_unconditional) ──
-- Corrects the denormalized event_id from the parent chain before RLS
-- WITH CHECK evaluation. Function bodies live in 02_functions.sql
-- (sync_event_registration_form_section_event_id / _field_event_id).
-- Fires on EVERY insert/update (not just OF form_id / OF section_id) — a bare
-- UPDATE ... SET event_id = X touching neither FK column must still be
-- corrected, otherwise it bypasses the sync entirely.

DROP TRIGGER IF EXISTS trg_sync_event_registration_form_section_event_id ON public.event_registration_form_sections;
CREATE TRIGGER trg_sync_event_registration_form_section_event_id
  BEFORE INSERT OR UPDATE ON public.event_registration_form_sections
  FOR EACH ROW EXECUTE FUNCTION public.sync_event_registration_form_section_event_id();

DROP TRIGGER IF EXISTS trg_sync_event_registration_form_field_event_id ON public.event_registration_form_fields;
CREATE TRIGGER trg_sync_event_registration_form_field_event_id
  BEFORE INSERT OR UPDATE ON public.event_registration_form_fields
  FOR EACH ROW EXECUTE FUNCTION public.sync_event_registration_form_field_event_id();

-- Bill Coverage (2026-07-25): stamp academic_year_id on every new bill.
DROP TRIGGER IF EXISTS trg_billing_bill_default_academic_year
  ON public.billing_student_bills;

CREATE TRIGGER trg_billing_bill_default_academic_year
BEFORE INSERT ON public.billing_student_bills
FOR EACH ROW
EXECUTE FUNCTION public.fn_billing_bill_default_academic_year();

-- REMOVED 2026-08-05 (mig 20260805112640_freshers_drop_seed_trigger): the
-- default "Freshers" semester + section A holding pen was retired. New programs
-- no longer get a semester_order = 0 placeholder; first-year admits go straight
-- to the program's first real term, which is now identified by initial_semester
-- on every active program (mig 20260805112546).
DROP TRIGGER IF EXISTS programs_seed_freshers ON public.programs;

-- ---------------------------------------------------------------------------
-- Billing: "Once per learner" duplicate guard
-- ---------------------------------------------------------------------------
-- Rejects a second live bill for a learner when the bill's billing category
-- has once_per_learner = true. Lives in the database because bills are written
-- from ten independent paths — student-bill-service (single + recurring),
-- onboarding-service, the bills/import route, and six SECURITY DEFINER RPCs
-- (admission_account_transition_with_bills, admission_approve_fee_change_event,
-- admission_fix_fee_mismatch_2026, campus_living_generate_hostel_year_bills,
-- _cl_apply_category_bill_change, _cl_apply_upgrade_fee_bill) plus the feesync
-- cron. A service-layer guard would be bypassed by most of them, which is
-- exactly how the 336 duplicate tuition bills were created.
--
-- Cancelled/superseded bills never count, so correcting a mistake cannot
-- permanently lock a learner out of a category. Raises SQLSTATE BL001 so
-- callers can render a friendly message (lib/utils/billing-duplicate-error.ts).
-- Function body: see supabase/migrations/20260727120000_billing_category_once_per_learner.sql
DROP TRIGGER IF EXISTS trg_billing_bills_once_per_learner ON public.billing_student_bills;

CREATE TRIGGER trg_billing_bills_once_per_learner
  BEFORE INSERT OR UPDATE ON public.billing_student_bills
  FOR EACH ROW
  EXECUTE FUNCTION public.billing_enforce_once_per_learner();


-- =====================================================================
-- hr_shift_timings — updated_at trigger
-- Added 2026-08-06. Source of truth:
--   supabase/migrations/20260806090000_create_hr_shift_timings.sql
--   supabase/migrations/20260806090100_hr_shift_timings_functions.sql
--   supabase/migrations/20260806090400_hr_shift_timings_save_week.sql
-- Plan: docs/superpowers/plans/2026-08-06-hr-shift-timings.md
--
-- Replaced the legacy hr_shift_templates / hr_shift_assignments /
-- hr_shift_swap_requests module, dropped 2026-08-06 (all three were empty).
-- Those tables were never mirrored into supabase/setup, so there is nothing
-- to remove here.
-- =====================================================================

DROP TRIGGER IF EXISTS hr_shift_timings_updated_at ON public.hr_shift_timings;
CREATE TRIGGER hr_shift_timings_updated_at
  BEFORE UPDATE ON public.hr_shift_timings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS. Mirrors the hr_attendance_status_types idiom. The (SELECT fn())
-- wrapping is load-bearing: it forces once-per-query evaluation and is the
-- fix for the 57014 statement-timeout class of bug.
--
-- Contrast with hr_shift_templates, whose write policies gate on
-- is_super_admin() OR is_admin() with NO permission key — which locks out
-- custom roles such as HR Head that hold every other HR key.
-- ---------------------------------------------------------------------

-- Billing Late Charges updated_at
-- Added: 2026-08-07 (migration 20260815010000_late_charge_mechanism.sql — FILE ONLY, apply is Director-gated)
DROP TRIGGER IF EXISTS trg_billing_late_charges_updated_at ON public.billing_late_charges;
CREATE TRIGGER trg_billing_late_charges_updated_at
    BEFORE UPDATE ON public.billing_late_charges
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
-- ============================================================================
-- Events Hub — refuse a delete that would cascade registrations/payments away
-- (2026-08-06). 46 FKs point at `events`, 43 of them ON DELETE CASCADE.
-- Body lives in 02_functions.sql.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_events_block_delete_with_dependents ON public.events;

CREATE TRIGGER trg_events_block_delete_with_dependents
  BEFORE DELETE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_events_block_delete_with_dependents();


-- Reserved-bed allocation guard — a bed held for one learner's confirmed
-- upgrade hold must never reach another learner (Director decision,
-- edge-case interview, 2026-08-07: "That situation should not occur.
-- Prevent it."). Fires on every INSERT and on any UPDATE that moves an
-- allocation's bed/room (fn_cl_admin_transfer_allocation).
-- Added: 2026-08-07 (migration 20260815040001_reserved_bed_guard.sql — FILE ONLY, apply is Director-gated)
DROP TRIGGER IF EXISTS trg_allocation_guard_reserved_bed ON public.hostel_allocations;
CREATE TRIGGER trg_allocation_guard_reserved_bed
  BEFORE INSERT OR UPDATE OF bed_id, room_id ON public.hostel_allocations
  FOR EACH ROW
  EXECUTE FUNCTION public._on_allocation_guard_reserved_bed();


-- Settle-then-bill arrival clock — a learner joining a room starts or restarts
-- that room's settle window (Director 2026-08-10: "arrivals only"). A learner
-- LEAVING never touches a clock; otherwise a departure would postpone the
-- remaining residents' bills. A learner moving from room A to room B leaves
-- A's clock alone and starts/restarts B's.
--
-- The arrival test lives in the WHEN clauses so a departure never even enters
-- the function. Active occupancy is `status='active' AND check_out_date IS
-- NULL` — the same pair v_hostel_room_occupancy and the whole settle engine
-- count on; actual_vacate_date is deliberately not consulted.
--
-- AFTER, not BEFORE: trg_allocation_guard_reserved_bed (BEFORE) can reject the
-- row, so these only ever run on allocations that survived it. Body lives in
-- 02_functions.sql.
-- Added: 2026-08-10 (migration 20260815070000_settle_window_trigger_and_scope.sql
--        — FILE ONLY, apply is Director-gated)

DROP TRIGGER IF EXISTS trg_allocation_settle_arrival_insert ON public.hostel_allocations;
CREATE TRIGGER trg_allocation_settle_arrival_insert
  AFTER INSERT ON public.hostel_allocations
  FOR EACH ROW
  WHEN (NEW.status = 'active'::allocation_status_enum
        AND NEW.check_out_date IS NULL)
  EXECUTE FUNCTION public._on_allocation_settle_arrival();

DROP TRIGGER IF EXISTS trg_allocation_settle_arrival_update ON public.hostel_allocations;
CREATE TRIGGER trg_allocation_settle_arrival_update
  AFTER UPDATE ON public.hostel_allocations
  FOR EACH ROW
  WHEN (
    -- It is an active occupancy NOW …
    NEW.status = 'active'::allocation_status_enum
    AND NEW.check_out_date IS NULL
    AND (
      -- … and it was not one before (came into active occupancy) …
      OLD.status IS DISTINCT FROM 'active'::allocation_status_enum
      OR OLD.check_out_date IS NOT NULL
      -- … or it moved into a different room while active.
      OR NEW.room_id IS DISTINCT FROM OLD.room_id
    )
  )
  EXECUTE FUNCTION public._on_allocation_settle_arrival();

-- =====================================================
-- HR ACADEMIC YEARS (2026-08-10)
-- =====================================================
DROP TRIGGER IF EXISTS hr_academic_years_updated_at ON public.hr_academic_years;
CREATE TRIGGER hr_academic_years_updated_at
    BEFORE UPDATE ON public.hr_academic_years
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Group-wide, non-overlapping years mean start_date alone identifies the year,
-- so a leave application can no longer be yearless. Named trg_hla_aa_*
-- deliberately: BEFORE triggers fire in name order and this must run before
-- trg_hla_leave_period_cap and trg_hla_sto_limits, which read the column.
DROP TRIGGER IF EXISTS trg_hla_aa_default_hr_ay ON public.hr_leave_applications;
CREATE TRIGGER trg_hla_aa_default_hr_ay
    BEFORE INSERT OR UPDATE ON public.hr_leave_applications
    FOR EACH ROW EXECUTE FUNCTION public.hr_trig_default_hr_academic_year();


-- =====================================================================
-- Added: 2026-08-06 - admission_leads source/referral audit trail
-- Mirror of migration 20260818020000_admission_lead_source_audit.sql
-- (ALREADY APPLIED TO PROD 2026-08-06 via hand-run SQL).
-- Fires only when one of the five watched source/referral columns changes,
-- calling fn_audit_admission_lead_source (setup/02_functions.sql) to record
-- who/when/old->new into admission_lead_source_audit (setup/01_tables.sql).
-- =====================================================================
DROP TRIGGER IF EXISTS trg_audit_admission_lead_source ON public.admission_leads;
CREATE TRIGGER trg_audit_admission_lead_source
AFTER UPDATE OF source, source_detail, referral_type, referred_by_id, referred_by_name
ON public.admission_leads
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_admission_lead_source();

-- ============================================================================
-- 2026-08-11 — learner lifecycle auto-promotion pipeline
-- ============================================================================
-- Supersedes the earlier entry in this file, which still read
-- `AFTER UPDATE OF bill_amount ON billing_student_bills` — a column name that
-- no longer exists. This file is append-ordered, so the definitions below win.
--
-- Rationale: supabase/migrations/20260811140000_fix_learner_status_auto_promotion.sql
--   * the evaluation must fire on ANY movement in a bill's paid position, not
--     only on a full settlement — instalments are how learners cross 30%;
--   * the receipt-side evaluation is GONE, not merely redundant. Postgres fires
--     row triggers alphabetically, and `trg_evaluate_status_after_payment`
--     sorted before `trigger_update_bill_status_on_payment` ('g' < 'i'), so it
--     ran before the bill was written and could never see its own payment;
--   * update_bill_balance_on_amount_change() mutates NEW and returns it, so it
--     MUST be BEFORE. Registered AFTER, every mutation was silently discarded.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_evaluate_status_after_bill_paid
  ON public.billing_student_bills;
CREATE TRIGGER trg_evaluate_status_after_bill_paid
  AFTER UPDATE OF status, balance_amount ON public.billing_student_bills
  FOR EACH ROW EXECUTE FUNCTION public.fn_evaluate_status_after_bill_paid();

DROP TRIGGER IF EXISTS trg_evaluate_status_after_payment
  ON public.billing_receipt_items;

DROP TRIGGER IF EXISTS trigger_update_bill_balance_on_amount_change
  ON public.billing_student_bills;
CREATE TRIGGER trigger_update_bill_balance_on_amount_change
  BEFORE UPDATE ON public.billing_student_bills
  FOR EACH ROW EXECUTE FUNCTION public.update_bill_balance_on_amount_change();


-- Referral attribution + quota audit on the LEARNER record. A referral credit
-- can be attached in two places — on the lead (audited into
-- admission_lead_source_audit) and directly on learners_profiles, which nothing
-- watched. Also covers quota_id + counseling_applied, the Direct-versus-
-- Counselling distinction that decides whether a referral is payable at all.
--
-- Note on the lead-side trail: it is live on production (hand-applied via the
-- Management API on 2026-08-06, and it has already captured a real change) but
-- is NOT yet in this repository — PR #2889 back-fills it. Grepping for
-- admission_lead_source_audit here returns nothing, and that is expected. This
-- trigger is its sibling; rebuilt from the repo alone today, neither would
-- exist until #2889 merges and both are applied.
--
-- AFTER, so the row is already final and no failure here can undo it. UPDATE OF
-- the five watched columns, so an unrelated edit never enters the function.
--
-- INSERT is deliberately not watched: a learner created with a referrer already
-- attached has changed nothing, and auditing creation would file every
-- conversion as an attribution edit and bury the real ones. DELETE is not
-- watched either — there would be no learner left to read the row back against.
--
-- 🔴 Purely additive, so it cannot interfere with
-- trg_sync_learner_referral_to_attribution on the same table, which DELETES the
-- prior attribution row when referred_by_id changes. Body lives in
-- 02_functions.sql.
-- Added: 2026-08-10 (migration
--        supabase/migrations/20260818030000_extend_referral_source_audit.sql
--        — FILE ONLY, NOT APPLIED)

DROP TRIGGER IF EXISTS trg_audit_learner_referral_attribution ON public.learners_profiles;
CREATE TRIGGER trg_audit_learner_referral_attribution
  AFTER UPDATE OF referral_type, referred_by_id, referred_by_name, quota_id, counseling_applied
  ON public.learners_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_audit_learner_referral_attribution();

-- =====================================================================
-- Updated: 2026-08-10 - JKKN permanent identity register: updated_at
-- Migration: supabase/migrations/20260817040000_jkkn_permanent_identity_schema.sql
-- FILE ONLY / NOT APPLIED to production as of 2026-08-10.
-- =====================================================================
DROP TRIGGER IF EXISTS trg_jkkn_identities_updated_at ON public.jkkn_identities;
CREATE TRIGGER trg_jkkn_identities_updated_at
  BEFORE UPDATE ON public.jkkn_identities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_jkkn_identity_aliases_updated_at ON public.jkkn_identity_aliases;
CREATE TRIGGER trg_jkkn_identity_aliases_updated_at
  BEFORE UPDATE ON public.jkkn_identity_aliases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- Added: 2026-08-27 - JKKN ID auto-issuance
-- Mirror of migration 20260827110000_jkkn_id_associate_kind_and_auto_issue.sql
-- Function bodies -> setup/02_functions.sql (tg_jkkn_auto_issue_*).
-- Fail-soft by design: an issuance failure warns, never blocks the
-- admission / hire / role grant that fired it.
-- =====================================================================
-- Widened 2026-08-27 (migration 20260827134500): a learner is issued at
-- RESERVED — seat held, onboarding begins — not only at admitted/active.
-- Enquiry-stage statuses stay excluded (numbers are never spent at enquiry).
DROP TRIGGER IF EXISTS trg_jkkn_auto_issue_learner ON public.learners_profiles;
CREATE TRIGGER trg_jkkn_auto_issue_learner
  AFTER INSERT OR UPDATE OF lifecycle_status ON public.learners_profiles
  FOR EACH ROW
  WHEN (NEW.lifecycle_status::text IN ('reserved', 'account', 'admitted', 'active', 'graduated', 'alumni'))
  EXECUTE FUNCTION public.tg_jkkn_auto_issue_learner();

DROP TRIGGER IF EXISTS trg_jkkn_auto_issue_team_member ON public.staff;
CREATE TRIGGER trg_jkkn_auto_issue_team_member
  AFTER INSERT OR UPDATE OF is_active ON public.staff
  FOR EACH ROW
  WHEN (NEW.is_active IS TRUE)
  EXECUTE FUNCTION public.tg_jkkn_auto_issue_team_member();

DROP TRIGGER IF EXISTS trg_jkkn_auto_issue_associate ON public.user_roles;
CREATE TRIGGER trg_jkkn_auto_issue_associate
  AFTER INSERT ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_jkkn_auto_issue_associate();

-- =====================================================================
-- Added: 2026-08-13 - Course Events core triggers (course_events,
-- course_packages, course_package_installments)
-- Mirror of migration 20260813100000_course_events_core.sql
-- Function bodies -> setup/02_functions.sql.
-- =====================================================================
CREATE CONSTRAINT TRIGGER trg_course_package_installments_sum
AFTER INSERT OR UPDATE OR DELETE ON public.course_package_installments
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.fn_course_package_amounts_chk();

CREATE CONSTRAINT TRIGGER trg_course_packages_total_sum
AFTER UPDATE OF total_amount ON public.course_packages
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.fn_course_package_amounts_chk();

CREATE TRIGGER trg_course_events_touch
  BEFORE UPDATE ON public.course_events
  FOR EACH ROW EXECUTE FUNCTION public.fn_courses_touch_updated_at();
CREATE TRIGGER trg_course_packages_touch
  BEFORE UPDATE ON public.course_packages
  FOR EACH ROW EXECUTE FUNCTION public.fn_courses_touch_updated_at();
CREATE TRIGGER trg_course_package_installments_touch
  BEFORE UPDATE ON public.course_package_installments
  FOR EACH ROW EXECUTE FUNCTION public.fn_courses_touch_updated_at();

-- =====================================================================
-- Added: 2026-08-13 - Course Sessions trigger
-- Mirror of migration 20260813100100_course_sessions_and_reservations.sql
-- =====================================================================
CREATE TRIGGER trg_course_sessions_touch
  BEFORE UPDATE ON public.course_sessions
  FOR EACH ROW EXECUTE FUNCTION public.fn_courses_touch_updated_at();

-- =====================================================================
-- Added: 2026-08-13 - Registration form builder triggers
-- Mirror of migration 20260813100200_course_registration_forms.sql
-- =====================================================================
CREATE TRIGGER trg_course_reg_forms_touch
  BEFORE UPDATE ON public.course_registration_forms
  FOR EACH ROW EXECUTE FUNCTION public.fn_courses_touch_updated_at();
CREATE TRIGGER trg_course_reg_sections_touch
  BEFORE UPDATE ON public.course_registration_form_sections
  FOR EACH ROW EXECUTE FUNCTION public.fn_courses_touch_updated_at();
CREATE TRIGGER trg_course_reg_fields_touch
  BEFORE UPDATE ON public.course_registration_form_fields
  FOR EACH ROW EXECUTE FUNCTION public.fn_courses_touch_updated_at();

-- =====================================================================
-- Added: 2026-08-13 - Applications and enrollments triggers
-- Mirror of migration 20260813100300_course_applications_enrollments.sql
-- =====================================================================
CREATE TRIGGER trg_course_applications_touch
  BEFORE UPDATE ON public.course_applications
  FOR EACH ROW EXECUTE FUNCTION public.fn_courses_touch_updated_at();
CREATE TRIGGER trg_course_enrollments_touch
  BEFORE UPDATE ON public.course_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.fn_courses_touch_updated_at();

-- =====================================================================
-- Added: 2026-08-13 - Billing triggers
-- Mirror of migration 20260813100400_course_billing.sql
-- =====================================================================
CREATE TRIGGER trg_course_bills_touch
  BEFORE UPDATE ON public.course_bills
  FOR EACH ROW EXECUTE FUNCTION public.fn_courses_touch_updated_at();
CREATE TRIGGER trg_course_bill_payments_touch
  BEFORE UPDATE ON public.course_bill_payments
  FOR EACH ROW EXECUTE FUNCTION public.fn_courses_touch_updated_at();

CREATE TRIGGER trg_course_bill_payments_recompute
  AFTER INSERT OR UPDATE OR DELETE ON public.course_bill_payments
  FOR EACH ROW EXECUTE FUNCTION public.fn_course_recompute_balances();


-- ============================================================================
-- Empty-bed settlement + room buyout (2026-08-13)
-- Source: supabase/migrations/2026081903*.sql
-- ============================================================================

CREATE TRIGGER trg_hostel_room_buyouts_touch
  BEFORE UPDATE ON public.hostel_room_buyouts
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

CREATE TRIGGER trg_enforce_room_buyout_lock_insert
  BEFORE INSERT ON public.hostel_allocations
  FOR EACH ROW EXECUTE FUNCTION public._enforce_room_buyout_lock();

CREATE TRIGGER trg_enforce_room_buyout_lock_update
  BEFORE UPDATE OF room_id, check_out_date ON public.hostel_allocations
  FOR EACH ROW
  WHEN (NEW.room_id IS DISTINCT FROM OLD.room_id OR OLD.check_out_date IS NOT NULL)
  EXECUTE FUNCTION public._enforce_room_buyout_lock();

-- Learner gender -> profiles.gender (20260820140000). A: profile gains a learner
-- link, pull the gender. B: learner's gender is edited, push it to the profile.
CREATE TRIGGER trg_sync_profile_gender_from_learner
  AFTER INSERT OR UPDATE OF learner_id ON public.profiles
  FOR EACH ROW
  WHEN (NEW.learner_id IS NOT NULL AND NEW.gender IS NULL)
  EXECUTE FUNCTION public.sync_profile_gender_from_learner();

CREATE TRIGGER trg_sync_learner_gender_to_profile
  AFTER INSERT OR UPDATE OF gender ON public.learners_profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_learner_gender_to_profile();

-- Gender canonicalisation (20260820160000). BEFORE triggers so the CHECK
-- constraints below them are backstops that should never actually fire.
CREATE TRIGGER trg_normalize_gender_learners_profiles
  BEFORE INSERT OR UPDATE OF gender ON public.learners_profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_normalize_learner_gender();

CREATE TRIGGER trg_normalize_gender_profiles
  BEFORE INSERT OR UPDATE OF gender ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_normalize_profile_gender();

-- ---------------------------------------------------------------------------
-- admission_fee_structures: hostel room/mess tier integrity guard
-- (migration 20260910110000)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_fee_structure_hostel_categories_guard
  ON public.admission_fee_structures;

CREATE TRIGGER trg_fee_structure_hostel_categories_guard
  BEFORE INSERT OR UPDATE ON public.admission_fee_structures
  FOR EACH ROW
  EXECUTE FUNCTION public._fee_structure_hostel_categories_guard();

-- ---------------------------------------------------------------------------
-- staff: canonical UPPERCASE names (migration 20260910120000)
-- ---------------------------------------------------------------------------
-- TRIGGER ORDER IS LOAD-BEARING — DO NOT RENAME.
-- Postgres fires row triggers in ALPHABETICAL NAME ORDER. staff already has a
-- BEFORE INSERT OR UPDATE trigger trg_sync_staff_to_profiles which sets
-- profiles.full_name = CONCAT(NEW.first_name,' ',NEW.last_name).
-- trg_normalize_staff_names sorts BEFORE it ('n' < 's'), so profiles receive
-- the already-normalised value and the two tables cannot drift. Renaming this
-- to e.g. trg_upper_staff_names would sort it AFTER ('u' > 's') and silently
-- leave every profiles.full_name in mixed case.
DROP TRIGGER IF EXISTS trg_normalize_staff_names ON public.staff;

CREATE TRIGGER trg_normalize_staff_names
  BEFORE INSERT OR UPDATE OF first_name, last_name ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_normalize_staff_names();

-- Migration: supabase/migrations/20260821120000_induction_live_gate_writes.sql
-- Refuse attendance/feedback writes unless the parent induction is Live.
DROP TRIGGER IF EXISTS trg_a_induction_require_live ON public.event_session_attendance;
CREATE TRIGGER trg_a_induction_require_live
  BEFORE INSERT OR UPDATE ON public.event_session_attendance
  FOR EACH ROW EXECUTE FUNCTION public.trg_induction_require_live_by_session();
DROP TRIGGER IF EXISTS trg_a_induction_require_live ON public.event_session_feedback;
CREATE TRIGGER trg_a_induction_require_live
  BEFORE INSERT OR UPDATE ON public.event_session_feedback
  FOR EACH ROW EXECUTE FUNCTION public.trg_induction_require_live_by_event();
DROP TRIGGER IF EXISTS trg_a_induction_require_live ON public.event_day_feedback;
CREATE TRIGGER trg_a_induction_require_live
  BEFORE INSERT OR UPDATE ON public.event_day_feedback
  FOR EACH ROW EXECUTE FUNCTION public.trg_induction_require_live_by_event();
DROP TRIGGER IF EXISTS trg_a_induction_require_live ON public.event_program_feedback;
CREATE TRIGGER trg_a_induction_require_live
  BEFORE INSERT OR UPDATE ON public.event_program_feedback
  FOR EACH ROW EXECUTE FUNCTION public.trg_induction_require_live_by_event();

-- ===========================================================================
-- trg_hla_leave_overlap — see 20260821170000_leave_overlap_guard.sql
-- ===========================================================================
-- HR Leave — one leave request per day.
--
-- Short time off got an overlap guard on 2026-08-21; day leave never had one.
-- Nothing stopped two live requests covering the same dates, and 3 such pairs
-- existed across 3 staff when this was written. Both draw down the balance on
-- approval, so the same day is paid for twice.
--
-- FIRES ON INSERT AND ON THE DATE/TYPE COLUMNS ONLY — deliberately NOT on
-- status. The pre-existing overlaps must still be approvable and rejectable; a
-- trigger that also fired on a status change would look at the sibling row,
-- find the overlap and refuse the decision, leaving them permanently stuck.
-- This guard is about CREATING an overlap, not about deciding one that exists.
--
-- Leave vs leave only. A permission on a day already covered by full-day leave
-- is also contradictory, but that is a different comparison (minutes against a
-- day) and is left alone rather than guessed at here.

CREATE OR REPLACE FUNCTION public.hr_trig_leave_enforce_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_category text;
  v_clash    record;
BEGIN
  IF NEW.status NOT IN ('pending','approved','escalated') THEN
    RETURN NEW;
  END IF;

  SELECT request_category INTO v_category
  FROM public.hr_leave_types WHERE id = NEW.leave_type_id;

  IF v_category IS DISTINCT FROM 'leave' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.employee_id::text || ':leave-overlap', 0)
  );

  SELECT t2.leave_type_name AS type_name, a.start_date, a.end_date, a.status
    INTO v_clash
  FROM public.hr_leave_applications a
  JOIN public.hr_leave_types t2 ON t2.id = a.leave_type_id
  WHERE a.employee_id = NEW.employee_id
    AND a.id IS DISTINCT FROM NEW.id
    AND a.status IN ('pending','approved','escalated')
    AND t2.request_category = 'leave'
    AND a.start_date <= NEW.end_date
    AND NEW.start_date <= a.end_date
  ORDER BY a.start_date
  LIMIT 1;

  IF v_clash.type_name IS NOT NULL THEN
    RAISE EXCEPTION
      'This overlaps an existing % request from % to % (%). Cancel that one first, or pick different dates.',
      v_clash.type_name,
      to_char(v_clash.start_date, 'DD/MM/YYYY'),
      to_char(v_clash.end_date, 'DD/MM/YYYY'),
      v_clash.status
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_hla_leave_overlap ON public.hr_leave_applications;
CREATE TRIGGER trg_hla_leave_overlap
  BEFORE INSERT OR UPDATE OF start_date, end_date, leave_type_id
  ON public.hr_leave_applications
  FOR EACH ROW EXECUTE FUNCTION public.hr_trig_leave_enforce_no_overlap();

COMMENT ON FUNCTION public.hr_trig_leave_enforce_no_overlap() IS
  'Refuses a day-leave request whose dates overlap another live request for the same employee. Not fired on status changes, so pre-existing overlaps stay decidable.';

-- ===========================================================================
-- attendance period lock enforcement (2026-08-22)
-- Source: 20260822040000_hr_attendance_period_lock_enforcement.sql
-- ===========================================================================
-- MAKE THE LOCK REAL.
--
-- hr_payroll_periods has had a `locked` status since 2026-06-28 and it stops
-- nothing: exactly five functions in this database mention that table and all
-- five are its own state machine. A lock that no other code reads is a label,
-- not a control. These two triggers are what make this one different.
--
-- NO SUPER-ADMIN BYPASS, deliberately. A super admin can REOPEN the month --
-- which is recorded, reasoned, and throws the stale summaries away. Letting the
-- same person also write straight through a closed month would give them a
-- silent path that leaves the frozen counts disagreeing with the records they
-- were computed from.

CREATE OR REPLACE FUNCTION public.hr_trig_block_writes_in_locked_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row    record;
  v_locked record;
BEGIN
  v_row := COALESCE(NEW, OLD);

  SELECT ap.period_year, ap.period_month, ap.locked_at
    INTO v_locked
    FROM public.hr_attendance_periods ap
   WHERE ap.institution_id = v_row.institution_id
     AND ap.status = 'locked'
     AND make_date(ap.period_year, ap.period_month, 1) <= v_row.work_date
     AND (make_date(ap.period_year, ap.period_month, 1) + interval '1 month')::date > v_row.work_date
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'Attendance for %-% is closed (locked %). Reopen the month before changing attendance for %.',
      v_locked.period_year, lpad(v_locked.period_month::text, 2, '0'),
      to_char(v_locked.locked_at, 'DD Mon YYYY'), v_row.work_date
      USING ERRCODE = 'P0001';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_har_block_locked_period ON public.hr_attendance_records;
CREATE TRIGGER trg_har_block_locked_period
  BEFORE INSERT OR UPDATE OR DELETE ON public.hr_attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.hr_trig_block_writes_in_locked_period();


-- Leave / short time off / compensatory off cannot be raised, decided or
-- withdrawn once the month they fall in is closed.
--
-- ANY OVERLAP BLOCKS, not just the start date: an application spanning a closed
-- month and an open one would otherwise change day counts inside the closed
-- half.
--
-- The force-close path rejects outstanding requests BEFORE it sets the status
-- to locked, so those rejections happen while the month is still open and do
-- not trip this.
CREATE OR REPLACE FUNCTION public.hr_trig_block_leave_in_locked_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row      record;
  v_inst     uuid;
  v_locked   record;
BEGIN
  v_row := COALESCE(NEW, OLD);

  SELECT s.institution_id INTO v_inst
    FROM public.staff s WHERE s.id = v_row.employee_id;

  IF v_inst IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT ap.period_year, ap.period_month, ap.locked_at
    INTO v_locked
    FROM public.hr_attendance_periods ap
   WHERE ap.institution_id = v_inst
     AND ap.status = 'locked'
     AND make_date(ap.period_year, ap.period_month, 1) <= v_row.end_date
     AND (make_date(ap.period_year, ap.period_month, 1) + interval '1 month')::date > v_row.start_date
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'Attendance for %-% is closed (locked %). Requests covering that month can no longer be raised or decided.',
      v_locked.period_year, lpad(v_locked.period_month::text, 2, '0'),
      to_char(v_locked.locked_at, 'DD Mon YYYY')
      USING ERRCODE = 'P0001';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_hla_block_locked_period ON public.hr_leave_applications;
-- Named with a leading 'a' relative to the other guards is NOT required here --
-- this one RAISES rather than mutating NEW, so alphabetical firing order among
-- the ten triggers on this table does not change the outcome.
CREATE TRIGGER trg_hla_block_locked_period
  BEFORE INSERT OR UPDATE OR DELETE ON public.hr_leave_applications
  FOR EACH ROW EXECUTE FUNCTION public.hr_trig_block_leave_in_locked_period();

COMMENT ON FUNCTION public.hr_trig_block_writes_in_locked_period() IS
  'Refuses any write to hr_attendance_records inside a locked attendance month. This is what makes the lock a control rather than a label.';
COMMENT ON FUNCTION public.hr_trig_block_leave_in_locked_period() IS
  'Refuses leave / STO / comp-off writes overlapping a locked attendance month. Any overlap blocks, so a cross-month application cannot alter the closed half.';


-- ===========================================================================
-- Source: 20260821180000_fee_structure_item_schedules.sql
-- ===========================================================================
DROP TRIGGER IF EXISTS trg_afsis_touch ON public.admission_fee_structure_item_schedules;

CREATE TRIGGER trg_afsis_touch
  BEFORE UPDATE ON public.admission_fee_structure_item_schedules
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

DROP TRIGGER IF EXISTS trg_afsis_validate_status
  ON public.admission_fee_structure_item_schedules;

CREATE TRIGGER trg_afsis_validate_status
  BEFORE INSERT OR UPDATE OF promotes_to_status_code
  ON public.admission_fee_structure_item_schedules
  FOR EACH ROW EXECUTE FUNCTION public.afsis_validate_status_target();

DROP TRIGGER IF EXISTS trg_afsis_validate_shape
  ON public.admission_fee_structure_item_schedules;

CREATE CONSTRAINT TRIGGER trg_afsis_validate_shape
  AFTER INSERT OR UPDATE OR DELETE
  ON public.admission_fee_structure_item_schedules
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.afsis_validate_schedule_shape();

-- ===========================================================================
-- Source: 20260821190000_fee_schedule_generation_engine.sql
-- ===========================================================================
-- Reuse phase 1's validator: it reads only NEW.promotes_to_status_code, so it
-- is table-agnostic and needs no edit.
DROP TRIGGER IF EXISTS trg_afsi_validate_status ON public.admission_fee_structure_items;

CREATE TRIGGER trg_afsi_validate_status
  BEFORE INSERT OR UPDATE OF promotes_to_status_code
  ON public.admission_fee_structure_items
  FOR EACH ROW EXECUTE FUNCTION public.afsis_validate_status_target();

-- ===========================================================================
-- Source: 20260822090000_billing_bill_instalments.sql
-- ===========================================================================
DROP TRIGGER IF EXISTS trg_bbi_validate_status ON public.billing_bill_instalments;

CREATE TRIGGER trg_bbi_validate_status
  BEFORE INSERT OR UPDATE OF promotes_to_status_code
  ON public.billing_bill_instalments
  FOR EACH ROW EXECUTE FUNCTION public.afsis_validate_status_target();

DROP TRIGGER IF EXISTS trg_bbi_validate_sum ON public.billing_bill_instalments;

CREATE CONSTRAINT TRIGGER trg_bbi_validate_sum
  AFTER INSERT OR UPDATE OR DELETE
  ON public.billing_bill_instalments
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.bbi_validate_sum_equals_bill();

DROP TRIGGER IF EXISTS trg_bbi_rescale_on_amount_change ON public.billing_student_bills;

CREATE TRIGGER trg_bbi_rescale_on_amount_change
  AFTER UPDATE OF final_amount ON public.billing_student_bills
  FOR EACH ROW EXECUTE FUNCTION public.bbi_rescale_on_bill_amount_change();

-- ===========================================================================
-- Source: 20260822100000_single_bill_generation_and_due_date_sync.sql
-- ===========================================================================
DROP TRIGGER IF EXISTS trg_bbi_sync_due_date ON public.billing_bill_instalments;

CREATE TRIGGER trg_bbi_sync_due_date
  AFTER INSERT OR UPDATE OF amount, due_date, sequence_no OR DELETE
  ON public.billing_bill_instalments
  FOR EACH ROW EXECUTE FUNCTION public.bbi_sync_due_date_from_instalment();

-- Named to sort AFTER trg_evaluate_status_after_bill_paid, so the promotion
-- engine still sees the bill exactly as the payment left it. Postgres fires row
-- triggers in alphabetical order by name, and 'trg_z' is deliberate.
DROP TRIGGER IF EXISTS trg_z_bbi_sync_due_date_after_payment ON public.billing_student_bills;

CREATE TRIGGER trg_z_bbi_sync_due_date_after_payment
  AFTER UPDATE OF balance_amount ON public.billing_student_bills
  FOR EACH ROW EXECUTE FUNCTION public.bbi_sync_due_date_after_payment();


-- ── Receipt cancellation activity feed (20260825170000) ───────────────────
DROP TRIGGER IF EXISTS trg_log_receipt_cancel_activity
  ON public.billing_receipt_cancel_request_actions;

CREATE TRIGGER trg_log_receipt_cancel_activity
  AFTER INSERT ON public.billing_receipt_cancel_request_actions
  FOR EACH ROW EXECUTE FUNCTION public._fn_log_receipt_cancel_activity();


-- ── Learner status reversal on payment drop (20260825180000) ──────────────
-- Keyed on the paid amount DROPPING rather than on a workflow, so receipt
-- cancellation, a direct void, a refund and a manual bill edit are all covered.
DROP TRIGGER IF EXISTS trg_learner_status_on_bill_payment_drop
  ON public.billing_student_bills;

-- AFTER, so the reverted balance is already visible to the re-evaluation.
CREATE TRIGGER trg_learner_status_on_bill_payment_drop
  AFTER UPDATE OF balance_amount, final_amount, status ON public.billing_student_bills
  FOR EACH ROW
  EXECUTE FUNCTION public._fn_learner_status_on_bill_payment_drop();

-- =============================================================================
-- Mirrored from supabase/migrations/20260827190000_hr_regularization_stamp_trigger.sql
-- (trigger half; the function is mirrored in 02_functions.sql)
-- =============================================================================

DROP TRIGGER IF EXISTS tr_stamp_attendance_on_regularization_approval
  ON public.hr_attendance_regularizations;
CREATE TRIGGER tr_stamp_attendance_on_regularization_approval
  AFTER UPDATE OF status ON public.hr_attendance_regularizations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_stamp_attendance_on_regularization_approval();

COMMENT ON FUNCTION public.fn_stamp_attendance_on_regularization_approval() IS
  'Writes hr_attendance_records when a regularization is approved. Replaces the client-side best-effort stamp in regularization-service.ts, which silently skipped whenever the approver lacked hr_staff_details, the month was closed, or the browser held a stale bundle.';

-- =============================================================================
-- Mirrored from supabase/migrations/20260827200000_hr_comp_off_claims_respect_locked_month.sql
-- (trigger half; the functions are mirrored in 02_functions.sql)
-- =============================================================================

DROP TRIGGER IF EXISTS trg_hcoc_block_locked_period ON public.hr_comp_off_credits;
CREATE TRIGGER trg_hcoc_block_locked_period
  BEFORE INSERT OR UPDATE OR DELETE ON public.hr_comp_off_credits
  FOR EACH ROW EXECUTE FUNCTION public.hr_trig_block_comp_off_claim_in_locked_period();

-- =============================================================================
-- Mirrored from supabase/migrations/20260827220000_hr_population_respects_included_in_hr.sql (triggers)
-- =============================================================================

DROP TRIGGER IF EXISTS trg_hla_block_non_hr_staff ON public.hr_leave_applications;
CREATE TRIGGER trg_hla_block_non_hr_staff
  BEFORE INSERT ON public.hr_leave_applications
  FOR EACH ROW EXECUTE FUNCTION public.hr_trig_block_non_hr_staff_request('leave or short time off');

DROP TRIGGER IF EXISTS trg_hcoc_block_non_hr_staff ON public.hr_comp_off_credits;
CREATE TRIGGER trg_hcoc_block_non_hr_staff
  BEFORE INSERT ON public.hr_comp_off_credits
  FOR EACH ROW EXECUTE FUNCTION public.hr_trig_block_non_hr_staff_request('compensatory off');

-- =============================================================================
-- Mirrored from supabase/migrations/20260828120000_staff_id_standardisation_primitives.sql (triggers)
-- =============================================================================

-- Generates the staff ID on creation and freezes it forever after. Any bulk
-- rewrite of staff.staff_id must DISABLE this trigger first, or the permanence
-- guard rejects it with P0001.
DROP TRIGGER IF EXISTS trg_staff_autonumber ON public.staff;
CREATE TRIGGER trg_staff_autonumber
  BEFORE INSERT OR UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.fn_staff_autonumber();

-- =============================================================================
-- Mirrored from supabase/migrations/20260828150100_staff_role_key_guard_trigger.sql
-- =============================================================================

-- Only super admins may set or change a staff member's role. This is the
-- control; the filtered dropdown in the staff form is only a courtesy.
DROP TRIGGER IF EXISTS trg_staff_guard_role_key ON public.staff;
CREATE TRIGGER trg_staff_guard_role_key
  BEFORE INSERT OR UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.fn_staff_guard_role_key();

-- =============================================================================
-- Mirrored from supabase/migrations/20260828160000_staff_require_institution_email_for_login.sql
-- =============================================================================

-- INSERT-only on purpose: firing on UPDATE too would lock the staff who already
-- have this gap out of every edit, including the edit that fills the email in.
-- Fires before trg_sync_staff_to_profiles (BEFORE row triggers run in
-- alphabetical name order, and 'trg_staff_...' sorts before 'trg_sync_...').
DROP TRIGGER IF EXISTS trg_staff_require_institution_email ON public.staff;
CREATE TRIGGER trg_staff_require_institution_email
  BEFORE INSERT ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.fn_staff_require_institution_email();

-- =============================================================================
-- Mirrored from supabase/migrations/20260830150000_hr_salary_register.sql
-- =============================================================================

-- Reuses the generic fn_touch_updated_at rather than adding an 87th
-- table-specific copy of `NEW.updated_at := now()`.
DROP TRIGGER IF EXISTS trg_hr_salary_register_runs_touch ON public.hr_salary_register_runs;
CREATE TRIGGER trg_hr_salary_register_runs_touch
  BEFORE UPDATE ON public.hr_salary_register_runs
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

DROP TRIGGER IF EXISTS trg_hr_salary_register_lines_touch ON public.hr_salary_register_lines;
CREATE TRIGGER trg_hr_salary_register_lines_touch
  BEFORE UPDATE ON public.hr_salary_register_lines
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

-- ============================================================================
-- 2026-08-31 — guard: a decision may only be recorded by the approver making it
-- Migration: 20260831120000_hr_leave_approval_flow_parallel_ladder.sql
-- hla_update's USING clause admits the APPLICANT and its WITH CHECK only bites
-- when status becomes approved/rejected. Until quorum='all' existed every
-- decision flipped status, so that window was closed by accident.
-- ============================================================================
DROP TRIGGER IF EXISTS trg_hla_guard_chain_decisions ON public.hr_leave_applications;
CREATE TRIGGER trg_hla_guard_chain_decisions
  BEFORE UPDATE ON public.hr_leave_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.hr_trig_leave_guard_chain_decisions();

-- ============================================================================
-- Bills may only reach status='cancelled' through fn_cancel_student_bill
-- (mig 20260901010000). Without this the mandatory reason + documents are
-- advisory: the UPDATE policy on billing_student_bills lets any
-- billing.schedule.update holder -- and anyone is_admin() accepts, with no
-- permission key at all -- set the status directly from a browser console.
-- Only transitions INTO cancelled are guarded, so editing an already-cancelled
-- bill is untouched and 'superseded' keeps its own flow.
-- ============================================================================
DROP TRIGGER IF EXISTS trg_billing_bills_guard_cancel ON public.billing_student_bills;
CREATE TRIGGER trg_billing_bills_guard_cancel
  BEFORE UPDATE ON public.billing_student_bills
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_bill_cancellation();

-- ===========================================================================
-- hr_tds_slabs (2026-09-02)
-- DEFERRABLE INITIALLY DEFERRED: a multi-band edit is judged once at COMMIT,
-- not at every intermediate state -- reordering bands would be impossible
-- otherwise. Constraint triggers must be FOR EACH ROW; the function reads the
-- whole set regardless.
-- ===========================================================================
-- The set-level validator that used to live here was dropped on 2026-09-02
-- (20260902120000): its rules could not be satisfied by any single row, so
-- adding one band was impossible. Overlap is still refused by the EXCLUDE
-- constraint on the table; coverage is now a warning on the TDS Bands screen.


DROP TRIGGER IF EXISTS trg_hr_tds_slabs_updated_at ON public.hr_tds_slabs;
CREATE TRIGGER trg_hr_tds_slabs_updated_at
  BEFORE UPDATE ON public.hr_tds_slabs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===========================================================================
-- calendar_entries -> attendance (2026-09-02)
-- No WHEN clause: it would reference OLD, which Postgres refuses on a trigger
-- that also fires for INSERT. The kind='holiday' check is the first thing the
-- function does instead.
-- ===========================================================================
DROP TRIGGER IF EXISTS tr_recompute_attendance_on_calendar_holiday ON public.calendar_entries;
CREATE TRIGGER tr_recompute_attendance_on_calendar_holiday
  AFTER INSERT OR UPDATE OR DELETE ON public.calendar_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_recompute_attendance_on_calendar_holiday();

-- ===========================================================================
-- hr_leave_applications balance guard (2026-09-02)
-- Sits alongside trg_hla_leave_period_cap: the cap limits days per PERIOD, this
-- limits days against the ENTITLEMENT, and pending requests count toward both.
-- ===========================================================================
DROP TRIGGER IF EXISTS trg_hla_balance_guard ON public.hr_leave_applications;
CREATE TRIGGER trg_hla_balance_guard
  BEFORE INSERT OR UPDATE OF start_date, end_date, duration_type, leave_type_id, status
  ON public.hr_leave_applications
  FOR EACH ROW EXECUTE FUNCTION public.hr_trig_leave_enforce_balance();

-- =====================================================================
-- hr_work_patterns, hr_staff_work_pattern_assignments,
-- hr_work_pattern_leave_entitlements (2026-09-04)
-- Source: 20260904120000_hr_work_patterns.sql
-- =====================================================================

-- updated_at, same helper every HR table uses.
DROP TRIGGER IF EXISTS hr_work_patterns_updated_at ON public.hr_work_patterns;
CREATE TRIGGER hr_work_patterns_updated_at
  BEFORE UPDATE ON public.hr_work_patterns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS hr_swpa_updated_at ON public.hr_staff_work_pattern_assignments;
CREATE TRIGGER hr_swpa_updated_at
  BEFORE UPDATE ON public.hr_staff_work_pattern_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS hr_wple_updated_at ON public.hr_work_pattern_leave_entitlements;
CREATE TRIGGER hr_wple_updated_at
  BEFORE UPDATE ON public.hr_work_pattern_leave_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- The assignment's institution is the pattern's, and it must be the staff
-- member's too. A wrong institution_id here would grant cross-institution
-- visibility through role_has_institution_access, which is the only scope
-- predicate in the table's RLS.
DROP TRIGGER IF EXISTS t10_wpa_stamp_institution ON public.hr_staff_work_pattern_assignments;
CREATE TRIGGER t10_wpa_stamp_institution
  BEFORE INSERT OR UPDATE OF staff_id, work_pattern_id, institution_id
  ON public.hr_staff_work_pattern_assignments
  FOR EACH ROW EXECUTE FUNCTION public.trg_wpa_stamp_institution();

-- A pattern's leave figures must name leave types of the pattern's own
-- institution (hr_organizations map 1:1 to institutions), and only day-based
-- ones.
DROP TRIGGER IF EXISTS t10_wple_same_institution ON public.hr_work_pattern_leave_entitlements;
CREATE TRIGGER t10_wple_same_institution
  BEFORE INSERT OR UPDATE OF work_pattern_id, leave_type_id
  ON public.hr_work_pattern_leave_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.trg_wple_same_institution();

-- Retiring a pattern that people still hold would leave them resolving to
-- nothing (the pattern is exclusive). End their assignments first.
DROP TRIGGER IF EXISTS t10_wp_guard_deactivate ON public.hr_work_patterns;
CREATE TRIGGER t10_wp_guard_deactivate
  BEFORE UPDATE OF is_active ON public.hr_work_patterns
  FOR EACH ROW EXECUTE FUNCTION public.trg_wp_guard_deactivate();

-- ============================================================================
-- hr_work_pattern_weeks (2026-09-04, 20260904190000_hr_work_patterns_days_only.sql)
-- ============================================================================

DROP TRIGGER IF EXISTS hr_wpw_updated_at ON public.hr_work_pattern_weeks;
CREATE TRIGGER hr_wpw_updated_at
  BEFORE UPDATE ON public.hr_work_pattern_weeks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Mirrored from supabase/migrations/20260905160000_hr_one_request_per_day.sql
-- One live request per staff member per calendar day, across leave, short time
-- off and comp-off claims. Bodies live in 02_functions.sql.

-- duration_type joins the column list: a first_half -> full edit changes which
-- days the row occupies and used to skip the check entirely.
DROP TRIGGER IF EXISTS trg_hla_leave_overlap ON public.hr_leave_applications;
CREATE TRIGGER trg_hla_leave_overlap
  BEFORE INSERT OR UPDATE OF start_date, end_date, leave_type_id, duration_type
  ON public.hr_leave_applications
  FOR EACH ROW EXECUTE FUNCTION public.hr_trig_leave_enforce_no_overlap();


DROP TRIGGER IF EXISTS trg_hcoc_day_occupancy ON public.hr_comp_off_credits;
CREATE TRIGGER trg_hcoc_day_occupancy
  BEFORE INSERT OR UPDATE OF worked_date, status
  ON public.hr_comp_off_credits
  FOR EACH ROW EXECUTE FUNCTION public.hr_trig_comp_off_day_occupancy();

-- Mirrored from supabase/migrations/20260905180000_hr_leave_final_step_approves.sql
-- Only the FINAL step of a chain may move a request to approved.

DROP TRIGGER IF EXISTS trg_hla_final_step_approves ON public.hr_leave_applications;
CREATE TRIGGER trg_hla_final_step_approves
  BEFORE UPDATE ON public.hr_leave_applications
  FOR EACH ROW EXECUTE FUNCTION public.hr_trig_leave_final_step_approves();

-- ---------------------------------------------------------------------------
-- aiu_prompt_trails: capture-column immutability + write-once finalization
-- (migration 20260922041500_aiu_prompt_trails.sql — FILE ONLY / NOT APPLIED)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_aiu_prompt_trails_guard ON public.aiu_prompt_trails;

CREATE TRIGGER trg_aiu_prompt_trails_guard
  BEFORE UPDATE ON public.aiu_prompt_trails
  FOR EACH ROW EXECUTE FUNCTION public.tg_aiu_prompt_trails_guard();
