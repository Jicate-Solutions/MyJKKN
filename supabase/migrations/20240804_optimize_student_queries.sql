-- Add indexes to improve student query performance

-- Create indexes on foreign key columns if they don't exist
CREATE INDEX IF NOT EXISTS idx_students_institution_id ON students(institution_id);
CREATE INDEX IF NOT EXISTS idx_students_degree_id ON students(degree_id);
CREATE INDEX IF NOT EXISTS idx_students_department_id ON students(department_id);
CREATE INDEX IF NOT EXISTS idx_students_program_id ON students(program_id);
CREATE INDEX IF NOT EXISTS idx_students_semester_id ON students(semester_id);
CREATE INDEX IF NOT EXISTS idx_students_section_id ON students(section_id);
CREATE INDEX IF NOT EXISTS idx_students_academic_year_id ON students(academic_year_id);

-- Create composite indexes for common filter combinations
CREATE INDEX IF NOT EXISTS idx_students_institution_program ON students(institution_id, program_id);
CREATE INDEX IF NOT EXISTS idx_students_institution_department ON students(institution_id, department_id);
CREATE INDEX IF NOT EXISTS idx_students_program_semester ON students(program_id, semester_id);

-- Create indexes for text search
CREATE INDEX IF NOT EXISTS idx_students_first_name ON students(first_name);
CREATE INDEX IF NOT EXISTS idx_students_last_name ON students(last_name);
CREATE INDEX IF NOT EXISTS idx_students_roll_number ON students(roll_number);

-- Create index for status and profile completion
CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);
CREATE INDEX IF NOT EXISTS idx_students_is_profile_complete ON students(is_profile_complete);

-- Create index for sorting by created_at
CREATE INDEX IF NOT EXISTS idx_students_created_at ON students(created_at DESC);

-- Analyze tables to update statistics
ANALYZE students;
ANALYZE institutions;
ANALYZE degrees;
ANALYZE departments;
ANALYZE programs;
ANALYZE semesters;
ANALYZE sections;
ANALYZE academic_years;