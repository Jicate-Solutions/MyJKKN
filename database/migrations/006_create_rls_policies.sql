-- Row Level Security Policies for MyJKKN Application

-- Academic Years RLS Policies
CREATE POLICY "Admin users can delete academic years" ON public.academic_years
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])
    ));

CREATE POLICY "Admin users can insert academic years" ON public.academic_years
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])
    ));

CREATE POLICY "Admin users can update academic years" ON public.academic_years
    FOR UPDATE TO authenticated
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

CREATE POLICY "Admin users can view all academic years" ON public.academic_years
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])
    ));

CREATE POLICY "Admins can manage academic years in their institutions" ON public.academic_years
    FOR ALL TO authenticated
    USING ((
        (SELECT profiles.is_super_admin FROM profiles WHERE profiles.id = auth.uid()) = true
    ) OR (
        (SELECT profiles.role FROM profiles WHERE profiles.id = auth.uid()) = 'administrator'::text 
        AND user_has_institution_access(auth.uid(), institution_id)
    ))
    WITH CHECK ((
        (SELECT profiles.is_super_admin FROM profiles WHERE profiles.id = auth.uid()) = true
    ) OR (
        (SELECT profiles.role FROM profiles WHERE profiles.id = auth.uid()) = 'administrator'::text 
        AND user_has_institution_access(auth.uid(), institution_id)
    ));

CREATE POLICY "Allow authenticated users to read academic_years" ON public.academic_years
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Faculty users can delete institution academic years" ON public.academic_years
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'faculty'::text 
        AND profiles.institution_id = academic_years.institution_id
    ));

CREATE POLICY "Faculty users can insert institution academic years" ON public.academic_years
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'faculty'::text 
        AND profiles.institution_id = academic_years.institution_id
    ));

CREATE POLICY "Faculty users can update institution academic years" ON public.academic_years
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'faculty'::text 
        AND profiles.institution_id = academic_years.institution_id
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'faculty'::text 
        AND profiles.institution_id = academic_years.institution_id
    ));

CREATE POLICY "Faculty users can view institution academic years" ON public.academic_years
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'faculty'::text 
        AND profiles.institution_id = academic_years.institution_id
    ));

CREATE POLICY "Users can view academic years from accessible institutions" ON public.academic_years
    FOR SELECT TO authenticated
    USING ((
        (SELECT profiles.is_super_admin FROM profiles WHERE profiles.id = auth.uid()) = true
    ) OR user_has_institution_access(auth.uid(), institution_id));

-- Admissions RLS Policies
CREATE POLICY "Admin users can delete admissions" ON public.admissions
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])
    ));

CREATE POLICY "Admin users can insert admissions" ON public.admissions
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])
    ));

CREATE POLICY "Admin users can update admissions" ON public.admissions
    FOR UPDATE TO authenticated
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

CREATE POLICY "Admin users can view all admissions" ON public.admissions
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])
    ));

CREATE POLICY "Faculty users can delete institution admissions" ON public.admissions
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'faculty'::text 
        AND profiles.institution_id = admissions.institution_id
    ));

CREATE POLICY "Faculty users can insert institution admissions" ON public.admissions
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'faculty'::text 
        AND profiles.institution_id = admissions.institution_id
    ));

CREATE POLICY "Faculty users can update institution admissions" ON public.admissions
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'faculty'::text 
        AND profiles.institution_id = admissions.institution_id
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'faculty'::text 
        AND profiles.institution_id = admissions.institution_id
    ));

CREATE POLICY "Faculty users can view institution admissions" ON public.admissions
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'faculty'::text 
        AND profiles.institution_id = admissions.institution_id
    ));

-- Students RLS Policies
CREATE POLICY "Admins can manage students in their institutions" ON public.students
    FOR ALL TO authenticated
    USING ((
        (SELECT profiles.is_super_admin FROM profiles WHERE profiles.id = auth.uid()) = true
    ) OR (
        (SELECT profiles.role FROM profiles WHERE profiles.id = auth.uid()) = 'administrator'::text 
        AND user_has_institution_access(auth.uid(), institution_id)
    ))
    WITH CHECK ((
        (SELECT profiles.is_super_admin FROM profiles WHERE profiles.id = auth.uid()) = true
    ) OR (
        (SELECT profiles.role FROM profiles WHERE profiles.id = auth.uid()) = 'administrator'::text 
        AND user_has_institution_access(auth.uid(), institution_id)
    ));

