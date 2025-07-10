-- =============================================
-- Database Tables
-- =============================================

-- =============================================
-- Core Tables
-- =============================================

-- Institutions table
CREATE TABLE institutions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    counselling_code VARCHAR(50),
    location VARCHAR(255),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(20),
    website VARCHAR(255),
    timetable_type timetable_type DEFAULT 'weekly',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Profiles table (extends auth.users)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    phone_number VARCHAR(20),
    role user_role DEFAULT 'guest',
    avatar_url VARCHAR(255),
    institution_id UUID REFERENCES institutions(id),
    profile_completed BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    is_super_admin BOOLEAN DEFAULT FALSE,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Users table (additional user info)
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    full_name VARCHAR(255),
    email VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User institution access table
CREATE TABLE user_institution_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE NOT NULL,
    access_type VARCHAR(50) DEFAULT 'full',
    granted_by UUID REFERENCES profiles(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, institution_id)
);

-- Custom roles table
CREATE TABLE custom_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_key VARCHAR(50) UNIQUE NOT NULL,
    role_name VARCHAR(100) NOT NULL,
    description TEXT,
    permissions JSONB DEFAULT '{}',
    is_system_role BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User activity logs table
CREATE TABLE user_activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id),
    institution_id UUID REFERENCES institutions(id),
    action_type VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(255),
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(255),
    request_method VARCHAR(10),
    request_path TEXT,
    response_time INTEGER,
    status_code INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- API Keys table
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    key_value VARCHAR(255) UNIQUE NOT NULL,
    permissions JSONB DEFAULT '{}',
    allowed_ips TEXT[],
    allowed_origins TEXT[],
    rate_limit INTEGER DEFAULT 1000,
    expires_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- API Rate limits table
CREATE TABLE api_rate_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    api_key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE NOT NULL,
    window_start TIMESTAMP WITH TIME ZONE NOT NULL,
    request_count INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(api_key_id, window_start)
);

-- API Request logs table
CREATE TABLE api_request_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    api_key_id UUID REFERENCES api_keys(id),
    endpoint VARCHAR(255),
    method VARCHAR(10),
    status_code INTEGER,
    response_time_ms INTEGER,
    ip_address INET,
    user_agent TEXT,
    request_headers JSONB,
    request_body JSONB,
    response_body JSONB,
    error_message TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- Academic & Organizational Tables
-- =============================================

-- Degrees table
CREATE TABLE degrees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID REFERENCES institutions(id) NOT NULL,
    degree_id VARCHAR(50) NOT NULL,
    degree_name VARCHAR(255) NOT NULL,
    degree_type VARCHAR(50),
    degree_duration INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Departments table
CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID REFERENCES institutions(id) NOT NULL,
    degree_id UUID REFERENCES degrees(id),
    department_code VARCHAR(50) NOT NULL,
    department_name VARCHAR(255) NOT NULL,
    head_of_department VARCHAR(255),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(institution_id, department_code)
);

-- Institution departments junction table
CREATE TABLE institution_departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID REFERENCES institutions(id) NOT NULL,
    department_id UUID REFERENCES departments(id) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Programs table
CREATE TABLE programs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID REFERENCES institutions(id) NOT NULL,
    degree_id UUID REFERENCES degrees(id) NOT NULL,
    department_id UUID REFERENCES departments(id) NOT NULL,
    program_id VARCHAR(50) NOT NULL,
    program_name VARCHAR(255) NOT NULL,
    program_code VARCHAR(50),
    duration_years INTEGER,
    total_credits INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(institution_id, program_id)
);

-- Semesters table
CREATE TABLE semesters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID REFERENCES institutions(id) NOT NULL,
    semester_code VARCHAR(20) UNIQUE NOT NULL,
    semester_number INTEGER NOT NULL,
    semester_name VARCHAR(100) NOT NULL,
    total_credits INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Sections table
