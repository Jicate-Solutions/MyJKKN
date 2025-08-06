-- Course Mappings Table for MyJKKN Application

-- Course Mappings Table (for mapping courses to programs/semesters)
CREATE TABLE IF NOT EXISTS public.course_mappings (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    course_id uuid NOT NULL,
    program_id uuid NOT NULL,
    semester_id uuid NOT NULL,
    section_id uuid,
    staff_id uuid,
    academic_year_id uuid NOT NULL,
    institution_id uuid NOT NULL,
    credits integer DEFAULT 0,
    course_type text, -- Theory, Practical, Tutorial, etc.
    is_elective boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    CONSTRAINT course_mappings_pkey PRIMARY KEY (id),
    CONSTRAINT course_mappings_unique_mapping UNIQUE (course_id, program_id, semester_id, section_id, academic_year_id),
    CONSTRAINT course_mappings_course_id_fkey FOREIGN KEY (course_id) 
        REFERENCES public.courses(id) ON DELETE CASCADE,
    CONSTRAINT course_mappings_program_id_fkey FOREIGN KEY (program_id) 
        REFERENCES public.programs(id) ON DELETE CASCADE,
    CONSTRAINT course_mappings_semester_id_fkey FOREIGN KEY (semester_id) 
        REFERENCES public.semesters(id) ON DELETE CASCADE,
    CONSTRAINT course_mappings_section_id_fkey FOREIGN KEY (section_id) 
        REFERENCES public.sections(id) ON DELETE CASCADE,
    CONSTRAINT course_mappings_staff_id_fkey FOREIGN KEY (staff_id) 
        REFERENCES public.staff(id) ON DELETE SET NULL,
    CONSTRAINT course_mappings_academic_year_id_fkey FOREIGN KEY (academic_year_id) 
        REFERENCES public.academic_years(id) ON DELETE CASCADE,
    CONSTRAINT course_mappings_institution_id_fkey FOREIGN KEY (institution_id) 
        REFERENCES public.institutions(id) ON DELETE CASCADE
);

-- Create Indexes for Course Mappings
CREATE INDEX idx_course_mappings_course_id ON public.course_mappings(course_id);
CREATE INDEX idx_course_mappings_program_id ON public.course_mappings(program_id);
CREATE INDEX idx_course_mappings_semester_id ON public.course_mappings(semester_id);
CREATE INDEX idx_course_mappings_section_id ON public.course_mappings(section_id);
CREATE INDEX idx_course_mappings_staff_id ON public.course_mappings(staff_id);
CREATE INDEX idx_course_mappings_academic_year_id ON public.course_mappings(academic_year_id);
CREATE INDEX idx_course_mappings_institution_id ON public.course_mappings(institution_id);
CREATE INDEX idx_course_mappings_composite ON public.course_mappings(institution_id, program_id, semester_id);

-- Create Trigger for updated_at
CREATE TRIGGER set_course_mappings_updated_at
    BEFORE UPDATE ON public.course_mappings
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Enable Row Level Security
ALTER TABLE public.course_mappings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Course Mappings
CREATE POLICY "Users can view course mappings in accessible institutions" ON public.course_mappings
    FOR SELECT TO authenticated
    USING (user_has_institution_access(auth.uid(), institution_id) OR (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'super_admin'::text
    )));

CREATE POLICY "course_mappings_admin_all" ON public.course_mappings
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])
    ));

CREATE POLICY "course_mappings_faculty_own_institution" ON public.course_mappings
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'faculty'::text 
        AND profiles.institution_id = course_mappings.institution_id 
        AND profiles.institution_id IS NOT NULL
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'faculty'::text 
        AND profiles.institution_id = course_mappings.institution_id 
        AND profiles.institution_id IS NOT NULL
    ));