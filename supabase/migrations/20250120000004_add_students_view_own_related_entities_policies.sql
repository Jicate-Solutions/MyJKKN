-- Add RLS policies to allow students to view all entities linked to their profile
-- This fixes "Not provided" issues when institution_id doesn't match

-- Departments
CREATE POLICY "students_view_own_department"
ON departments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM learners_profiles lp
    INNER JOIN profiles p ON p.learner_id = lp.id
    WHERE p.id = auth.uid()
      AND p.role = 'student'
      AND lp.department_id = departments.id
  )
);

-- Programs
CREATE POLICY "students_view_own_program"
ON programs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM learners_profiles lp
    INNER JOIN profiles p ON p.learner_id = lp.id
    WHERE p.id = auth.uid()
      AND p.role = 'student'
      AND lp.program_id = programs.id
  )
);

-- Semesters
CREATE POLICY "students_view_own_semester"
ON semesters
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM learners_profiles lp
    INNER JOIN profiles p ON p.learner_id = lp.id
    WHERE p.id = auth.uid()
      AND p.role = 'student'
      AND lp.semester_id = semesters.id
  )
);

-- Sections
CREATE POLICY "students_view_own_section"
ON sections
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM learners_profiles lp
    INNER JOIN profiles p ON p.learner_id = lp.id
    WHERE p.id = auth.uid()
      AND p.role = 'student'
      AND lp.section_id = sections.id
  )
);

-- Academic Years
CREATE POLICY "students_view_own_academic_year"
ON academic_years
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM learners_profiles lp
    INNER JOIN profiles p ON p.learner_id = lp.id
    WHERE p.id = auth.uid()
      AND p.role = 'student'
      AND lp.academic_year_id = academic_years.id
  )
);

-- Batches
CREATE POLICY "students_view_own_batch"
ON batches
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM learners_profiles lp
    INNER JOIN profiles p ON p.learner_id = lp.id
    WHERE p.id = auth.uid()
      AND p.role = 'student'
      AND lp.batch_id = batches.id
  )
);

-- Regulations
CREATE POLICY "students_view_own_regulation"
ON regulations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM learners_profiles lp
    INNER JOIN profiles p ON p.learner_id = lp.id
    WHERE p.id = auth.uid()
      AND p.role = 'student'
      AND lp.regulation_id = regulations.id
  )
);

-- Comments
COMMENT ON POLICY "students_view_own_department" ON departments IS 'Allows students to view their department';
COMMENT ON POLICY "students_view_own_program" ON programs IS 'Allows students to view their program';
COMMENT ON POLICY "students_view_own_semester" ON semesters IS 'Allows students to view their semester';
COMMENT ON POLICY "students_view_own_section" ON sections IS 'Allows students to view their section';
COMMENT ON POLICY "students_view_own_academic_year" ON academic_years IS 'Allows students to view their academic year';
COMMENT ON POLICY "students_view_own_batch" ON batches IS 'Allows students to view their batch';
COMMENT ON POLICY "students_view_own_regulation" ON regulations IS 'Allows students to view their regulation';