CREATE TABLE sections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID REFERENCES institutions(id) NOT NULL,
    degree_id UUID REFERENCES degrees(id) NOT NULL,
    department_id UUID REFERENCES departments(id) NOT NULL,
    program_id UUID REFERENCES programs(id) NOT NULL,
    semester_id UUID REFERENCES semesters(id) NOT NULL,
    section_name VARCHAR(50) NOT NULL,
    max_students INTEGER,
    current_students INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(institution_id, degree_id, department_id, program_id, semester_id, section_name)
);

-- Courses table
CREATE TABLE courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID REFERENCES institutions(id) NOT NULL,
    course_code VARCHAR(50) NOT NULL,
    course_name VARCHAR(255) NOT NULL,
    credits INTEGER,
    course_type VARCHAR(50),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(institution_id, course_code)
);

-- Course mappings table
CREATE TABLE course_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID REFERENCES institutions(id) NOT NULL,
    degree_id UUID REFERENCES degrees(id) NOT NULL,
    department_id UUID REFERENCES departments(id) NOT NULL,
    program_id UUID REFERENCES programs(id) NOT NULL,
    semester_id UUID REFERENCES semesters(id) NOT NULL,
    course_id UUID REFERENCES courses(id) NOT NULL,
    is_elective BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(institution_id, degree_id, department_id, program_id, semester_id, course_id)
);

-- Academic years table
CREATE TABLE academic_years (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID REFERENCES institutions(id) NOT NULL,
    academic_year_name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(institution_id, academic_year_name)
);

-- =============================================
-- Staff & Student Tables
-- =============================================

