-- =====================================================
-- Engagement Analytics Jobs Migration
-- Created: 2026-01-19
-- Purpose: Schedule background jobs for engagement metrics computation
-- =====================================================

-- Note: This migration assumes pg_cron extension is enabled
-- If not enabled, run: CREATE EXTENSION IF NOT EXISTS pg_cron;

-- =====================================================
-- Job 1: Compute Daily Engagement Metrics
-- Schedule: Every day at 2:00 AM
-- Purpose: Aggregate previous day's session data into daily metrics
-- =====================================================
SELECT cron.schedule(
    'compute-daily-engagement-metrics',
    '0 2 * * *', -- 2:00 AM every day
    $$
    SELECT compute_daily_engagement_metrics(CURRENT_DATE - INTERVAL '1 day');
    $$
);

-- =====================================================
-- Job 2: Compute Student Engagement Scores
-- Schedule: Every day at 3:00 AM
-- Purpose: Calculate student engagement scores and risk assessments
-- =====================================================
SELECT cron.schedule(
    'compute-student-engagement-scores',
    '0 3 * * *', -- 3:00 AM every day
    $$
    SELECT compute_student_engagement_scores(CURRENT_DATE);
    $$
);

-- =====================================================
-- Job 3: Refresh Engagement Overview Materialized View
-- Schedule: Every 15 minutes
-- Purpose: Keep dashboard metrics fresh
-- =====================================================
SELECT cron.schedule(
    'refresh-engagement-overview',
    '*/15 * * * *', -- Every 15 minutes
    $$
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_engagement_overview;
    $$
);

-- =====================================================
-- Job 4: Cleanup Orphaned Sessions
-- Schedule: Every day at 4:00 AM
-- Purpose: Close sessions that have been active for > 24 hours
-- =====================================================
SELECT cron.schedule(
    'cleanup-orphaned-sessions',
    '0 4 * * *', -- 4:00 AM every day
    $$
    SELECT cleanup_orphaned_sessions();
    $$
);

-- =====================================================
-- Verify Jobs Created
-- =====================================================
-- Query to check scheduled jobs:
-- SELECT * FROM cron.job WHERE jobname LIKE '%engagement%' OR jobname LIKE '%orphaned%';

-- =====================================================
-- Job Management Commands (for reference)
-- =====================================================
-- To unschedule a job:
-- SELECT cron.unschedule('job-name');

-- To view job run history:
-- SELECT * FROM cron.job_run_details
-- WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname LIKE '%engagement%')
-- ORDER BY start_time DESC
-- LIMIT 20;

-- To manually trigger a job:
-- SELECT compute_daily_engagement_metrics(CURRENT_DATE - INTERVAL '1 day');
-- SELECT compute_student_engagement_scores(CURRENT_DATE);
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_engagement_overview;
-- SELECT cleanup_orphaned_sessions();

-- =====================================================
-- Performance Monitoring
-- =====================================================
-- Create a function to log job execution stats
CREATE OR REPLACE FUNCTION log_engagement_job_stats()
RETURNS TABLE (
    job_name TEXT,
    last_run TIMESTAMPTZ,
    status TEXT,
    duration INTERVAL,
    return_message TEXT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT
        j.jobname as job_name,
        jr.start_time as last_run,
        jr.status,
        (jr.end_time - jr.start_time) as duration,
        jr.return_message
    FROM cron.job j
    LEFT JOIN LATERAL (
        SELECT *
        FROM cron.job_run_details
        WHERE jobid = j.jobid
        ORDER BY start_time DESC
        LIMIT 1
    ) jr ON true
    WHERE j.jobname IN (
        'compute-daily-engagement-metrics',
        'compute-student-engagement-scores',
        'refresh-engagement-overview',
        'cleanup-orphaned-sessions'
    )
    ORDER BY j.jobname;
$$;

COMMENT ON FUNCTION log_engagement_job_stats IS 'Returns execution stats for all engagement analytics jobs';

-- =====================================================
-- Initial Data Population (Optional)
-- =====================================================
-- Uncomment to populate historical data for the past 30 days
-- WARNING: This may take a while depending on data volume

/*
DO $$
DECLARE
    v_date DATE;
BEGIN
    -- Compute metrics for past 30 days
    FOR v_date IN
        SELECT generate_series(
            CURRENT_DATE - INTERVAL '30 days',
            CURRENT_DATE - INTERVAL '1 day',
            INTERVAL '1 day'
        )::DATE
    LOOP
        RAISE NOTICE 'Computing metrics for %', v_date;

        -- Compute daily metrics
        PERFORM compute_daily_engagement_metrics(v_date);

        -- Compute student scores (for the next day)
        PERFORM compute_student_engagement_scores(v_date + INTERVAL '1 day');
    END LOOP;

    -- Refresh materialized view
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_engagement_overview;

    RAISE NOTICE 'Historical data population complete';
END $$;
*/

-- =====================================================
-- End of migration
-- =====================================================

-- Verify jobs are scheduled
DO $$
DECLARE
    v_job_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_job_count
    FROM cron.job
    WHERE jobname IN (
        'compute-daily-engagement-metrics',
        'compute-student-engagement-scores',
        'refresh-engagement-overview',
        'cleanup-orphaned-sessions'
    );

    IF v_job_count = 4 THEN
        RAISE NOTICE 'All 4 engagement analytics jobs successfully scheduled';
    ELSE
        RAISE WARNING 'Expected 4 jobs but found %. Please check cron.job table.', v_job_count;
    END IF;
END $$;
