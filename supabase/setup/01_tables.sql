-- =====================================================
-- MYJKKN DATABASE TABLES
-- =====================================================
-- Purpose: All table definitions in one place
-- Created: 2025-01-16
-- Last Updated: 2025-01-16
--
-- IMPORTANT: DO NOT create tables in other files
-- If you need to modify a table, UPDATE this file
-- Add comments explaining what changed and when
-- =====================================================

-- =====================================================
-- SECTION 1: USER AND AUTHENTICATION TABLES
-- =====================================================

-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    phone TEXT,
    role user_role DEFAULT 'guest',
    institution_ids UUID[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Add indexes
CREATE INDEX idx_profiles_email ON public.profiles(email);
CREATE INDEX idx_profiles_role ON public.profiles(role);
CREATE INDEX idx_profiles_institution_ids ON public.profiles USING GIN(institution_ids);

-- Add trigger for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- SECTION 2: ORGANIZATION TABLES
-- =====================================================

-- Institutions table
CREATE TABLE IF NOT EXISTS public.institutions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    address TEXT,
    city TEXT,
    state TEXT,
    country TEXT DEFAULT 'India',
    pincode TEXT,
    phone TEXT,
    email TEXT,
    website TEXT,
    logo_url TEXT,
    settings JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;

-- Add indexes
CREATE INDEX idx_institutions_code ON public.institutions(code);
CREATE INDEX idx_institutions_is_active ON public.institutions(is_active);

-- Add trigger
CREATE TRIGGER update_institutions_updated_at BEFORE UPDATE ON public.institutions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Departments table
CREATE TABLE IF NOT EXISTS public.departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    description TEXT,
    head_of_department UUID REFERENCES public.profiles(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(institution_id, code)
);

-- Enable RLS
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

-- Add indexes
CREATE INDEX idx_departments_institution_id ON public.departments(institution_id);
CREATE INDEX idx_departments_code ON public.departments(code);

-- Add trigger
CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON public.departments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Programs table
CREATE TABLE IF NOT EXISTS public.programs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    duration_years INTEGER NOT NULL,
    degree_type TEXT, -- B.Tech, M.Tech, etc
    total_semesters INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(institution_id, code)
);

-- Enable RLS
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;

-- Add indexes
CREATE INDEX idx_programs_institution_id ON public.programs(institution_id);
CREATE INDEX idx_programs_department_id ON public.programs(department_id);

-- Add trigger
CREATE TRIGGER update_programs_updated_at BEFORE UPDATE ON public.programs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- SECTION 3: ACADEMIC TABLES
-- =====================================================

-- Academic Years table
CREATE TABLE IF NOT EXISTS public.academic_years (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- e.g., "2024-2025"
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status academic_year_status DEFAULT 'upcoming',
    is_current BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(institution_id, name)
);

-- Enable RLS
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;

-- Add indexes
CREATE INDEX idx_academic_years_institution_id ON public.academic_years(institution_id);
CREATE INDEX idx_academic_years_status ON public.academic_years(status);
CREATE INDEX idx_academic_years_is_current ON public.academic_years(is_current);

-- Add trigger
CREATE TRIGGER update_academic_years_updated_at BEFORE UPDATE ON public.academic_years
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Semesters table
CREATE TABLE IF NOT EXISTS public.semesters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
    academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
    semester_number INTEGER NOT NULL CHECK (semester_number > 0),
    name TEXT NOT NULL, -- e.g., "Semester 1", "Semester 2"
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(program_id, academic_year_id, semester_number)
);

-- Enable RLS
ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;

-- Add indexes
CREATE INDEX idx_semesters_institution_id ON public.semesters(institution_id);
CREATE INDEX idx_semesters_program_id ON public.semesters(program_id);
CREATE INDEX idx_semesters_academic_year_id ON public.semesters(academic_year_id);

-- Add trigger
CREATE TRIGGER update_semesters_updated_at BEFORE UPDATE ON public.semesters
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Courses table
CREATE TABLE IF NOT EXISTS public.courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    credits INTEGER NOT NULL DEFAULT 0,
    course_type TEXT, -- Theory, Lab, Project, etc
    description TEXT,
    syllabus JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(institution_id, code)
);

-- Enable RLS  
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