-- Employment categories table
CREATE TABLE employment_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Staff table
CREATE TABLE staff (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_id VARCHAR(50) UNIQUE NOT NULL,
    staff_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    institution_email VARCHAR(255) UNIQUE,
    phone VARCHAR(20),
    address TEXT,
    date_of_birth DATE,
    gender VARCHAR(20),
    employment_status VARCHAR(50),
    designation VARCHAR(100),
    qualification VARCHAR(255),
    experience_years INTEGER,
    date_of_joining DATE,
    institution_id UUID REFERENCES institutions(id),
    department_id UUID REFERENCES departments(id),
    category_id UUID REFERENCES employment_categories(id),
    staff_photo_url TEXT,
    aadhaar_number VARCHAR(20),
    pan_number VARCHAR(20),
    bank_account_number VARCHAR(50),
    bank_name VARCHAR(100),
    ifsc_code VARCHAR(20),
    salary DECIMAL(10, 2),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Admissions table
CREATE TABLE admissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_name VARCHAR(255) NOT NULL,
    father_name VARCHAR(255),
    father_occupation VARCHAR(100),
    father_mobile VARCHAR(20),
    mother_name VARCHAR(255),
    mother_occupation VARCHAR(100),
    mother_mobile VARCHAR(20),
    date_of_birth VARCHAR(50),
    gender VARCHAR(20),
    religion VARCHAR(50),
    community VARCHAR(100),
    caste VARCHAR(100),
    annual_income DECIMAL(12, 2),
    last_school VARCHAR(255),
    board_of_study VARCHAR(100),
    tenth_marks DECIMAL(5, 2),
    twelfth_marks DECIMAL(5, 2),
    medical_cutoff_marks DECIMAL(5, 2),
    engineering_cutoff_marks DECIMAL(5, 2),
    neet_roll_number VARCHAR(50),
    counseling_applied BOOLEAN DEFAULT FALSE,
    counseling_number VARCHAR(50),
    first_graduate BOOLEAN DEFAULT FALSE,
    quota VARCHAR(50),
    category VARCHAR(50),
    institution_id UUID REFERENCES institutions(id),
    degree_id UUID REFERENCES degrees(id),
    department_id UUID REFERENCES departments(id),
    program_id UUID REFERENCES programs(id),
    entry_type VARCHAR(50),
    permanent_address_street TEXT,
    permanent_address_taluk VARCHAR(100),
    permanent_address_district VARCHAR(100),
    permanent_address_pin_code VARCHAR(10),
    permanent_address_state VARCHAR(100),
    student_mobile VARCHAR(20),
    student_email VARCHAR(255),
    accommodation_type VARCHAR(50),
    hostel_type VARCHAR(50),
    bus_required BOOLEAN DEFAULT FALSE,
    bus_route VARCHAR(100),
    bus_pickup_location VARCHAR(255),
    reference_type VARCHAR(50),
    reference_name VARCHAR(255),
    reference_contact VARCHAR(20),
    status admission_status DEFAULT 'pending',
    remarks TEXT,
    created_by UUID REFERENCES profiles(id),
    updated_by UUID REFERENCES profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Students table
CREATE TABLE students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admission_id UUID REFERENCES admissions(id),
    student_name VARCHAR(255) NOT NULL,
    father_name VARCHAR(255),
    father_occupation VARCHAR(100),
    father_mobile VARCHAR(20),
    mother_name VARCHAR(255),
    mother_occupation VARCHAR(100),
    mother_mobile VARCHAR(20),
    date_of_birth DATE,
    gender VARCHAR(20),
    religion VARCHAR(50),
    community VARCHAR(100),
    caste VARCHAR(100),
    annual_income DECIMAL(12, 2),
    last_school VARCHAR(255),
    board_of_study VARCHAR(100),
    tenth_marks DECIMAL(5, 2),
    twelfth_marks DECIMAL(5, 2),
    medical_cutoff_marks DECIMAL(5, 2),
    engineering_cutoff_marks DECIMAL(5, 2),
    neet_roll_number VARCHAR(50),
    counseling_applied BOOLEAN DEFAULT FALSE,
    counseling_number VARCHAR(50),
    first_graduate BOOLEAN DEFAULT FALSE,
    quota VARCHAR(50),
    category VARCHAR(50),
    institution_id UUID REFERENCES institutions(id),
    degree_id UUID REFERENCES degrees(id),
    department_id UUID REFERENCES departments(id),
    program_id UUID REFERENCES programs(id),
    academic_year_id UUID REFERENCES academic_years(id),
    semester_id UUID REFERENCES semesters(id),
    section_id UUID REFERENCES sections(id),
    roll_number VARCHAR(50),
    college_email VARCHAR(255),
    institution_email VARCHAR(255),
    entry_type VARCHAR(50),
    permanent_address_street TEXT,
    permanent_address_taluk VARCHAR(100),
    permanent_address_district VARCHAR(100),
    permanent_address_pin_code VARCHAR(10),
    permanent_address_state VARCHAR(100),
    student_mobile VARCHAR(20),
    student_email VARCHAR(255),
    student_personal_email VARCHAR(255),
    accommodation_type VARCHAR(50),
    hostel_type VARCHAR(50),
    bus_required BOOLEAN DEFAULT FALSE,
    bus_route VARCHAR(100),
    bus_pickup_location VARCHAR(255),
    reference_type VARCHAR(50),
    reference_name VARCHAR(255),
    reference_contact VARCHAR(20),
    status student_status DEFAULT 'pending',
    is_profile_complete BOOLEAN DEFAULT FALSE,
    student_photo_url TEXT,
    created_by UUID REFERENCES profiles(id),
    updated_by UUID REFERENCES profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
); 

-- =============================================
-- Billing & Finance Tables
-- =============================================

-- Billing parent categories table
CREATE TABLE billing_parent_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_category_name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Billing sub categories table
CREATE TABLE billing_sub_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_category_id UUID REFERENCES billing_parent_categories(id) NOT NULL,
    sub_category_name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Billing item categories table
CREATE TABLE billing_item_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID REFERENCES institutions(id) NOT NULL,
    parent_category_id UUID REFERENCES billing_parent_categories(id) NOT NULL,
    sub_category_id UUID REFERENCES billing_sub_categories(id) NOT NULL,
    item_category_name VARCHAR(255) NOT NULL,
    description TEXT,
    default_amount DECIMAL(10, 2),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Billing student bills table
