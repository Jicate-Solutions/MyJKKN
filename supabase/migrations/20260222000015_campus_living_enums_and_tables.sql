-- =============================================================================
-- Campus Living Module - Part 1: ENUM Types + All 34 Tables
-- Applied to: STAGING (hhprjbgknupaplivtoib) ONLY
-- Created: 2026-02-22
-- Description: Complete schema for hostel management, mess management,
--              safety & security, visitor management, and analytics
-- =============================================================================

-- ============================================================
-- ENUM TYPES (60+ custom types for Campus Living)
-- ============================================================

-- Hostel core enums
CREATE TYPE hostel_type_enum AS ENUM ('boys', 'girls', 'mixed');
CREATE TYPE block_status_enum AS ENUM ('active', 'under_maintenance', 'closed');
CREATE TYPE room_type_enum AS ENUM ('single', 'double', 'triple', 'quad', 'dormitory');
CREATE TYPE ac_status_enum AS ENUM ('ac', 'non_ac', 'cooler');
CREATE TYPE room_status_enum AS ENUM ('available', 'partially_occupied', 'full', 'maintenance', 'reserved', 'closed');
CREATE TYPE bed_status_enum AS ENUM ('available', 'occupied', 'reserved', 'maintenance');
CREATE TYPE bed_type_enum AS ENUM ('single', 'bunk_upper', 'bunk_lower');

-- Allocation enums
CREATE TYPE allocation_type_enum AS ENUM ('fresh', 'renewal', 'transfer', 'temporary');
CREATE TYPE allocation_status_enum AS ENUM ('active', 'vacated', 'transferred', 'suspended');
CREATE TYPE vacate_reason_enum AS ENUM ('graduation', 'withdrawal', 'transfer', 'disciplinary', 'voluntary', 'semester_end');

-- Warden enums
CREATE TYPE warden_designation_enum AS ENUM ('chief_warden', 'warden', 'deputy_warden', 'floor_supervisor', 'night_watcher');
CREATE TYPE warden_shift_enum AS ENUM ('day', 'night', 'full_time');

-- Food & attendance enums
CREATE TYPE food_preference_enum AS ENUM ('vegetarian', 'non_vegetarian', 'vegan', 'jain', 'eggetarian');
CREATE TYPE hostel_attendance_status_enum AS ENUM ('present', 'absent', 'on_leave', 'late_entry', 'medical');
CREATE TYPE marking_method_enum AS ENUM ('manual', 'biometric', 'qr_scan', 'rfid');

-- Leave enums
CREATE TYPE hostel_leave_type_enum AS ENUM ('home_visit', 'weekend', 'vacation', 'emergency', 'medical', 'academic', 'night_out');
CREATE TYPE parent_consent_status_enum AS ENUM ('pending', 'approved', 'rejected', 'not_required');
CREATE TYPE parent_consent_method_enum AS ENUM ('otp', 'app_approval', 'sms_reply', 'in_person');
CREATE TYPE leave_status_enum AS ENUM ('draft', 'pending_parent', 'pending_warden', 'pending_chief', 'approved', 'rejected', 'cancelled', 'expired');

-- Gate pass enums
CREATE TYPE gate_pass_type_enum AS ENUM ('regular_out', 'overnight', 'emergency', 'visitor_accompanied');
CREATE TYPE gate_pass_status_enum AS ENUM ('issued', 'active', 'returned', 'overdue', 'cancelled');

-- Fee & deposit enums
CREATE TYPE fee_status_enum AS ENUM ('pending', 'partial', 'paid', 'waived');
CREATE TYPE deposit_type_enum AS ENUM ('hostel_caution', 'mess_caution', 'key_deposit', 'electricity_deposit');
CREATE TYPE deposit_status_enum AS ENUM ('pending', 'paid', 'refund_processing', 'refunded', 'forfeited');
CREATE TYPE electricity_charges_enum AS ENUM ('included', 'metered', 'fixed_monthly');

