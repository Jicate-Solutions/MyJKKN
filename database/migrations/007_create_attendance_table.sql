-- Student Attendance Table for MyJKKN Application

-- Student Attendance Table (referenced in the database but not created yet)
CREATE TABLE IF NOT EXISTS public.student_attendance (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL,
    course_id uuid NOT NULL,
    section_id uuid NOT NULL,
    semester_id uuid NOT NULL,
    academic_year_id uuid NOT NULL,
    attendance_date date NOT NULL,
    status text NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
    remarks text,
    marked_by uuid NOT NULL,
    marked_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_by uuid,
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    institution_id uuid NOT NULL,
    CONSTRAINT student_attendance_pkey PRIMARY KEY (id),
    CONSTRAINT student_attendance_unique_record UNIQUE (student_id, course_id, attendance_date),
    CONSTRAINT student_attendance_student_id_fkey FOREIGN KEY (student_id) 
        REFERENCES public.students(id) ON DELETE CASCADE,
    CONSTRAINT student_attendance_course_id_fkey FOREIGN KEY (course_id) 
        REFERENCES public.courses(id) ON DELETE CASCADE,
    CONSTRAINT student_attendance_section_id_fkey FOREIGN KEY (section_id) 
        REFERENCES public.sections(id) ON DELETE CASCADE,
    CONSTRAINT student_attendance_semester_id_fkey FOREIGN KEY (semester_id) 
        REFERENCES public.semesters(id) ON DELETE CASCADE,
    CONSTRAINT student_attendance_academic_year_id_fkey FOREIGN KEY (academic_year_id) 
        REFERENCES public.academic_years(id) ON DELETE CASCADE,
    CONSTRAINT student_attendance_institution_id_fkey FOREIGN KEY (institution_id) 
        REFERENCES public.institutions(id) ON DELETE CASCADE,
    CONSTRAINT student_attendance_marked_by_fkey FOREIGN KEY (marked_by) 
        REFERENCES public.profiles(id) ON DELETE NO ACTION,
    CONSTRAINT student_attendance_updated_by_fkey FOREIGN KEY (updated_by) 
        REFERENCES public.profiles(id) ON DELETE NO ACTION
);

-- Create Indexes for Student Attendance
CREATE INDEX idx_student_attendance_student_id ON public.student_attendance(student_id);
CREATE INDEX idx_student_attendance_course_id ON public.student_attendance(course_id);
CREATE INDEX idx_student_attendance_section_id ON public.student_attendance(section_id);
CREATE INDEX idx_student_attendance_semester_id ON public.student_attendance(semester_id);
CREATE INDEX idx_student_attendance_academic_year_id ON public.student_attendance(academic_year_id);
CREATE INDEX idx_student_attendance_institution_id ON public.student_attendance(institution_id);
CREATE INDEX idx_student_attendance_date ON public.student_attendance(attendance_date);
CREATE INDEX idx_student_attendance_status ON public.student_attendance(status);
CREATE INDEX idx_student_attendance_marked_by ON public.student_attendance(marked_by);
CREATE INDEX idx_student_attendance_composite ON public.student_attendance(institution_id, semester_id, section_id, attendance_date);

-- Create Trigger for updated_at
CREATE TRIGGER set_student_attendance_updated_at
    BEFORE UPDATE ON public.student_attendance
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Enable Row Level Security
ALTER TABLE public.student_attendance ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Student Attendance
CREATE POLICY "Faculty can manage attendance in their institution" ON public.student_attendance
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role IN ('faculty', 'administrator', 'super_admin')
        AND (profiles.institution_id = student_attendance.institution_id OR profiles.role = 'super_admin')
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role IN ('faculty', 'administrator', 'super_admin')
        AND (profiles.institution_id = student_attendance.institution_id OR profiles.role = 'super_admin')
    ));

CREATE POLICY "Students can view their own attendance" ON public.student_attendance
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM students s
        JOIN profiles p ON p.id = auth.uid()
        WHERE s.id = student_attendance.student_id
        AND s.student_email = p.email
    ));