CREATE TABLE billing_student_bills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID REFERENCES students(id) NOT NULL,
    institution_id UUID REFERENCES institutions(id) NOT NULL,
    item_category_id UUID REFERENCES billing_item_categories(id) NOT NULL,
    bill_description TEXT,
    due_date DATE,
    quantity INTEGER DEFAULT 1,
    unit_amount DECIMAL(10, 2) NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    tax_amount DECIMAL(10, 2) DEFAULT 0,
    final_amount DECIMAL(10, 2) NOT NULL,
    status billing_status DEFAULT 'unpaid',
    payment_date DATE,
    balance_amount DECIMAL(10, 2),
    remarks TEXT,
    is_recurring BOOLEAN DEFAULT FALSE,
    recurrence_pattern VARCHAR(50),
    number_of_recurrences INTEGER,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Billing receipts table
CREATE TABLE billing_receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    receipt_number VARCHAR(50) UNIQUE NOT NULL,
    student_id UUID REFERENCES students(id) NOT NULL,
    institution_id UUID REFERENCES institutions(id) NOT NULL,
    receipt_date DATE NOT NULL,
    payment_amount DECIMAL(10, 2) NOT NULL,
    payment_method VARCHAR(50),
    payment_reference VARCHAR(255),
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Billing receipt items table
CREATE TABLE billing_receipt_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    receipt_id UUID REFERENCES billing_receipts(id) NOT NULL,
    bill_id UUID REFERENCES billing_student_bills(id) NOT NULL,
    amount_paid DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Billing invoices table
CREATE TABLE billing_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    invoice_date DATE NOT NULL,
    institution_id UUID REFERENCES institutions(id) NOT NULL,
    student_id UUID REFERENCES students(id),
    invoice_type VARCHAR(50) DEFAULT 'individual',
    invoice_description TEXT,
    sub_total DECIMAL(10, 2) NOT NULL,
    tax_amount DECIMAL(10, 2) DEFAULT 0,
    grand_total DECIMAL(10, 2) NOT NULL,
    payment_status VARCHAR(50) DEFAULT 'unpaid',
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Billing invoice items table
CREATE TABLE billing_invoice_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID REFERENCES billing_invoices(id) NOT NULL,
    receipt_id UUID REFERENCES billing_receipts(id),
    item_description TEXT,
    quantity INTEGER DEFAULT 1,
    unit_price DECIMAL(10, 2) NOT NULL,
    total_price DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Billing discounts table