-- Mess enums
CREATE TYPE meal_type_enum AS ENUM ('breakfast', 'lunch', 'snacks', 'dinner');
CREATE TYPE billing_model_enum AS ENUM ('fixed_monthly', 'per_meal', 'bdmr', 'semester_advance');
CREATE TYPE caterer_status_enum AS ENUM ('active', 'contract_ended', 'suspended', 'blacklisted');
CREATE TYPE menu_status_enum AS ENUM ('planned', 'confirmed', 'served', 'cancelled');
CREATE TYPE scan_method_enum AS ENUM ('qr_code', 'manual', 'rfid', 'biometric');
CREATE TYPE mess_billing_status_enum AS ENUM ('open', 'closed', 'billed', 'paid');
CREATE TYPE payment_status_enum AS ENUM ('pending', 'paid', 'partial', 'overdue');
CREATE TYPE booking_status_enum AS ENUM ('booked', 'cancelled', 'consumed', 'no_show');
CREATE TYPE waste_category_enum AS ENUM ('overproduction', 'plate_waste', 'spoilage', 'other');

-- Visitor enums
CREATE TYPE visitor_status_enum AS ENUM ('checked_in', 'checked_out', 'rejected', 'cancelled');
CREATE TYPE visitor_gender_enum AS ENUM ('male', 'female', 'other');
CREATE TYPE visitor_relationship_enum AS ENUM ('parent', 'guardian', 'sibling', 'relative', 'friend', 'other');
CREATE TYPE id_proof_type_enum AS ENUM ('aadhaar', 'driving_license', 'voter_id', 'passport', 'college_id');
CREATE TYPE meeting_location_enum AS ENUM ('gate', 'common_area', 'room', 'guest_room');

-- Maintenance enums
CREATE TYPE maintenance_category_enum AS ENUM ('electrical', 'plumbing', 'civil', 'pest_control', 'cleaning', 'internet', 'water_supply', 'furniture', 'safety', 'other');
CREATE TYPE maintenance_status_enum AS ENUM ('open', 'assigned', 'in_progress', 'pending_verification', 'resolved', 'closed', 'reopened');
CREATE TYPE maintenance_priority_enum AS ENUM ('critical', 'high', 'medium', 'low');
CREATE TYPE sla_status_enum AS ENUM ('on_track', 'at_risk', 'breached');

-- Incident enums
CREATE TYPE incident_type_enum AS ENUM ('ragging', 'theft', 'harassment', 'medical_emergency', 'fire', 'natural_disaster', 'substance_abuse', 'property_damage', 'unauthorized_entry', 'fight', 'other');
CREATE TYPE incident_severity_enum AS ENUM ('minor', 'moderate', 'major', 'critical');
CREATE TYPE incident_status_enum AS ENUM ('reported', 'under_investigation', 'action_taken', 'closed', 'reopened');
CREATE TYPE disciplinary_action_enum AS ENUM ('warning', 'fine', 'suspension', 'rustication', 'fir_filed', 'counseling');

-- Inspection enums
CREATE TYPE inspection_type_enum AS ENUM ('routine', 'surprise', 'fire_safety', 'hygiene', 'anti_ragging', 'cctv_check', 'health');

-- Affidavit & waitlist enums
CREATE TYPE affidavit_status_enum AS ENUM ('pending', 'partial', 'complete', 'verified');
CREATE TYPE waitlist_status_enum AS ENUM ('waiting', 'offered', 'accepted', 'declined', 'expired', 'allocated');

-- Access log enums
CREATE TYPE access_log_person_type_enum AS ENUM ('student', 'staff', 'visitor', 'delivery', 'unknown');
CREATE TYPE access_log_direction_enum AS ENUM ('entry', 'exit');
CREATE TYPE access_log_method_enum AS ENUM ('qr_scan', 'rfid', 'biometric', 'manual', 'cctv');

-- Curfew & alert enums
CREATE TYPE curfew_exception_type_enum AS ENUM ('exam_period', 'event', 'medical', 'permanent', 'one_time');
CREATE TYPE alert_type_enum AS ENUM ('dropout_risk', 'mental_health', 'fee_default', 'caterer_quality', 'attendance_drop', 'meal_skip');
CREATE TYPE alert_severity_enum AS ENUM ('info', 'warning', 'critical');
CREATE TYPE alert_status_enum AS ENUM ('active', 'acknowledged', 'resolved', 'dismissed', 'false_positive');

-- Incident party enum
CREATE TYPE incident_party_type_enum AS ENUM ('involved_student', 'involved_staff', 'witness', 'reporter');