CREATE POLICY "Users can view students from accessible institutions" ON public.students
    FOR SELECT TO authenticated
    USING ((
        (SELECT profiles.is_super_admin FROM profiles WHERE profiles.id = auth.uid()) = true
    ) OR user_has_institution_access(auth.uid(), institution_id));

-- Degrees RLS Policies
CREATE POLICY "Users can view accessible degrees" ON public.degrees
    FOR SELECT TO authenticated
    USING (user_has_institution_access(auth.uid(), institution_id) OR (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'super_admin'::text
    )));

CREATE POLICY "degrees_admin_all" ON public.degrees
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

CREATE POLICY "degrees_faculty_own_institution" ON public.degrees
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'faculty'::text 
        AND profiles.institution_id = degrees.institution_id 
        AND profiles.institution_id IS NOT NULL
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'faculty'::text 
        AND profiles.institution_id = degrees.institution_id 
        AND profiles.institution_id IS NOT NULL
    ));

-- Departments RLS Policies
CREATE POLICY "Users can view accessible departments" ON public.departments
    FOR SELECT TO authenticated
    USING (user_has_institution_access(auth.uid(), institution_id) OR (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'super_admin'::text
    )));

CREATE POLICY "departments_admin_all" ON public.departments
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

CREATE POLICY "departments_faculty_own_institution" ON public.departments
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'faculty'::text 
        AND profiles.institution_id = departments.institution_id 
        AND profiles.institution_id IS NOT NULL
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'faculty'::text 
        AND profiles.institution_id = departments.institution_id 
        AND profiles.institution_id IS NOT NULL
    ));

-- Programs RLS Policies
CREATE POLICY "Users can view accessible programs" ON public.programs
    FOR SELECT TO authenticated
    USING (user_has_institution_access(auth.uid(), institution_id) OR (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'super_admin'::text
    )));

CREATE POLICY "programs_admin_all" ON public.programs
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

CREATE POLICY "programs_faculty_own_institution" ON public.programs
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'faculty'::text 
        AND profiles.institution_id = programs.institution_id 
        AND profiles.institution_id IS NOT NULL
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'faculty'::text 
        AND profiles.institution_id = programs.institution_id 
        AND profiles.institution_id IS NOT NULL
    ));

-- Semesters RLS Policies
CREATE POLICY "Users can view accessible semesters" ON public.semesters
    FOR SELECT TO authenticated
    USING (user_has_institution_access(auth.uid(), institution_id) OR (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'super_admin'::text
    )));

CREATE POLICY "semesters_admin_all" ON public.semesters
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

CREATE POLICY "semesters_faculty_own_institution" ON public.semesters
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'faculty'::text 
        AND profiles.institution_id = semesters.institution_id 
        AND profiles.institution_id IS NOT NULL
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'faculty'::text 
        AND profiles.institution_id = semesters.institution_id 
        AND profiles.institution_id IS NOT NULL
    ));

-- Sections RLS Policies
CREATE POLICY "Users can view accessible sections" ON public.sections
    FOR SELECT TO authenticated
    USING (user_has_institution_access(auth.uid(), institution_id) OR (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'super_admin'::text
    )));

CREATE POLICY "sections_admin_all" ON public.sections
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

CREATE POLICY "sections_faculty_own_institution" ON public.sections
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'faculty'::text 
        AND profiles.institution_id = sections.institution_id 
        AND profiles.institution_id IS NOT NULL
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'faculty'::text 
        AND profiles.institution_id = sections.institution_id 
        AND profiles.institution_id IS NOT NULL
    ));

-- Courses RLS Policies
CREATE POLICY "Users can view accessible courses" ON public.courses
    FOR SELECT TO authenticated
    USING (user_has_institution_access(auth.uid(), institution_id) OR (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'super_admin'::text
    )));

CREATE POLICY "courses_admin_all" ON public.courses
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

CREATE POLICY "courses_faculty_own_institution" ON public.courses
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'faculty'::text 
        AND profiles.institution_id = courses.institution_id 
        AND profiles.institution_id IS NOT NULL
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'faculty'::text 
        AND profiles.institution_id = courses.institution_id 
        AND profiles.institution_id IS NOT NULL
    ));