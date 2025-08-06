-- Admission Management Tables for MyJKKN Application

-- Applications Table (for general application management)
CREATE TABLE IF NOT EXISTS public.applications (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    name character varying NOT NULL,
    url character varying NOT NULL,
    description text,
    roles_access character varying[] NOT NULL DEFAULT '{}'::character varying[],
    display_order integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    integration_type character varying NOT NULL,
    auth_method character varying NOT NULL,
    tags character varying[] DEFAULT '{}'::character varying[],
    support_contact jsonb,
    supported_platforms character varying NOT NULL,
    api_endpoints jsonb DEFAULT '[]'::jsonb,
    application_type character varying NOT NULL,
    data_sensitivity character varying NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    category_id uuid NOT NULL,
    subcategory_id uuid,
    icon_path text,
    screenshots text[],
    CONSTRAINT applications_pkey PRIMARY KEY (id)
);

-- Admissions Table
CREATE TABLE IF NOT EXISTS public.admissions (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    father_name text NOT NULL,
    father_occupation text,
    father_mobile text NOT NULL,
    mother_name text NOT NULL,
    mother_occupation text,
    mother_mobile text NOT NULL,
    date_of_birth text NOT NULL,
    gender text NOT NULL,
    religion text NOT NULL,
    community text NOT NULL,
    caste text,
    annual_income text,
    last_school text NOT NULL,
    board_of_study text NOT NULL,
    tenth_marks jsonb NOT NULL,
    twelfth_marks jsonb NOT NULL,
    medical_cutoff_marks text,
    engineering_cutoff_marks text,
    neet_roll_number text,
    counseling_applied boolean DEFAULT false,
    counseling_number text,
    first_graduate boolean DEFAULT false,
    quota text,
    category text,
    entry_type text NOT NULL,
    permanent_address_street text NOT NULL,
    permanent_address_taluk text,
    permanent_address_district text NOT NULL,
    permanent_address_pin_code text NOT NULL,
    permanent_address_state text NOT NULL,
    student_mobile text NOT NULL,
    student_email text NOT NULL,
    accommodation_type text NOT NULL,
    hostel_type text,
    bus_required boolean DEFAULT false,
    bus_route text,
    bus_pickup_location text,
    reference_type text,
    reference_name text,
    reference_contact text,
    status text NOT NULL DEFAULT 'pending'::text,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    created_by uuid,
    updated_by uuid,
    degree_id uuid,
    department_id uuid,
    program_id uuid,
    institution_id uuid,
    first_name text NOT NULL,
    last_name text DEFAULT ''::text,
    application_id text,
    CONSTRAINT admissions_pkey PRIMARY KEY (id),
    CONSTRAINT admissions_application_id_key UNIQUE (application_id),
    CONSTRAINT admissions_degree_id_fkey FOREIGN KEY (degree_id) 
        REFERENCES public.degrees(id) ON DELETE NO ACTION,
    CONSTRAINT admissions_department_id_fkey FOREIGN KEY (department_id) 
        REFERENCES public.departments(id) ON DELETE NO ACTION,
    CONSTRAINT admissions_institution_id_fkey FOREIGN KEY (institution_id) 
        REFERENCES public.institutions(id) ON DELETE CASCADE,
    CONSTRAINT admissions_program_id_fkey FOREIGN KEY (program_id) 
        REFERENCES public.programs(id) ON DELETE NO ACTION
);

-- Create Indexes for Admission Tables
CREATE INDEX idx_admissions_application_id ON public.admissions(application_id);
CREATE INDEX idx_admissions_created_at ON public.admissions(created_at);
CREATE INDEX idx_admissions_degree_id ON public.admissions(degree_id);
CREATE INDEX idx_admissions_department_id ON public.admissions(department_id);
CREATE INDEX idx_admissions_program_id ON public.admissions(program_id);
CREATE INDEX idx_admissions_status ON public.admissions(status);
CREATE INDEX idx_admissions_student_email ON public.admissions(student_email);
CREATE INDEX idx_admissions_student_mobile ON public.admissions(student_mobile);

-- Create Triggers for Admission Tables
CREATE TRIGGER set_admissions_updated_at
    BEFORE UPDATE ON public.admissions
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER set_institution_application_id_trigger
    BEFORE INSERT ON public.admissions
    FOR EACH ROW EXECUTE FUNCTION set_institution_application_id();

CREATE TRIGGER trigger_auto_populate_admission_institution
    BEFORE INSERT ON public.admissions
    FOR EACH ROW EXECUTE FUNCTION auto_populate_admission_institution();

-- Enable Row Level Security
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admissions ENABLE ROW LEVEL SECURITY;