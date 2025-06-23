-- Create staff_plans table
CREATE TABLE IF NOT EXISTS public.staff_plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    institution_id UUID NOT NULL REFERENCES public.institutions(id),
    degree_id UUID NOT NULL REFERENCES public.degrees(id),
    department_id UUID NOT NULL REFERENCES public.departments(id),
    program_id UUID NOT NULL REFERENCES public.programs(id),
    semester_id UUID NOT NULL REFERENCES public.semesters(id),
    academic_year_id UUID NOT NULL REFERENCES public.academic_years(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create staff_plan_courses table
CREATE TABLE IF NOT EXISTS public.staff_plan_courses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    staff_plan_id UUID NOT NULL REFERENCES public.staff_plans(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES public.courses(id),
    staff_id UUID NOT NULL REFERENCES public.staff(id),
    hours_allocated INTEGER NOT NULL,
    is_coordinator BOOLEAN DEFAULT false,
    is_combined BOOLEAN DEFAULT false,
    staff_type VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_staff_plans_institution ON public.staff_plans(institution_id);
CREATE INDEX IF NOT EXISTS idx_staff_plans_program ON public.staff_plans(program_id);
CREATE INDEX IF NOT EXISTS idx_staff_plans_semester ON public.staff_plans(semester_id);
CREATE INDEX IF NOT EXISTS idx_staff_plans_academic_year ON public.staff_plans(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_staff_plan_courses_staff_plan ON public.staff_plan_courses(staff_plan_id);
CREATE INDEX IF NOT EXISTS idx_staff_plan_courses_course ON public.staff_plan_courses(course_id);
CREATE INDEX IF NOT EXISTS idx_staff_plan_courses_staff ON public.staff_plan_courses(staff_id);

-- Add RLS policies
ALTER TABLE public.staff_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_plan_courses ENABLE ROW LEVEL SECURITY;

-- Create policies for staff_plans
CREATE POLICY "Enable read access for authenticated users" ON public.staff_plans
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Enable insert for authenticated users" ON public.staff_plans
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Enable update for authenticated users" ON public.staff_plans
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Enable delete for authenticated users" ON public.staff_plans
    FOR DELETE
    TO authenticated
    USING (true);

-- Create policies for staff_plan_courses
CREATE POLICY "Enable read access for authenticated users" ON public.staff_plan_courses
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Enable insert for authenticated users" ON public.staff_plan_courses
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Enable update for authenticated users" ON public.staff_plan_courses
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Enable delete for authenticated users" ON public.staff_plan_courses
    FOR DELETE
    TO authenticated
    USING (true);

-- Add triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_staff_plans_updated_at
    BEFORE UPDATE ON public.staff_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_staff_plan_courses_updated_at
    BEFORE UPDATE ON public.staff_plan_courses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column(); 