-- Roommate preference enums
CREATE TYPE sleep_schedule_enum AS ENUM ('early_bird', 'night_owl', 'flexible');
CREATE TYPE study_habits_enum AS ENUM ('quiet_studier', 'group_studier', 'library_goer');
CREATE TYPE cleanliness_level_enum AS ENUM ('very_tidy', 'moderate', 'relaxed');
CREATE TYPE noise_tolerance_enum AS ENUM ('needs_silence', 'moderate', 'doesnt_mind');
CREATE TYPE visitor_frequency_enum AS ENUM ('rarely', 'sometimes', 'often');


-- ============================================================
-- TABLE 1: hostel_blocks
-- ============================================================
CREATE TABLE hostel_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    hostel_type hostel_type_enum NOT NULL,
    total_floors INT NOT NULL,
    total_rooms INT DEFAULT 0,
    total_capacity INT DEFAULT 0,
    current_occupancy INT DEFAULT 0,
    address TEXT,
    amenities JSONB,
    warden_id UUID,
    deputy_warden_id UUID,
    contact_phone TEXT,
    curfew_time_weekday TIME,
    curfew_time_weekend TIME,
    visiting_hours_start TIME,
    visiting_hours_end TIME,
    status block_status_enum NOT NULL DEFAULT 'active',
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 2: hostel_rooms
-- ============================================================
CREATE TABLE hostel_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    block_id UUID NOT NULL REFERENCES hostel_blocks(id),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    room_number TEXT NOT NULL,
    floor INT NOT NULL,
    room_type room_type_enum NOT NULL,
    ac_status ac_status_enum NOT NULL,
    capacity INT NOT NULL,
    current_occupancy INT DEFAULT 0,
    is_accessible BOOLEAN DEFAULT false,
    has_attached_bathroom BOOLEAN DEFAULT false,
    furniture JSONB,
    annual_fee NUMERIC(15,2),
    status room_status_enum NOT NULL DEFAULT 'available',
    maintenance_notes TEXT,
    last_inspection_date DATE,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(block_id, room_number)
);

-- ============================================================
-- TABLE 3: hostel_beds
-- ============================================================
CREATE TABLE hostel_beds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES hostel_rooms(id),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    bed_number TEXT NOT NULL,
    bed_type bed_type_enum NOT NULL,
    status bed_status_enum NOT NULL DEFAULT 'available',
    current_occupant_id UUID,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(room_id, bed_number)
);

-- ============================================================
-- TABLE 4: hostel_wardens
-- ============================================================
CREATE TABLE hostel_wardens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    staff_id UUID NOT NULL,
    user_id UUID NOT NULL,
    block_id UUID REFERENCES hostel_blocks(id),
    designation warden_designation_enum NOT NULL,
    phone TEXT NOT NULL,
    is_residential BOOLEAN DEFAULT false,
    assigned_floors INT[],
    shift warden_shift_enum,
    is_active BOOLEAN DEFAULT true,
    assigned_at DATE NOT NULL,
    relieved_at DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 5: hostel_allocations
-- ============================================================
CREATE TABLE hostel_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    learner_id UUID NOT NULL,
    block_id UUID NOT NULL REFERENCES hostel_blocks(id),
    room_id UUID NOT NULL REFERENCES hostel_rooms(id),
    bed_id UUID NOT NULL REFERENCES hostel_beds(id),
    academic_year_id UUID NOT NULL,
    semester_id UUID,
    allocation_type allocation_type_enum NOT NULL,
    allocation_date DATE NOT NULL,
    expected_vacate_date DATE,
    actual_vacate_date DATE,
    vacate_reason vacate_reason_enum,
    status allocation_status_enum NOT NULL DEFAULT 'active',
    fee_status fee_status_enum DEFAULT 'pending',
    deposit_paid NUMERIC(15,2) DEFAULT 0,
    emergency_contact_name TEXT NOT NULL,
    emergency_contact_phone TEXT NOT NULL,
    emergency_contact_relation TEXT NOT NULL,
    medical_conditions TEXT,
    food_preference food_preference_enum,
    roommate_preference_ids UUID[],
    allocated_by UUID,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 6: hostel_roommate_preferences
-- ============================================================
CREATE TABLE hostel_roommate_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id UUID NOT NULL,
    institution_id UUID NOT NULL REFERENCES institutions(id),
    academic_year_id UUID NOT NULL,
    sleep_schedule sleep_schedule_enum,
    study_habits study_habits_enum,
    cleanliness_level cleanliness_level_enum,
    noise_tolerance noise_tolerance_enum,
    visitor_frequency visitor_frequency_enum,
    is_smoker BOOLEAN DEFAULT false,
    language_preference TEXT,
    preferred_roommates UUID[],
    avoid_roommates UUID[],
    special_requirements TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 7: hostel_attendance