CREATE TABLE billing_discounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID REFERENCES students(id) NOT NULL,
    bill_id UUID REFERENCES billing_student_bills(id) NOT NULL,
    discount_type VARCHAR(50),
    discount_percentage DECIMAL(5, 2),
    discount_amount DECIMAL(10, 2) NOT NULL,
    reason TEXT,
    approval_status discount_approval_status DEFAULT 'pending',
    approved_by UUID REFERENCES profiles(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Billing refunds table
CREATE TABLE billing_refunds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    receipt_id UUID REFERENCES billing_receipts(id) NOT NULL,
    refund_amount DECIMAL(10, 2) NOT NULL,
    refund_reason TEXT,
    refund_date DATE,
    refund_method VARCHAR(50),
    refund_reference VARCHAR(255),
    approval_status refund_status DEFAULT 'pending',
    approved_by UUID REFERENCES profiles(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    processed_by UUID REFERENCES profiles(id),
    processed_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
); 

-- =============================================
-- Application Management Tables
-- =============================================

-- Application categories table
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    icon TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Applications table
CREATE TABLE applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    logo_url VARCHAR(500),
    category_id UUID REFERENCES categories(id),
    url VARCHAR(500),
    documentation_url VARCHAR(500),
    support_email VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    access_level VARCHAR(50) DEFAULT 'public',
    tags TEXT[],
    version VARCHAR(50),
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Bug reports table
CREATE TABLE bug_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    reproduction_steps TEXT,
    expected_behavior TEXT,
    actual_behavior TEXT,
    severity VARCHAR(20) DEFAULT 'medium',
    category VARCHAR(50),
    browser_info VARCHAR(255),
    browser_version VARCHAR(50),
    screenshot_urls TEXT[],
    status TEXT DEFAULT 'open',
    assignee_id UUID REFERENCES profiles(id),
    reporter_user_id UUID REFERENCES profiles(id) NOT NULL,
    institution_id UUID REFERENCES institutions(id),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Bug report comments table
CREATE TABLE bug_report_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bug_report_id UUID REFERENCES bug_reports(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES profiles(id) NOT NULL,
    comment TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- Resource Management Tables
-- =============================================

-- Resource categories table
CREATE TABLE resource_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_name VARCHAR(100) NOT NULL,
    description TEXT,
    category_type VARCHAR(50) DEFAULT 'physical',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Resources table
CREATE TABLE resources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resource_code VARCHAR(50) UNIQUE NOT NULL,
    resource_name VARCHAR(255) NOT NULL,
    category_id UUID REFERENCES resource_categories(id),
    institution_id UUID REFERENCES institutions(id),
    location VARCHAR(255),
    capacity INTEGER,
    current_condition resource_condition DEFAULT 'good',
    purchase_date DATE,
    purchase_price DECIMAL(10, 2),
    depreciation_rate DECIMAL(5, 2),
    current_value DECIMAL(10, 2),
    maintenance_schedule VARCHAR(100),
    last_maintenance_date DATE,
    next_maintenance_date DATE,
    is_available BOOLEAN DEFAULT TRUE,
    is_bookable BOOLEAN DEFAULT TRUE,
    booking_terms TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Resource requests table
CREATE TABLE resource_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_code VARCHAR(50) UNIQUE NOT NULL,
    requester_id UUID REFERENCES profiles(id) NOT NULL,
    institution_id UUID REFERENCES institutions(id),
    resource_type VARCHAR(50),
    resource_name VARCHAR(255),
    quantity INTEGER DEFAULT 1,
    purpose TEXT,
    priority resource_request_priority DEFAULT 'medium',
    required_date DATE,
    status resource_request_status DEFAULT 'pending',
    department_id UUID REFERENCES departments(id),
    approved_by UUID REFERENCES profiles(id),
    approved_date TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    fulfilled_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Reservations table
CREATE TABLE reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reservation_code VARCHAR(50) UNIQUE NOT NULL,
    resource_id UUID REFERENCES resources(id) NOT NULL,
    reserved_by UUID REFERENCES profiles(id) NOT NULL,
    institution_id UUID REFERENCES institutions(id),
    start_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
    end_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
    purpose TEXT,
    attendees INTEGER,
    status reservation_status DEFAULT 'pending',
    approved_by UUID REFERENCES profiles(id),
    approval_date TIMESTAMP WITH TIME ZONE,
    cancellation_reason TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_reservation_times CHECK (end_datetime > start_datetime)
);

-- Usage reports table
CREATE TABLE usage_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resource_id UUID REFERENCES resources(id) NOT NULL,
    reservation_id UUID REFERENCES reservations(id),
    reported_by UUID REFERENCES profiles(id) NOT NULL,
    usage_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    actual_users INTEGER,
    condition_after_use resource_condition,
    issues_reported TEXT,
    maintenance_required BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Sharing policies table
CREATE TABLE sharing_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    policy_name VARCHAR(100) NOT NULL,
    description TEXT,
    resource_category_id UUID REFERENCES resource_categories(id),
    sharing_type VARCHAR(50),
    max_duration_hours INTEGER,
    advance_booking_days INTEGER,
    requires_approval BOOLEAN DEFAULT TRUE,
    auto_approve_roles user_role[],
    blackout_periods JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Digital resource categories table
CREATE TABLE digital_resource_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_name VARCHAR(100) NOT NULL,
    description TEXT,
    parent_category_id UUID REFERENCES digital_resource_categories(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Digital resources table
CREATE TABLE digital_resources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resource_code VARCHAR(50) UNIQUE NOT NULL,
    resource_name VARCHAR(255) NOT NULL,
    category_id UUID REFERENCES digital_resource_categories(id),
    institution_id UUID REFERENCES institutions(id),
    resource_type digital_resource_type NOT NULL,
    vendor_name VARCHAR(255),
    license_type VARCHAR(100),
    license_count INTEGER,
    license_expiry DATE,
    cost_per_license DECIMAL(10, 2),
    total_cost DECIMAL(10, 2),
    access_url VARCHAR(500),
    access_method digital_resource_access_method,
    authentication_method VARCHAR(100),
    technical_requirements TEXT,
    support_contact VARCHAR(255),
    documentation_url VARCHAR(500),
    is_active BOOLEAN DEFAULT TRUE,
    auto_renew BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Digital resource usage table
CREATE TABLE digital_resource_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resource_id UUID REFERENCES digital_resources(id) NOT NULL,
    user_id UUID REFERENCES profiles(id) NOT NULL,
    session_start TIMESTAMP WITH TIME ZONE NOT NULL,
    session_end TIMESTAMP WITH TIME ZONE,
    data_consumed_mb DECIMAL(10, 2),
    features_used TEXT[],
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Digital reservations table
CREATE TABLE digital_reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resource_id UUID REFERENCES digital_resources(id) NOT NULL,
    reserved_by UUID REFERENCES profiles(id) NOT NULL,
    reservation_type VARCHAR(50),
    license_count INTEGER DEFAULT 1,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    purpose TEXT,
    department_id UUID REFERENCES departments(id),
    approved_by UUID REFERENCES profiles(id),
    approval_date TIMESTAMP WITH TIME ZONE,
    status reservation_status DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Digital resource requests table
CREATE TABLE digital_resource_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requester_id UUID REFERENCES profiles(id) NOT NULL,
    institution_id UUID REFERENCES institutions(id),
    resource_name VARCHAR(255) NOT NULL,
    resource_type digital_resource_type NOT NULL,
    vendor_name VARCHAR(255),
    estimated_users INTEGER,
    purpose TEXT NOT NULL,
    business_justification TEXT,
    estimated_cost DECIMAL(10, 2),
    priority resource_request_priority DEFAULT 'medium',
    status resource_request_status DEFAULT 'pending',
    reviewed_by UUID REFERENCES profiles(id),
    review_date TIMESTAMP WITH TIME ZONE,
    review_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Digital resource reports table
CREATE TABLE digital_resource_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_type VARCHAR(50) NOT NULL,
    report_period_start DATE NOT NULL,
    report_period_end DATE NOT NULL,
    generated_by UUID REFERENCES profiles(id) NOT NULL,
    report_data JSONB NOT NULL,
    insights TEXT,
    recommendations TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- Timetabling Tables
-- =============================================

-- Periods table
CREATE TABLE periods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID REFERENCES institutions(id) NOT NULL,
    period_number INTEGER NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    period_type VARCHAR(50) DEFAULT 'regular',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(institution_id, period_number)
);

-- Timetables table
CREATE TABLE timetables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID REFERENCES institutions(id) NOT NULL,
    academic_year_id UUID REFERENCES academic_years(id) NOT NULL,
    semester_id UUID REFERENCES semesters(id) NOT NULL,
    timetable_name VARCHAR(255) NOT NULL,
    timetable_type timetable_type DEFAULT 'weekly',
    effective_from DATE NOT NULL,
    effective_to DATE,
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES profiles(id),
    approved_by UUID REFERENCES profiles(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Timetable slots table
CREATE TABLE timetable_slots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timetable_id UUID REFERENCES timetables(id) NOT NULL,
    day_of_week day_of_week,
    day_order INTEGER,
    period_id UUID REFERENCES periods(id) NOT NULL,
    slot_type VARCHAR(50) DEFAULT 'regular',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Timetable slot sections table
CREATE TABLE timetable_slot_sections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slot_id UUID REFERENCES timetable_slots(id) NOT NULL,
    section_id UUID REFERENCES sections(id) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(slot_id, section_id)
);

-- Timetable slot staff table
CREATE TABLE timetable_slot_staff (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slot_id UUID REFERENCES timetable_slots(id) NOT NULL,
    staff_id UUID REFERENCES staff(id) NOT NULL,
    course_id UUID REFERENCES courses(id) NOT NULL,
    room_number VARCHAR(50),
    is_primary BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(slot_id, staff_id, course_id)
);

-- Timetable sub slot sections table
CREATE TABLE timetable_sub_slot_sections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slot_id UUID REFERENCES timetable_slots(id) NOT NULL,
    sub_slot_number INTEGER NOT NULL,
    section_id UUID REFERENCES sections(id) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(slot_id, sub_slot_number, section_id)
);

