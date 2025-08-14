-- Test Script: Verify Slot Versioning System
-- Run this to test if the versioning system is working correctly

-- Step 1: Check if tables exist
SELECT 'Checking tables...' as status;

SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'timetable_slot_continuity'
) as continuity_table_exists;

-- Step 2: Check if functions exist
SELECT 'Checking functions...' as status;

SELECT EXISTS (
    SELECT FROM pg_proc 
    WHERE proname = 'get_related_slot_ids'
) as get_related_slots_exists;

SELECT EXISTS (
    SELECT FROM pg_proc 
    WHERE proname = 'get_attendance_for_slot_versions'
) as get_attendance_versions_exists;

-- Step 3: Test the get_related_slot_ids function
-- Replace with an actual slot ID from your system
SELECT 'Testing get_related_slot_ids...' as status;

-- Example: Get related slots for a specific slot
-- SELECT * FROM get_related_slot_ids('your-slot-id-here');

-- Step 4: Test continuity group initialization
SELECT 'Checking continuity groups...' as status;

SELECT 
    COUNT(*) as total_slots,
    COUNT(continuity_group_id) as slots_with_continuity,
    COUNT(*) - COUNT(continuity_group_id) as slots_without_continuity
FROM timetable_slots;

-- Step 5: Check for any existing versioned slots
SELECT 'Checking for versioned slots...' as status;

SELECT 
    continuity_group_id,
    COUNT(*) as version_count,
    MIN(version_number) as min_version,
    MAX(version_number) as max_version
FROM timetable_slot_continuity
GROUP BY continuity_group_id
HAVING COUNT(*) > 1;

-- Step 6: Test attendance retrieval for a slot with versions
-- Replace with actual IDs from your system
SELECT 'Testing attendance retrieval with versions...' as status;

-- Example:
-- SELECT * FROM get_attendance_for_slot_versions(
--     'your-slot-id',
--     'your-section-id',
--     '2025-08-01',
--     '2025-08-31'
-- ) LIMIT 5;

-- Step 7: Verify indexes are created
SELECT 'Checking indexes...' as status;

SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'timetable_slot_continuity'
AND schemaname = 'public';

-- Summary
SELECT 'System ready for slot versioning!' as status;