-- Add indexes
CREATE INDEX idx_courses_institution_id ON public.courses(institution_id);
CREATE INDEX idx_courses_department_id ON public.courses(department_id);
CREATE INDEX idx_courses_code ON public.courses(code);

-- Add trigger
CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON public.courses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Sections table
CREATE TABLE IF NOT EXISTS public.sections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
    semester_id UUID NOT NULL REFERENCES public.semesters(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- e.g., "A", "B", "C"
    capacity INTEGER DEFAULT 60,
    current_strength INTEGER DEFAULT 0,
    class_teacher UUID REFERENCES public.profiles(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(semester_id, name)
);

-- Enable RLS
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;

-- Add indexes
CREATE INDEX idx_sections_institution_id ON public.sections(institution_id);
CREATE INDEX idx_sections_program_id ON public.sections(program_id);
CREATE INDEX idx_sections_semester_id ON public.sections(semester_id);

-- Add trigger
CREATE TRIGGER update_sections_updated_at BEFORE UPDATE ON public.sections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- SECTION 4: STUDENT TABLES
-- =====================================================

-- Students table
CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
    current_semester_id UUID REFERENCES public.semesters(id),
    current_section_id UUID REFERENCES public.sections(id),
    admission_number TEXT UNIQUE NOT NULL,
    roll_number TEXT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    date_of_birth DATE,
    gender TEXT,
    blood_group TEXT,
    address JSONB DEFAULT '{}',
    parent_info JSONB DEFAULT '{}',
    admission_date DATE DEFAULT CURRENT_DATE,
    graduation_date DATE,
    status TEXT DEFAULT 'active', -- active, graduated, dropped, suspended
    photo_url TEXT,
    documents JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- Add indexes
CREATE INDEX idx_students_institution_id ON public.students(institution_id);
CREATE INDEX idx_students_program_id ON public.students(program_id);
CREATE INDEX idx_students_admission_number ON public.students(admission_number);
CREATE INDEX idx_students_email ON public.students(email);
CREATE INDEX idx_students_status ON public.students(status);

-- Add trigger
CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON public.students
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- SECTION 5: STAFF TABLES
-- =====================================================

-- Staff table
CREATE TABLE IF NOT EXISTS public.staff (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    employee_id TEXT UNIQUE NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    designation TEXT,
    qualification TEXT,
    specialization TEXT[],
    date_of_joining DATE,
    employment_type TEXT, -- permanent, contract, visiting
    salary_info JSONB DEFAULT '{}',
    address JSONB DEFAULT '{}',
    emergency_contact JSONB DEFAULT '{}',
    status TEXT DEFAULT 'active',
    photo_url TEXT,
    documents JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

-- Add indexes
CREATE INDEX idx_staff_institution_id ON public.staff(institution_id);
CREATE INDEX idx_staff_department_id ON public.staff(department_id);
CREATE INDEX idx_staff_employee_id ON public.staff(employee_id);
CREATE INDEX idx_staff_email ON public.staff(email);

-- Add trigger
CREATE TRIGGER update_staff_updated_at BEFORE UPDATE ON public.staff
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- SECTION 6: ATTENDANCE TABLES
-- =====================================================

-- Daily Attendance table (Updated: 2025-01-16)
CREATE TABLE IF NOT EXISTS public.daily_attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    section_id UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    period_id UUID, -- Reference to time table period
    course_id UUID REFERENCES public.courses(id),
    status attendance_status NOT NULL DEFAULT 'absent',
    marked_by UUID REFERENCES public.profiles(id),
    marked_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, date, period_id)
);

-- Enable RLS
ALTER TABLE public.daily_attendance ENABLE ROW LEVEL SECURITY;

-- Add indexes
CREATE INDEX idx_daily_attendance_institution_id ON public.daily_attendance(institution_id);
CREATE INDEX idx_daily_attendance_student_id ON public.daily_attendance(student_id);
CREATE INDEX idx_daily_attendance_section_id ON public.daily_attendance(section_id);
CREATE INDEX idx_daily_attendance_date ON public.daily_attendance(date);
CREATE INDEX idx_daily_attendance_status ON public.daily_attendance(status);

-- Add trigger
CREATE TRIGGER update_daily_attendance_updated_at BEFORE UPDATE ON public.daily_attendance
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- SECTION 7: BILLING TABLES
-- =====================================================