-- Timetable sub slot staff table
CREATE TABLE timetable_sub_slot_staff (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slot_id UUID REFERENCES timetable_slots(id) NOT NULL,
    sub_slot_number INTEGER NOT NULL,
    staff_id UUID REFERENCES staff(id) NOT NULL,
    course_id UUID REFERENCES courses(id) NOT NULL,
    room_number VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(slot_id, sub_slot_number, staff_id)
);

-- Timetable periods table
CREATE TABLE timetable_periods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timetable_id UUID REFERENCES timetables(id) NOT NULL,
    period_id UUID REFERENCES periods(id) NOT NULL,
    day_of_week day_of_week,
    day_order INTEGER,
    course_id UUID REFERENCES courses(id),
    section_id UUID REFERENCES sections(id),
    staff_id UUID REFERENCES staff(id),
    room_number VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Timetable leaves table
CREATE TABLE timetable_leaves (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID REFERENCES institutions(id) NOT NULL,
    leave_date DATE NOT NULL,
    leave_type leave_type NOT NULL,
    description TEXT,
    affects_classes BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Timetable day order shifts table
CREATE TABLE timetable_day_order_shifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID REFERENCES institutions(id) NOT NULL,
    original_date DATE NOT NULL,
    shifted_day_order INTEGER NOT NULL,
    reason TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(institution_id, original_date)
);

