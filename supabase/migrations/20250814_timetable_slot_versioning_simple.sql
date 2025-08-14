-- Migration: Add Timetable Slot Versioning System (Simplified)
-- Purpose: Track slot changes while preserving attendance history
-- Date: 2025-08-14

-- Step 1: Create the continuity tracking table
CREATE TABLE IF NOT EXISTS timetable_slot_continuity (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    continuity_group_id UUID NOT NULL,
    timetable_slot_id UUID NOT NULL,
    version_number INTEGER NOT NULL DEFAULT 1,
    is_current BOOLEAN DEFAULT true,
    valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_until DATE,
    change_reason TEXT,
    changed_by UUID,
    previous_slot_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 2: Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_slot_continuity_group 
ON timetable_slot_continuity(continuity_group_id);

CREATE INDEX IF NOT EXISTS idx_slot_continuity_slot 
ON timetable_slot_continuity(timetable_slot_id);

-- Step 3: Create unique constraint for version numbers
ALTER TABLE timetable_slot_continuity 
ADD CONSTRAINT unique_version_per_group 
UNIQUE (continuity_group_id, version_number);

-- Step 4: Create partial unique index for current version
CREATE UNIQUE INDEX IF NOT EXISTS unique_current_per_group 
ON timetable_slot_continuity (continuity_group_id) 
WHERE is_current = true;

-- Step 5: Add versioning columns to timetable_slots
ALTER TABLE timetable_slots 
ADD COLUMN IF NOT EXISTS continuity_group_id UUID;

ALTER TABLE timetable_slots 
ADD COLUMN IF NOT EXISTS slot_version INTEGER DEFAULT 1;

ALTER TABLE timetable_slots 
ADD COLUMN IF NOT EXISTS is_current_version BOOLEAN DEFAULT true;

-- Step 6: Initialize continuity groups for existing slots
UPDATE timetable_slots 
SET continuity_group_id = id 
WHERE continuity_group_id IS NULL;

-- Step 7: Create helper function to find related slots
CREATE OR REPLACE FUNCTION get_related_slot_ids(p_slot_id UUID)
RETURNS TABLE(slot_id UUID) AS $$
BEGIN
    -- First check if slot has continuity tracking
    IF EXISTS (
        SELECT 1 FROM timetable_slot_continuity 
        WHERE timetable_slot_id = p_slot_id
    ) THEN
        -- Return all slots in the same continuity group
        RETURN QUERY
        SELECT DISTINCT tsc.timetable_slot_id
        FROM timetable_slot_continuity tsc
        WHERE tsc.continuity_group_id = (
            SELECT continuity_group_id 
            FROM timetable_slot_continuity 
            WHERE timetable_slot_id = p_slot_id
            LIMIT 1
        );
    ELSE
        -- Check if slot has continuity_group_id directly
        IF EXISTS (
            SELECT 1 FROM timetable_slots 
            WHERE id = p_slot_id AND continuity_group_id IS NOT NULL
        ) THEN
            -- Return all slots with same continuity_group_id
            RETURN QUERY
            SELECT id
            FROM timetable_slots
            WHERE continuity_group_id = (
                SELECT continuity_group_id 
                FROM timetable_slots 
                WHERE id = p_slot_id
            );
        ELSE
            -- Return only the requested slot
            RETURN QUERY SELECT p_slot_id;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Step 8: Create function to get attendance across slot versions
CREATE OR REPLACE FUNCTION get_attendance_for_slot_versions(
    p_slot_id UUID,
    p_section_id UUID,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL
) RETURNS TABLE (
    attendance_id UUID,
    attendance_date DATE,
    period_slot_id UUID,
    period_name TEXT,
    course_name TEXT,
    student_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH related_slots AS (
        SELECT slot_id FROM get_related_slot_ids(p_slot_id)
    )
    SELECT 
        sa.id as attendance_id,
        sa.attendance_date,
        rs.slot_id as period_slot_id,
        (sa.attendance_data->rs.slot_id::text->>'period_name')::TEXT as period_name,
        (sa.attendance_data->rs.slot_id::text->>'course_name')::TEXT as course_name,
        jsonb_array_length(
            COALESCE(
                (sa.attendance_data->rs.slot_id::text->'students')::jsonb,
                '[]'::jsonb
            )
        ) as student_count
    FROM student_attendance sa
    CROSS JOIN related_slots rs
    WHERE sa.section_id = p_section_id
      AND sa.attendance_data ? rs.slot_id::text
      AND (p_start_date IS NULL OR sa.attendance_date >= p_start_date)
      AND (p_end_date IS NULL OR sa.attendance_date <= p_end_date)
    ORDER BY sa.attendance_date DESC;
END;
$$ LANGUAGE plpgsql;

-- Step 9: Add comments
COMMENT ON TABLE timetable_slot_continuity IS 
'Tracks version history of timetable slots to maintain attendance continuity across changes';

COMMENT ON FUNCTION get_related_slot_ids IS 
'Returns all slot IDs that are versions of the same logical slot';

COMMENT ON FUNCTION get_attendance_for_slot_versions IS 
'Retrieves attendance records across all versions of a timetable slot';