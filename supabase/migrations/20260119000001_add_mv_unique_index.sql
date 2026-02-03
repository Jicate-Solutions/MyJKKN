-- =====================================================
-- Add Unique Index to Materialized View
-- Purpose: Enable CONCURRENT refresh of mv_engagement_overview
-- =====================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_engagement_overview_unique
ON mv_engagement_overview (
    COALESCE(section_id, '00000000-0000-0000-0000-000000000000'::UUID),
    COALESCE(semester_id, '00000000-0000-0000-0000-000000000000'::UUID),
    COALESCE(program_id, '00000000-0000-0000-0000-000000000000'::UUID),
    COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::UUID),
    COALESCE(institution_id, '00000000-0000-0000-0000-000000000000'::UUID)
);

COMMENT ON INDEX idx_mv_engagement_overview_unique IS 'Unique index required for concurrent materialized view refresh';