-- Staff plans table
CREATE TABLE staff_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID REFERENCES institutions(id) NOT NULL,
    academic_year_id UUID REFERENCES academic_years(id) NOT NULL,
    staff_id UUID REFERENCES staff(id) NOT NULL,
    semester_id UUID REFERENCES semesters(id) NOT NULL,
    total_periods_assigned INTEGER DEFAULT 0,
    max_periods_per_week INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(institution_id, academic_year_id, staff_id, semester_id)
);

-- Staff plan courses table
CREATE TABLE staff_plan_courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_plan_id UUID REFERENCES staff_plans(id) NOT NULL,
    course_id UUID REFERENCES courses(id) NOT NULL,
    section_id UUID REFERENCES sections(id) NOT NULL,
    periods_per_week INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(staff_plan_id, course_id, section_id)
);

-- =============================================
-- Attendance Management Tables
-- =============================================

-- Student attendance table
CREATE TABLE student_attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID REFERENCES students(id) NOT NULL,
    course_id UUID REFERENCES courses(id) NOT NULL,
    section_id UUID REFERENCES sections(id) NOT NULL,
    staff_id UUID REFERENCES staff(id),
    period_id UUID REFERENCES periods(id),
    attendance_date DATE NOT NULL,
    status attendance_status NOT NULL,
    remarks TEXT,
    marked_by UUID REFERENCES profiles(id),
    marked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, course_id, attendance_date, period_id)
);

-- Subcategories table (generic)
CREATE TABLE subcategories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_category_id UUID REFERENCES categories(id) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- Dashboard Configuration Tables
-- =============================================

-- Dashboard widget types table
CREATE TABLE dashboard_widget_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    widget_key VARCHAR(50) UNIQUE NOT NULL,
    widget_name VARCHAR(100) NOT NULL,
    description TEXT,
    default_config JSONB DEFAULT '{}',
    allowed_roles user_role[],
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Dashboard configurations table
CREATE TABLE dashboard_configurations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) NOT NULL,
    institution_id UUID REFERENCES institutions(id),
    config_name VARCHAR(100) DEFAULT 'Default',
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, institution_id, config_name)
);

-- Dashboard widgets table
CREATE TABLE dashboard_widgets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    configuration_id UUID REFERENCES dashboard_configurations(id) NOT NULL,
    widget_type_id UUID REFERENCES dashboard_widget_types(id) NOT NULL,
    position_x INTEGER DEFAULT 0,
    position_y INTEGER DEFAULT 0,
    width INTEGER DEFAULT 4,
    height INTEGER DEFAULT 3,
    widget_config JSONB DEFAULT '{}',
    is_visible BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
); 