-- ============================================================
CREATE TABLE hostel_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    learner_id UUID NOT NULL,
    block_id UUID NOT NULL REFERENCES hostel_blocks(id),
    date DATE NOT NULL,
    check_in_time TIMESTAMPTZ,
    check_out_time TIMESTAMPTZ,
    evening_status hostel_attendance_status_enum NOT NULL,
    morning_status hostel_attendance_status_enum,
    marked_by UUID,
    marking_method marking_method_enum,
    is_curfew_violation BOOLEAN DEFAULT false,
    late_minutes INT,
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(learner_id, date)
);

-- ============================================================
-- TABLE 8: hostel_leave_requests
-- ============================================================
CREATE TABLE hostel_leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    learner_id UUID NOT NULL,
    block_id UUID NOT NULL REFERENCES hostel_blocks(id),
    leave_type hostel_leave_type_enum NOT NULL,
    from_date DATE NOT NULL,
    to_date DATE NOT NULL,
    from_time TIME,
    expected_return_time TIMESTAMPTZ,
    actual_return_time TIMESTAMPTZ,
    reason TEXT NOT NULL,
    destination TEXT NOT NULL,
    destination_address TEXT,
    destination_contact TEXT,
    attachment_url TEXT,
    parent_consent_status parent_consent_status_enum DEFAULT 'pending',
    parent_consent_at TIMESTAMPTZ,
    parent_consent_method parent_consent_method_enum,
    parent_consent_otp TEXT,
    parent_consent_otp_expires_at TIMESTAMPTZ,
    warden_approval_status parent_consent_status_enum DEFAULT 'pending',
    warden_id UUID,
    warden_approved_at TIMESTAMPTZ,
    warden_remarks TEXT,
    chief_warden_required BOOLEAN DEFAULT false,
    chief_warden_status parent_consent_status_enum,
    chief_warden_id UUID,
    status leave_status_enum NOT NULL DEFAULT 'draft',
    is_overdue BOOLEAN DEFAULT false,
    overdue_notified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 9: hostel_gate_passes
-- ============================================================
CREATE TABLE hostel_gate_passes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    learner_id UUID NOT NULL,
    leave_request_id UUID REFERENCES hostel_leave_requests(id),
    pass_type gate_pass_type_enum NOT NULL,
    pass_number TEXT NOT NULL UNIQUE,
    out_time TIMESTAMPTZ,
    expected_return TIMESTAMPTZ NOT NULL,
    actual_return TIMESTAMPTZ,
    destination TEXT NOT NULL,
    approved_by UUID NOT NULL,
    gate_security_out UUID,
    gate_security_in UUID,
    status gate_pass_status_enum NOT NULL DEFAULT 'issued',
    qr_code TEXT NOT NULL,
    parent_notified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 10: mess_caterers
-- ============================================================
CREATE TABLE mess_caterers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    name TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    fssai_license_number TEXT,
    fssai_expiry_date DATE,
    gst_number TEXT,
    contract_start_date DATE NOT NULL,
    contract_end_date DATE NOT NULL,
    contract_amount_monthly NUMERIC(15,2),
    billing_model billing_model_enum NOT NULL,
    performance_score NUMERIC(5,2) DEFAULT 0,
    status caterer_status_enum NOT NULL DEFAULT 'active',
    bank_details JSONB,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 11: mess_menus
