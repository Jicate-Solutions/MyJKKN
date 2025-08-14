-- Migration: Add Timetable Slot Versioning System
-- Purpose: Track slot changes while preserving attendance history
-- Date: 2025-08-14

-- Create a table to track slot continuity (which slots are versions of each other)
CREATE TABLE IF NOT EXISTS timetable_slot_continuity (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    continuity_group_id UUID NOT NULL, -- Groups all versions of the same logical slot
    timetable_slot_id UUID NOT NULL REFERENCES timetable_slots(id),
    version_number INTEGER NOT NULL DEFAULT 1,
    is_current BOOLEAN DEFAULT true,
    valid_from DATE NOT NULL,
    valid_until DATE,
    change_reason TEXT,
    changed_by UUID REFERENCES profiles(id),
    previous_slot_id UUID REFERENCES timetable_slots(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure unique version numbers within a group
    CONSTRAINT unique_version_number UNIQUE (continuity_group_id, version_number)
);

-- Create partial unique index to ensure only one current version per continuity group
CREATE UNIQUE INDEX unique_current_version_per_group 
ON timetable_slot_continuity (continuity_group_id) 
WHERE is_current = true;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_slot_continuity_group ON timetable_slot_continuity(continuity_group_id);
CREATE INDEX IF NOT EXISTS idx_slot_continuity_slot ON timetable_slot_continuity(timetable_slot_id);
CREATE INDEX IF NOT EXISTS idx_slot_continuity_current ON timetable_slot_continuity(is_current) WHERE is_current = true;
CREATE INDEX IF NOT EXISTS idx_slot_continuity_dates ON timetable_slot_continuity(valid_from, valid_until);

-- Add continuity tracking to timetable_slots
ALTER TABLE timetable_slots 
ADD COLUMN IF NOT EXISTS continuity_group_id UUID,
ADD COLUMN IF NOT EXISTS slot_version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS replaced_by_slot_id UUID REFERENCES timetable_slots(id),
ADD COLUMN IF NOT EXISTS is_current_version BOOLEAN DEFAULT true;

-- Create a view for easy slot history access
CREATE OR REPLACE VIEW v_timetable_slot_history AS
SELECT 
    ts.id,
    ts.timetable_id,
    ts.day_of_week,
    ts.period_id,
    ts.course_id,
    ts.created_at,
    ts.updated_at,
    tsc.continuity_group_id,
    tsc.version_number,
    tsc.is_current,
    tsc.valid_from,
    tsc.valid_until,
    tsc.change_reason,
    tsc.previous_slot_id,
    p.period_name,
    c.course_name
FROM timetable_slots ts
LEFT JOIN timetable_slot_continuity tsc ON ts.id = tsc.timetable_slot_id
LEFT JOIN periods p ON ts.period_id = p.id
LEFT JOIN courses c ON ts.course_id = c.id;

-- Function to get all attendance for a slot including its history
CREATE OR REPLACE FUNCTION get_slot_attendance_with_history(
    p_slot_id UUID,
    p_section_id UUID,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL
) RETURNS TABLE (
    attendance_id UUID,
    attendance_date DATE,
    slot_id UUID,
    slot_version INTEGER,
    period_name TEXT,
    course_name TEXT,
    student_count INTEGER,
    is_current_slot BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    WITH slot_group AS (
        -- Get the continuity group for this slot
        SELECT COALESCE(
            tsc.continuity_group_id,
            ts.continuity_group_id,
            ts.id::UUID  -- If no continuity group, use slot id itself
        ) as continuity_group_id
        FROM timetable_slots ts
        LEFT JOIN timetable_slot_continuity tsc ON ts.id = tsc.timetable_slot_id
        WHERE ts.id = p_slot_id
    ),
    related_slots AS (
        -- Get all related slots in the continuity group
        SELECT 
            ts.id as timetable_slot_id,
            COALESCE(tsc.version_number, 1) as version_number,
            COALESCE(tsc.is_current, ts.is_current_version, true) as is_current,
            COALESCE(tsc.valid_from, ts.created_at::date) as valid_from,
            tsc.valid_until
        FROM timetable_slots ts
        LEFT JOIN timetable_slot_continuity tsc ON ts.id = tsc.timetable_slot_id
        WHERE ts.id = p_slot_id  -- Original slot
           OR ts.continuity_group_id IN (SELECT continuity_group_id FROM slot_group)
           OR tsc.continuity_group_id IN (SELECT continuity_group_id FROM slot_group)
    )
    SELECT 
        sa.id as attendance_id,
        sa.attendance_date,
        rs.timetable_slot_id as slot_id,
        rs.version_number as slot_version,
        (sa.attendance_data->rs.timetable_slot_id::text->>'period_name')::TEXT as period_name,
        (sa.attendance_data->rs.timetable_slot_id::text->>'course_name')::TEXT as course_name,
        jsonb_array_length(
            COALESCE(
                (sa.attendance_data->rs.timetable_slot_id::text->'students')::jsonb,
                '[]'::jsonb
            )
        ) as student_count,
        rs.is_current as is_current_slot
    FROM related_slots rs
    CROSS JOIN LATERAL (
        SELECT sa.*
        FROM student_attendance sa
        WHERE sa.section_id = p_section_id
          AND jsonb_exists(sa.attendance_data, rs.timetable_slot_id::text)
          AND (p_start_date IS NULL OR sa.attendance_date >= p_start_date)
          AND (p_end_date IS NULL OR sa.attendance_date <= p_end_date)
    ) sa
    ORDER BY sa.attendance_date DESC, rs.version_number DESC;
END;
$$ LANGUAGE plpgsql;

-- Add comment explaining the system
COMMENT ON TABLE timetable_slot_continuity IS 'Tracks the version history of timetable slots, maintaining continuity across changes';
COMMENT ON FUNCTION get_slot_attendance_with_history IS 'Retrieves all attendance records for a slot including its historical versions';