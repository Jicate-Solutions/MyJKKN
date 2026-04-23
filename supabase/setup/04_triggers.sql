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

        -- Check if there's an approved/active/graduated learner with matching college_email
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
        AND lifecycle_status IN ('approved', 'active', 'graduated')
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
-- rejects cross-institution / cross-program FK attachment.
-- =====================================================
DROP TRIGGER IF EXISTS trg_validate_learner_admission_year_scope
  ON public.learners_profiles;

CREATE TRIGGER trg_validate_learner_admission_year_scope
  BEFORE INSERT OR UPDATE OF admission_year_id, institution_id, program_id
  ON public.learners_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_learner_admission_year_scope();
