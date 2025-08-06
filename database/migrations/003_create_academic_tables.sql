-- Academic Module Tables for MyJKKN Application

-- Academic Years Table
CREATE TABLE IF NOT EXISTS public.academic_years (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    institution_id uuid NOT NULL,
    academic_year_name character varying(100) NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT academic_years_pkey PRIMARY KEY (id),
    CONSTRAINT academic_years_institution_id_academic_year_name_key UNIQUE (institution_id, academic_year_name),
    CONSTRAINT academic_years_institution_id_fkey FOREIGN KEY (institution_id) 
        REFERENCES public.institutions(id) ON DELETE CASCADE
);

-- Degrees Table
CREATE TABLE IF NOT EXISTS public.degrees (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    institution_id uuid NOT NULL,
    degree_id character varying(20) NOT NULL,
    degree_name character varying(100) NOT NULL,
    degree_type character varying(10) NOT NULL,
    is_active boolean DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    CONSTRAINT degrees_pkey PRIMARY KEY (id),
    CONSTRAINT degrees_institution_id_fkey FOREIGN KEY (institution_id) 
        REFERENCES public.institutions(id) ON DELETE CASCADE
);

-- Departments Table
CREATE TABLE IF NOT EXISTS public.departments (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    institution_id uuid NOT NULL,
    degree_id uuid NOT NULL,
    department_code character varying(20) NOT NULL,
    department_name character varying(255) NOT NULL,
    is_active boolean DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT departments_pkey PRIMARY KEY (id),
    CONSTRAINT departments_institution_code_unique UNIQUE (institution_id, department_code),
    CONSTRAINT departments_degree_id_fkey FOREIGN KEY (degree_id) 
        REFERENCES public.degrees(id) ON DELETE RESTRICT,
    CONSTRAINT departments_institution_id_fkey FOREIGN KEY (institution_id) 
        REFERENCES public.institutions(id) ON DELETE RESTRICT
);

-- Programs Table
CREATE TABLE IF NOT EXISTS public.programs (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    institution_id uuid,
    degree_id uuid,
    department_id uuid,
    program_id text NOT NULL,
    program_name text NOT NULL,
    is_active boolean DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    CONSTRAINT programs_pkey PRIMARY KEY (id),
    CONSTRAINT programs_institution_id_program_id_key UNIQUE (institution_id, program_id),
    CONSTRAINT programs_degree_id_fkey FOREIGN KEY (degree_id) 
        REFERENCES public.degrees(id) ON DELETE CASCADE,
    CONSTRAINT programs_department_id_fkey FOREIGN KEY (department_id) 
        REFERENCES public.departments(id) ON DELETE CASCADE,
    CONSTRAINT programs_institution_id_fkey FOREIGN KEY (institution_id) 
        REFERENCES public.institutions(id) ON DELETE CASCADE
);

-- Semesters Table
CREATE TABLE IF NOT EXISTS public.semesters (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    institution_id uuid NOT NULL,
    degree_id uuid NOT NULL,
    department_id uuid NOT NULL,
    program_id uuid NOT NULL,
    semester_code character varying(20) NOT NULL,
    semester_name character varying(255) NOT NULL,
    semester_type character varying(50) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT semesters_pkey PRIMARY KEY (id),
    CONSTRAINT semesters_semester_code_unique UNIQUE (semester_code),
    CONSTRAINT unique_semester_per_program UNIQUE (institution_id, program_id, semester_name),
    CONSTRAINT semesters_degree_id_fkey FOREIGN KEY (degree_id) 
        REFERENCES public.degrees(id) ON DELETE CASCADE,
    CONSTRAINT semesters_department_id_fkey FOREIGN KEY (department_id) 
        REFERENCES public.departments(id) ON DELETE CASCADE,
    CONSTRAINT semesters_institution_id_fkey FOREIGN KEY (institution_id) 
        REFERENCES public.institutions(id) ON DELETE CASCADE,
    CONSTRAINT semesters_program_id_fkey FOREIGN KEY (program_id) 
        REFERENCES public.programs(id) ON DELETE CASCADE
);

-- Sections Table
CREATE TABLE IF NOT EXISTS public.sections (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    section_name text NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    institution_id uuid NOT NULL,
    degree_id uuid,
    department_id uuid,
    program_id uuid,
    semester_id uuid,
    CONSTRAINT sections_pkey PRIMARY KEY (id),
    CONSTRAINT sections_unique_per_semester UNIQUE (institution_id, degree_id, department_id, program_id, semester_id, section_name),
    CONSTRAINT sections_degree_id_fkey FOREIGN KEY (degree_id) 
        REFERENCES public.degrees(id) ON DELETE NO ACTION,
    CONSTRAINT sections_department_id_fkey FOREIGN KEY (department_id) 
        REFERENCES public.departments(id) ON DELETE NO ACTION,
    CONSTRAINT sections_institution_id_fkey FOREIGN KEY (institution_id) 
        REFERENCES public.institutions(id) ON DELETE CASCADE,
    CONSTRAINT sections_program_id_fkey FOREIGN KEY (program_id) 
        REFERENCES public.programs(id) ON DELETE NO ACTION,
    CONSTRAINT sections_semester_id_fkey FOREIGN KEY (semester_id) 
        REFERENCES public.semesters(id) ON DELETE NO ACTION
);