-- Student Bills table
CREATE TABLE IF NOT EXISTS public.student_bills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
    semester_id UUID REFERENCES public.semesters(id),
    bill_number TEXT UNIQUE NOT NULL,
    bill_date DATE DEFAULT CURRENT_DATE,
    due_date DATE,
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    paid_amount DECIMAL(10,2) DEFAULT 0,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    fine_amount DECIMAL(10,2) DEFAULT 0,
    balance_amount DECIMAL(10,2) GENERATED ALWAYS AS (total_amount - paid_amount - discount_amount + fine_amount) STORED,
    status bill_status DEFAULT 'pending',
    items JSONB DEFAULT '[]', -- Array of fee items
    payment_history JSONB DEFAULT '[]',
    remarks TEXT,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE public.student_bills ENABLE ROW LEVEL SECURITY;

-- Add indexes
CREATE INDEX idx_student_bills_institution_id ON public.student_bills(institution_id);
CREATE INDEX idx_student_bills_student_id ON public.student_bills(student_id);
CREATE INDEX idx_student_bills_status ON public.student_bills(status);
CREATE INDEX idx_student_bills_bill_number ON public.student_bills(bill_number);

-- Add trigger
CREATE TRIGGER update_student_bills_updated_at BEFORE UPDATE ON public.student_bills
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Billing Receipts table
CREATE TABLE IF NOT EXISTS public.billing_receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    bill_id UUID NOT NULL REFERENCES public.student_bills(id) ON DELETE CASCADE,
    receipt_number TEXT UNIQUE NOT NULL,
    receipt_date DATE DEFAULT CURRENT_DATE,
    amount DECIMAL(10,2) NOT NULL,
    payment_mode TEXT NOT NULL, -- cash, cheque, online, card
    payment_details JSONB DEFAULT '{}',
    remarks TEXT,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE public.billing_receipts ENABLE ROW LEVEL SECURITY;

-- Add indexes
CREATE INDEX idx_billing_receipts_institution_id ON public.billing_receipts(institution_id);
CREATE INDEX idx_billing_receipts_bill_id ON public.billing_receipts(bill_id);
CREATE INDEX idx_billing_receipts_receipt_number ON public.billing_receipts(receipt_number);

-- Add trigger
CREATE TRIGGER update_billing_receipts_updated_at BEFORE UPDATE ON public.billing_receipts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- SECTION 8: TIMETABLE TABLES
-- =====================================================

-- Periods table (class periods definition)
CREATE TABLE IF NOT EXISTS public.periods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- e.g., "Period 1", "Lunch Break"
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    period_type TEXT DEFAULT 'class', -- class, break, lunch
    order_number INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(institution_id, order_number)
);

-- Enable RLS
ALTER TABLE public.periods ENABLE ROW LEVEL SECURITY;

-- Add indexes
CREATE INDEX idx_periods_institution_id ON public.periods(institution_id);
CREATE INDEX idx_periods_order_number ON public.periods(order_number);

-- Add trigger
CREATE TRIGGER update_periods_updated_at BEFORE UPDATE ON public.periods
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Timetables table
CREATE TABLE IF NOT EXISTS public.timetables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    section_id UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 1 AND day_of_week <= 7),
    period_id UUID NOT NULL REFERENCES public.periods(id) ON DELETE CASCADE,
    course_id UUID REFERENCES public.courses(id),
    staff_id UUID REFERENCES public.staff(id),
    room_number TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(section_id, day_of_week, period_id)
);

-- Enable RLS
ALTER TABLE public.timetables ENABLE ROW LEVEL SECURITY;

-- Add indexes
CREATE INDEX idx_timetables_institution_id ON public.timetables(institution_id);
CREATE INDEX idx_timetables_section_id ON public.timetables(section_id);
CREATE INDEX idx_timetables_staff_id ON public.timetables(staff_id);
CREATE INDEX idx_timetables_day_of_week ON public.timetables(day_of_week);

-- Add trigger
CREATE TRIGGER update_timetables_updated_at BEFORE UPDATE ON public.timetables
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- END OF TABLES DEFINITION
-- =====================================================
-- Total tables created: 19
-- Next: Run 02_functions.sql