-- =====================================================
-- Slot Versioning Functions
-- =====================================================
-- These functions support the slot versioning system
-- Run this migration in Supabase SQL Editor if functions are missing
-- =====================================================

-- Function to get all related slot IDs for a given slot
CREATE OR REPLACE FUNCTION get_related_slot_ids(p_slot_id UUID)
RETURNS TABLE(slot_id UUID)
LANGUAGE plpgsql
AS $$
DECLARE
    v_continuity_group_id UUID;
BEGIN
    -- Find the continuity group for this slot
    SELECT continuity_group_id INTO v_continuity_group_id
    FROM timetable_slot_continuity
    WHERE slot_id = p_slot_id
    LIMIT 1;
    
    -- If no continuity group found, just return the original slot
    IF v_continuity_group_id IS NULL THEN
        RETURN QUERY SELECT p_slot_id;
    ELSE
        -- Return all slots in the same continuity group
        RETURN QUERY
        SELECT tsc.slot_id
        FROM timetable_slot_continuity tsc
        WHERE tsc.continuity_group_id = v_continuity_group_id
        ORDER BY tsc.version_number;
    END IF;
END;
$$;

-- Function to get attendance for all versions of a slot
CREATE OR REPLACE FUNCTION get_attendance_for_slot_versions(
    p_slot_id UUID,
    p_section_id UUID,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS TABLE(
    attendance_id UUID,
    student_id UUID,
    timetable_slot_id UUID,
    attendance_date DATE,
    status TEXT,
    marked_by UUID,
    marked_at TIMESTAMPTZ,
    version_number INT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH related_slots AS (
        SELECT rs.slot_id 
        FROM get_related_slot_ids(p_slot_id) rs
    )
    SELECT 
        sa.id as attendance_id,
        sa.student_id,
        sa.timetable_slot_id,
        sa.attendance_date,
        sa.status,
        sa.marked_by,
        sa.marked_at,
        tsc.version_number
    FROM student_attendance sa
    INNER JOIN related_slots rs ON sa.timetable_slot_id = rs.slot_id
    LEFT JOIN timetable_slot_continuity tsc ON tsc.slot_id = sa.timetable_slot_id
    WHERE sa.section_id = p_section_id
        AND sa.attendance_date BETWEEN p_start_date AND p_end_date
    ORDER BY sa.attendance_date DESC, tsc.version_number DESC;
END;
$$;

-- Function to check if a slot has multiple versions
CREATE OR REPLACE FUNCTION has_slot_versions(p_slot_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM timetable_slot_continuity tsc1
    WHERE tsc1.continuity_group_id = (
        SELECT continuity_group_id 
        FROM timetable_slot_continuity 
        WHERE slot_id = p_slot_id
        LIMIT 1
    );
    
    RETURN v_count > 1;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_related_slot_ids(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_attendance_for_slot_versions(UUID, UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION has_slot_versions(UUID) TO authenticated;

-- Optional: Test the functions
-- SELECT * FROM get_related_slot_ids('your-slot-id-here');
-- SELECT * FROM has_slot_versions('your-slot-id-here');