-- ============================================================
CREATE TABLE mess_menus (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    caterer_id UUID NOT NULL REFERENCES mess_caterers(id),
    block_id UUID REFERENCES hostel_blocks(id),
    week_start_date DATE NOT NULL,
    day_of_week INT NOT NULL,
    meal_type meal_type_enum NOT NULL,
    items TEXT[] NOT NULL,
    special_items TEXT[],
    dietary_tags TEXT[],
    estimated_cost_per_plate NUMERIC(15,2),
    is_special_day BOOLEAN DEFAULT false,
    special_day_name TEXT,
    status menu_status_enum NOT NULL DEFAULT 'planned',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 12: mess_meal_records
-- ============================================================
CREATE TABLE mess_meal_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    learner_id UUID NOT NULL,
    menu_id UUID REFERENCES mess_menus(id),
    date DATE NOT NULL,
    meal_type meal_type_enum NOT NULL,
    consumed BOOLEAN DEFAULT false,
    scan_method scan_method_enum,
    scan_time TIMESTAMPTZ,
    is_guest_meal BOOLEAN DEFAULT false,
    guest_name TEXT,
    guest_count INT DEFAULT 0,
    feedback_rating INT,
    feedback_comment TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 13: mess_billing_periods
-- ============================================================
CREATE TABLE mess_billing_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    caterer_id UUID NOT NULL REFERENCES mess_caterers(id),
    period_name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_days INT NOT NULL,
    base_rate_per_day NUMERIC(15,2),
    status mess_billing_status_enum NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 14: mess_student_billing
-- ============================================================
CREATE TABLE mess_student_billing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    learner_id UUID NOT NULL,
    billing_period_id UUID NOT NULL REFERENCES mess_billing_periods(id),
    total_days INT NOT NULL,
    present_days INT NOT NULL,
    absent_days INT NOT NULL,
    rebate_eligible_days INT DEFAULT 0,
    gross_amount NUMERIC(15,2) NOT NULL,
    rebate_amount NUMERIC(15,2) DEFAULT 0,
    extra_meal_charges NUMERIC(15,2) DEFAULT 0,
    net_amount NUMERIC(15,2) NOT NULL,
    payment_status payment_status_enum DEFAULT 'pending',
    linked_bill_id UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 15: mess_feedback
-- ============================================================
CREATE TABLE mess_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    learner_id UUID NOT NULL,
    caterer_id UUID NOT NULL REFERENCES mess_caterers(id),
    date DATE NOT NULL,
    meal_type meal_type_enum NOT NULL,
    taste_rating INT NOT NULL,
    hygiene_rating INT NOT NULL,
    quantity_rating INT NOT NULL,
    variety_rating INT NOT NULL,
    overall_rating INT NOT NULL,
    comments TEXT,
    photo_urls TEXT[],
    is_complaint BOOLEAN DEFAULT false,
    complaint_ticket_id UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 16: mess_waste_log
-- ============================================================
CREATE TABLE mess_waste_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    caterer_id UUID NOT NULL REFERENCES mess_caterers(id),
    date DATE NOT NULL,
    meal_type meal_type_enum NOT NULL,
    prepared_quantity_kg NUMERIC(10,2) NOT NULL,
    consumed_quantity_kg NUMERIC(10,2) NOT NULL,
    waste_quantity_kg NUMERIC(10,2) NOT NULL,
    waste_percentage NUMERIC(5,2) NOT NULL,
    expected_headcount INT,
    actual_headcount INT,
    cost_of_waste NUMERIC(15,2),
    waste_category waste_category_enum,
    corrective_action TEXT,
    logged_by UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 17: mess_meal_bookings
-- ============================================================
CREATE TABLE mess_meal_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    learner_id UUID NOT NULL,
    date DATE NOT NULL,
    meal_type meal_type_enum NOT NULL,
    status booking_status_enum NOT NULL DEFAULT 'booked',
    is_opt_out BOOLEAN DEFAULT false,
    booking_time TIMESTAMPTZ NOT NULL DEFAULT now(),
    cancellation_time TIMESTAMPTZ,
    cancellation_deadline TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 18: hostel_visitors
-- ============================================================
CREATE TABLE hostel_visitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    learner_id UUID NOT NULL,
    block_id UUID NOT NULL REFERENCES hostel_blocks(id),
    visitor_name TEXT NOT NULL,
    visitor_phone TEXT NOT NULL,
    visitor_relationship visitor_relationship_enum NOT NULL,
    visitor_gender visitor_gender_enum NOT NULL,
    id_proof_type id_proof_type_enum,
    id_proof_number TEXT,
    visitor_photo_url TEXT,
    purpose TEXT NOT NULL,
    number_of_visitors INT DEFAULT 1,
    check_in_time TIMESTAMPTZ NOT NULL DEFAULT now(),
    check_out_time TIMESTAMPTZ,
    meeting_location meeting_location_enum NOT NULL DEFAULT 'common_area',
    approved_by UUID,
    is_overnight_stay BOOLEAN DEFAULT false,
    guest_room_id UUID,
    vehicle_number TEXT,
    items_brought TEXT,
    status visitor_status_enum NOT NULL DEFAULT 'checked_in',
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 19: hostel_maintenance_requests
-- ============================================================
CREATE TABLE hostel_maintenance_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    learner_id UUID NOT NULL,
    block_id UUID NOT NULL REFERENCES hostel_blocks(id),
    room_id UUID REFERENCES hostel_rooms(id),
    request_number TEXT NOT NULL UNIQUE,
    category maintenance_category_enum NOT NULL,
    subcategory TEXT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    priority maintenance_priority_enum NOT NULL DEFAULT 'medium',
    photo_urls_before TEXT[],
    photo_urls_after TEXT[],
    status maintenance_status_enum NOT NULL DEFAULT 'open',
    assigned_to_name TEXT,
    assigned_to_phone TEXT,
    assigned_at TIMESTAMPTZ,
    sla_hours INT NOT NULL DEFAULT 24,
    sla_deadline TIMESTAMPTZ NOT NULL,
    sla_status sla_status_enum DEFAULT 'on_track',
    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ,
    verified_by UUID,
    verified_at TIMESTAMPTZ,
    student_satisfaction INT,
    escalation_level INT DEFAULT 0,
    linked_grievance_id UUID,
    cost_estimate NUMERIC(15,2),
    actual_cost NUMERIC(15,2),
    vendor_name TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 20: hostel_incidents
-- ============================================================
CREATE TABLE hostel_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    block_id UUID NOT NULL REFERENCES hostel_blocks(id),
    incident_number TEXT NOT NULL UNIQUE,
    incident_type incident_type_enum NOT NULL,
    severity incident_severity_enum NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    location TEXT NOT NULL,
    incident_date TIMESTAMPTZ NOT NULL,
    reported_by UUID NOT NULL,
    reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    involved_students UUID[],
    involved_staff UUID[],
    witness_ids UUID[],
    evidence_urls TEXT[],
    immediate_action TEXT,
    investigation_notes TEXT,
    action_taken TEXT,
    disciplinary_action disciplinary_action_enum,
    police_complaint_filed BOOLEAN DEFAULT false,
    police_complaint_number TEXT,
    parent_notified BOOLEAN DEFAULT false,
    parent_notified_at TIMESTAMPTZ,
    status incident_status_enum NOT NULL DEFAULT 'reported',
    closed_by UUID,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 21: anti_ragging_affidavits
-- ============================================================
CREATE TABLE anti_ragging_affidavits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    learner_id UUID NOT NULL,
    academic_year_id UUID NOT NULL,
    student_affidavit_submitted BOOLEAN DEFAULT false,
    student_affidavit_date DATE,
    student_affidavit_url TEXT,
    parent_affidavit_submitted BOOLEAN DEFAULT false,
    parent_affidavit_date DATE,
    parent_affidavit_url TEXT,
    verified_by UUID,
    verified_at TIMESTAMPTZ,
    status affidavit_status_enum NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 22: hostel_inspections
-- ============================================================
CREATE TABLE hostel_inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    block_id UUID NOT NULL REFERENCES hostel_blocks(id),
    inspection_type inspection_type_enum NOT NULL,
    inspector_id UUID NOT NULL,
    inspection_date DATE NOT NULL,
    rooms_inspected UUID[],
    findings TEXT NOT NULL,
    score NUMERIC(5,2),
    issues_found JSONB[],
    follow_up_required BOOLEAN DEFAULT false,
    follow_up_deadline DATE,
    follow_up_completed BOOLEAN DEFAULT false,
    report_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 23: hostel_fee_config
-- ============================================================
CREATE TABLE hostel_fee_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    academic_year_id UUID NOT NULL,
    room_type room_type_enum NOT NULL,
    ac_status ac_status_enum NOT NULL,
    annual_fee NUMERIC(15,2) NOT NULL,
    semester_fee NUMERIC(15,2),
    monthly_fee NUMERIC(15,2),
    deposit_amount NUMERIC(15,2) NOT NULL,
    mess_fee_monthly NUMERIC(15,2),
    mess_fee_semester NUMERIC(15,2),
    electricity_charges electricity_charges_enum,
    electricity_fixed_amount NUMERIC(15,2),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 24: hostel_deposits
-- ============================================================
CREATE TABLE hostel_deposits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    learner_id UUID NOT NULL,
    allocation_id UUID NOT NULL REFERENCES hostel_allocations(id),
    deposit_type deposit_type_enum NOT NULL,
    amount NUMERIC(15,2) NOT NULL,
    paid_date DATE,
    payment_reference TEXT,
    refund_date DATE,
    deductions NUMERIC(15,2) DEFAULT 0,
    deduction_notes TEXT,
    refund_amount NUMERIC(15,2),
    refund_reference TEXT,
    status deposit_status_enum NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 25: mess_caterer_blocks
-- ============================================================
CREATE TABLE mess_caterer_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    caterer_id UUID NOT NULL REFERENCES mess_caterers(id),
    block_id UUID NOT NULL REFERENCES hostel_blocks(id),
    start_date DATE NOT NULL,
    end_date DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 26: hostel_incident_parties
-- ============================================================
CREATE TABLE hostel_incident_parties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES hostel_incidents(id),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    person_id UUID NOT NULL,
    party_type incident_party_type_enum NOT NULL,
    name TEXT,
    statement TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 27: hostel_waitlist
-- ============================================================
CREATE TABLE hostel_waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    learner_id UUID NOT NULL,
    academic_year_id UUID NOT NULL,
    preferred_block_id UUID REFERENCES hostel_blocks(id),
    preferred_room_type room_type_enum,
    preferred_ac_status ac_status_enum,
    priority_score INT DEFAULT 0,
    status waitlist_status_enum NOT NULL DEFAULT 'waiting',
    offered_at TIMESTAMPTZ,
    offer_expires_at TIMESTAMPTZ,
    allocated_allocation_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 28: hostel_access_log
-- ============================================================
CREATE TABLE hostel_access_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    block_id UUID NOT NULL REFERENCES hostel_blocks(id),
    person_type access_log_person_type_enum NOT NULL,
    person_id UUID,
    person_name TEXT,
    direction access_log_direction_enum NOT NULL,
    method access_log_method_enum NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    gate_id TEXT,
    device_id TEXT,
    photo_url TEXT,
    is_flagged BOOLEAN DEFAULT false,
    flag_reason TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 29: hostel_known_visitors
-- ============================================================
CREATE TABLE hostel_known_visitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    learner_id UUID NOT NULL,
    visitor_name TEXT NOT NULL,
    visitor_phone TEXT NOT NULL,
    visitor_relationship visitor_relationship_enum NOT NULL,
    visitor_gender visitor_gender_enum NOT NULL,
    id_proof_type id_proof_type_enum,
    id_proof_number TEXT,
    photo_url TEXT,
    is_active BOOLEAN DEFAULT true,
    visit_count INT DEFAULT 0,
    last_visit_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 30: hostel_curfew_exceptions
-- ============================================================
CREATE TABLE hostel_curfew_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    block_id UUID REFERENCES hostel_blocks(id),
    exception_type curfew_exception_type_enum NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    new_curfew_time TIME NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    applies_to_learner_ids UUID[],
    approved_by UUID NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 31: hostel_alert_rules
-- ============================================================
CREATE TABLE hostel_alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    alert_type alert_type_enum NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    conditions JSONB NOT NULL,
    severity alert_severity_enum NOT NULL,
    is_active BOOLEAN DEFAULT true,
    cooldown_hours INT DEFAULT 24,
    notify_roles TEXT[] NOT NULL,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 32: hostel_risk_alerts
-- ============================================================
CREATE TABLE hostel_risk_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    alert_rule_id UUID REFERENCES hostel_alert_rules(id),
    alert_type alert_type_enum NOT NULL,
    severity alert_severity_enum NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    learner_id UUID,
    block_id UUID REFERENCES hostel_blocks(id),
    trigger_data JSONB,
    status alert_status_enum NOT NULL DEFAULT 'active',
    acknowledged_by UUID,
    acknowledged_at TIMESTAMPTZ,
    resolved_by UUID,
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 33: hostel_leave_type_config
-- ============================================================
CREATE TABLE hostel_leave_type_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    leave_type hostel_leave_type_enum NOT NULL,
    max_duration_days INT,
    requires_parent_consent BOOLEAN DEFAULT true,
    advance_notice_hours INT,
    requires_chief_warden BOOLEAN DEFAULT false,
    requires_attachment BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 34: hostel_maintenance_sla_config
-- ============================================================
CREATE TABLE hostel_maintenance_sla_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    category maintenance_category_enum NOT NULL,
    priority maintenance_priority_enum NOT NULL,
    sla_hours INT NOT NULL,
    escalation_after_hours INT,
    escalation_to_role TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
