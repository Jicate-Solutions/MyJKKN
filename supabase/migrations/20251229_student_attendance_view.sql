-- Migration: Add student self-service attendance view
-- Created: 2025-12-29
-- Description: Adds RLS policy and indexes for student portal attendance feature

BEGIN;

-- Add RLS policy for students to view their own attendance records
CREATE POLICY "student_attendance_select_own_student" ON student_attendance
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM profiles p
            JOIN learners_profiles lp ON p.learner_id = lp.id
            WHERE p.id = auth.uid()
            AND p.role = 'student'
            AND lp.section_id = student_attendance.section_id
            AND lp.lifecycle_status IN ('active', 'graduated')
        )
    );

-- Add performance indexes for student attendance queries
-- Optimize queries filtering by section and ordering by date
CREATE INDEX IF NOT EXISTS idx_student_attendance_section_date
    ON student_attendance(section_id, attendance_date DESC);

-- Optimize queries filtering by timetable and ordering by date
CREATE INDEX IF NOT EXISTS idx_student_attendance_timetable_date
    ON student_attendance(timetable_id, attendance_date DESC);

COMMIT;
