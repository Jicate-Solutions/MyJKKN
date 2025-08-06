-- Students Module Table for MyJKKN Application

-- Students Table
CREATE TABLE IF NOT EXISTS public.students (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    admission_id uuid,
    father_name text NOT NULL,
    father_occupation text,
    father_mobile text,
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
    institution_id uuid,
    degree_id uuid,
    department_id uuid,
    program_id uuid,
    entry_type text NOT NULL,
    permanent_address_street text,
    permanent_address_taluk text,
    permanent_address_district text,
    permanent_address_pin_code text,
    permanent_address_state text,
    student_mobile text,
    student_email text,
    accommodation_type text,
    hostel_type text,
    bus_required boolean DEFAULT false,
    bus_route text,
    bus_pickup_location text,
    reference_type text,
    reference_name text,
    reference_contact text,
    roll_number text,
    student_photo_url text,
    college_email text,
    is_profile_complete boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    status public.student_status DEFAULT 'active'::public.student_status,
    semester_id uuid,
    section_id uuid,
    academic_year_id uuid,
    first_name text NOT NULL,
    last_name text,
    application_id text,
    CONSTRAINT students_pkey PRIMARY KEY (id),
    CONSTRAINT students_admission_id_fkey FOREIGN KEY (admission_id) 
        REFERENCES public.admissions(id) ON DELETE NO ACTION,
    CONSTRAINT students_academic_year_id_fkey FOREIGN KEY (academic_year_id) 
        REFERENCES public.academic_years(id) ON DELETE NO ACTION,
    CONSTRAINT students_degree_id_fkey FOREIGN KEY (degree_id) 
        REFERENCES public.degrees(id) ON DELETE NO ACTION,
    CONSTRAINT students_department_id_fkey FOREIGN KEY (department_id) 
        REFERENCES public.departments(id) ON DELETE NO ACTION,
    CONSTRAINT students_institution_id_fkey FOREIGN KEY (institution_id) 
        REFERENCES public.institutions(id) ON DELETE NO ACTION,
    CONSTRAINT students_program_id_fkey FOREIGN KEY (program_id) 
        REFERENCES public.programs(id) ON DELETE NO ACTION,
    CONSTRAINT students_section_id_fkey FOREIGN KEY (section_id) 
        REFERENCES public.sections(id) ON DELETE NO ACTION,
    CONSTRAINT students_semester_id_fkey FOREIGN KEY (semester_id) 
        REFERENCES public.semesters(id) ON DELETE NO ACTION
);

-- Create Indexes for Students Table
CREATE INDEX idx_students_admission_id ON public.students(admission_id);
CREATE INDEX idx_students_academic_year_id ON public.students(academic_year_id);
CREATE INDEX idx_students_created_at ON public.students(created_at DESC);
CREATE INDEX idx_students_degree_id ON public.students(degree_id);
CREATE INDEX idx_students_department_id ON public.students(department_id);
CREATE INDEX idx_students_first_name ON public.students(first_name);
CREATE INDEX idx_students_institution_department ON public.students(institution_id, department_id);
CREATE INDEX idx_students_institution_id ON public.students(institution_id);
CREATE INDEX idx_students_institution_program ON public.students(institution_id, program_id);
CREATE INDEX idx_students_is_profile_complete ON public.students(is_profile_complete);
CREATE INDEX idx_students_last_name ON public.students(last_name);
CREATE INDEX idx_students_program_id ON public.students(program_id);
CREATE INDEX idx_students_program_semester ON public.students(program_id, semester_id) 
    WHERE ((semester_id IS NOT NULL) AND (program_id IS NOT NULL));
CREATE INDEX idx_students_roll_number ON public.students(roll_number);
CREATE INDEX idx_students_section_id ON public.students(section_id);
CREATE INDEX idx_students_semester_id ON public.students(semester_id);
CREATE INDEX idx_students_status ON public.students(status);

-- Create Triggers for Students Table
CREATE TRIGGER trigger_auto_populate_student_institution
    BEFORE INSERT ON public.students
    FOR EACH ROW EXECUTE FUNCTION auto_populate_student_institution();

CREATE TRIGGER trigger_validate_student_semester_consistency
    BEFORE INSERT OR UPDATE ON public.students
    FOR EACH ROW EXECUTE FUNCTION validate_student_semester_consistency();

-- Enable Row Level Security
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;