-- Courses Table
CREATE TABLE IF NOT EXISTS public.courses (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    institution_id uuid,
    course_code text NOT NULL,
    course_name text NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    CONSTRAINT courses_pkey PRIMARY KEY (id),
    CONSTRAINT courses_institution_id_course_code_key UNIQUE (institution_id, course_code),
    CONSTRAINT courses_institution_id_fkey FOREIGN KEY (institution_id) 
        REFERENCES public.institutions(id) ON DELETE CASCADE
);

-- Create Indexes for Academic Tables
CREATE INDEX idx_academic_years_institution_id ON public.academic_years(institution_id);
CREATE INDEX idx_academic_years_is_active ON public.academic_years(is_active);
CREATE INDEX idx_academic_years_name ON public.academic_years(academic_year_name);
CREATE INDEX idx_academic_years_dates ON public.academic_years(start_date, end_date);

CREATE INDEX idx_degrees_institution_id ON public.degrees(institution_id);
CREATE INDEX idx_degrees_degree_id ON public.degrees(degree_id);
CREATE INDEX idx_degrees_degree_type ON public.degrees(degree_type);

CREATE INDEX departments_institution_id_idx ON public.departments(institution_id);
CREATE INDEX departments_degree_id_idx ON public.departments(degree_id);
CREATE INDEX departments_code_idx ON public.departments(department_code);

CREATE INDEX programs_institution_id_idx ON public.programs(institution_id);
CREATE INDEX programs_degree_id_idx ON public.programs(degree_id);
CREATE INDEX programs_department_id_idx ON public.programs(department_id);
CREATE INDEX programs_program_id_idx ON public.programs(program_id);

CREATE INDEX idx_semesters_program_institution ON public.semesters(program_id, institution_id);

CREATE INDEX idx_sections_institution_id ON public.sections(institution_id);
CREATE INDEX idx_sections_degree_id ON public.sections(degree_id);
CREATE INDEX idx_sections_department_id ON public.sections(department_id);
CREATE INDEX idx_sections_program_id ON public.sections(program_id);
CREATE INDEX idx_sections_semester_id ON public.sections(semester_id);
CREATE INDEX idx_sections_section_name ON public.sections(section_name);
CREATE INDEX idx_sections_hierarchy ON public.sections(institution_id, degree_id, department_id, program_id, semester_id);

CREATE INDEX idx_courses_institution ON public.courses(institution_id);
CREATE INDEX idx_courses_code ON public.courses(course_code);

-- Create Triggers for Academic Tables
CREATE TRIGGER trigger_auto_populate_academic_year_institution
    BEFORE INSERT ON public.academic_years
    FOR EACH ROW EXECUTE FUNCTION auto_populate_academic_year_institution();

CREATE TRIGGER trg_degrees_set_institution_id
    BEFORE INSERT ON public.degrees
    FOR EACH ROW EXECUTE FUNCTION set_degree_institution_id();

CREATE TRIGGER trg_departments_set_institution_id
    BEFORE INSERT ON public.departments
    FOR EACH ROW EXECUTE FUNCTION set_department_institution_id();

CREATE TRIGGER set_departments_updated_at
    BEFORE UPDATE ON public.departments
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER trg_programs_set_institution_id
    BEFORE INSERT ON public.programs
    FOR EACH ROW EXECUTE FUNCTION set_program_institution_id();

CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.programs
    FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

CREATE TRIGGER trigger_validate_program_changes
    BEFORE UPDATE ON public.programs
    FOR EACH ROW EXECUTE FUNCTION validate_program_changes();

CREATE TRIGGER trg_semesters_set_institution_id
    BEFORE INSERT ON public.semesters
    FOR EACH ROW EXECUTE FUNCTION set_semester_institution_id();

CREATE TRIGGER trigger_validate_semester_program_hierarchy
    BEFORE UPDATE ON public.semesters
    FOR EACH ROW EXECUTE FUNCTION validate_semester_program_hierarchy();

CREATE TRIGGER trg_sections_set_institution_id
    BEFORE INSERT ON public.sections
    FOR EACH ROW EXECUTE FUNCTION set_section_institution_id();

CREATE TRIGGER trg_courses_set_institution_id
    BEFORE INSERT ON public.courses
    FOR EACH ROW EXECUTE FUNCTION set_course_institution_id();

-- Enable Row Level Security
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.degrees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;