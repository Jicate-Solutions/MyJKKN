-- Migration: Add indexes for student queries to fix HOD timeout issue
-- Created: 2025-10-15
-- Issue: HOD users experiencing statement timeout (error 57014) when searching students
-- Root Cause: Missing indexes on students table foreign keys and composite filters
-- Solution: Add composite index for HOD queries + indexes on FK columns

-- Composite index for HOD queries (institution + department filtering)
-- This is the most critical index for HOD users who always filter by both institution and department
CREATE INDEX IF NOT EXISTS idx_students_institution_department
ON public.students(institution_id, department_id);

-- Foreign key indexes for join performance
-- These indexes improve the performance of joins with related tables
CREATE INDEX IF NOT EXISTS idx_students_degree_id
ON public.students(degree_id);

CREATE INDEX IF NOT EXISTS idx_students_department_id
ON public.students(department_id);

CREATE INDEX IF NOT EXISTS idx_students_program_id
ON public.students(program_id);

CREATE INDEX IF NOT EXISTS idx_students_semester_id
ON public.students(semester_id);

CREATE INDEX IF NOT EXISTS idx_students_section_id
ON public.students(section_id);

CREATE INDEX IF NOT EXISTS idx_students_academic_year_id
ON public.students(academic_year_id);

-- Index for status filtering (commonly used in queries)
CREATE INDEX IF NOT EXISTS idx_students_status
ON public.students(status);

-- Index for profile completion filtering
CREATE INDEX IF NOT EXISTS idx_students_profile_complete
ON public.students(is_profile_complete);

-- Add comment to document the purpose
COMMENT ON INDEX idx_students_institution_department IS
'Composite index for HOD queries filtering by institution and department - fixes timeout issue (error 57014)';

COMMENT ON INDEX idx_students_degree_id IS
'FK index for joins with degrees table';

COMMENT ON INDEX idx_students_department_id IS
'FK index for joins with departments table';

COMMENT ON INDEX idx_students_program_id IS
'FK index for joins with programs table';

COMMENT ON INDEX idx_students_semester_id IS
'FK index for joins with semesters table';

COMMENT ON INDEX idx_students_section_id IS
'FK index for joins with sections table';

COMMENT ON INDEX idx_students_academic_year_id IS
'FK index for joins with academic_years table';
