-- ============================================================================
-- Migration: OKR Metric Registry v2 - Universal Auto-Metrics System
-- Created: 2026-01-31
-- Purpose: Create a flexible, extensible metric registry that works with:
--   - Any current or future MyJKKN module
--   - External API endpoints
--   - Database functions and queries
--   - Edge functions for complex calculations
--
-- GOAL: Zero manual data entry for OKR metrics
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Create New ENUM Types for Metric Registry
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE metric_source_type AS ENUM (
        'db_query',        -- Direct SQL query against Supabase tables
        'db_function',     -- Stored procedure/function call
        'edge_function',   -- Supabase Edge Function
        'external_api',    -- External HTTP endpoint
        'computed'         -- Computed from other metrics
    );
    RAISE NOTICE 'Created metric_source_type ENUM';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'metric_source_type ENUM already exists, skipping';
END $$;

DO $$ BEGIN
    CREATE TYPE metric_value_type AS ENUM (
        'number',          -- Raw numeric value
        'percentage',      -- 0-100 percentage
        'currency',        -- Money value (INR)
        'count',           -- Integer count
        'ratio',           -- Decimal ratio (0-1)
        'duration',        -- Time duration (hours/minutes)
        'score'            -- Computed score (e.g., 1-10)
    );
    RAISE NOTICE 'Created metric_value_type ENUM';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'metric_value_type ENUM already exists, skipping';
END $$;

DO $$ BEGIN
    CREATE TYPE metric_scope AS ENUM (
        'individual',      -- Single user/learner
        'section',         -- Class section
        'department',      -- Department level
        'program',         -- Academic program
        'institution',     -- Institution level
        'organization'     -- JKKN group level
    );
    RAISE NOTICE 'Created metric_scope ENUM';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'metric_scope ENUM already exists, skipping';
END $$;

DO $$ BEGIN
    CREATE TYPE metric_refresh_frequency AS ENUM (
        'realtime',        -- Every request (no cache)
        'minute_5',        -- Every 5 minutes
        'minute_15',       -- Every 15 minutes
        'hourly',          -- Every hour
        'daily',           -- Once per day
        'weekly',          -- Once per week
        'on_demand'        -- Only when explicitly requested
    );
    RAISE NOTICE 'Created metric_refresh_frequency ENUM';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'metric_refresh_frequency ENUM already exists, skipping';
END $$;

-- ============================================================================
-- STEP 2: Create Enhanced Metric Registry Table
-- ============================================================================

-- Drop old table if exists and recreate with new structure
DROP TABLE IF EXISTS public.okr_metric_registry CASCADE;

CREATE TABLE public.okr_metric_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity & Categorization
    metric_key TEXT NOT NULL UNIQUE,              -- 'attendance.learner_rate', 'billing.collection_rate'
    display_name TEXT NOT NULL,                   -- Human-readable name
    description TEXT,                             -- Detailed description
    module TEXT NOT NULL,                         -- Source module: 'attendance', 'billing', 'external', etc.
    category TEXT NOT NULL,                       -- 'academic', 'financial', 'engagement', 'operational', 'external'

    -- Scope & Applicability
    applicable_roles TEXT[] NOT NULL DEFAULT '{}', -- ['learner', 'faculty', 'hod', 'admin', 'staff']
    applicable_scopes metric_scope[] NOT NULL DEFAULT '{individual}',
    requires_context JSONB NOT NULL DEFAULT '{}', -- Required context params: {"institution_id": true, "semester_id": false}

    -- Source Configuration
    source_type metric_source_type NOT NULL,
    source_config JSONB NOT NULL,                 -- Flexible config based on source_type
    -- source_config examples:
    -- db_query: {"query": "SELECT ...", "params": ["profile_id", "institution_id"]}
    -- db_function: {"function_name": "get_metric", "params": {"p_profile_id": "{{profile_id}}"}}
    -- edge_function: {"function_name": "calc-metric", "method": "POST", "params": {...}}
    -- external_api: {"endpoint": "https://...", "method": "GET", "headers": {...}, "response_path": "data.value"}
    -- computed: {"formula": "metric_a + metric_b", "dependencies": ["metric_a", "metric_b"]}

    -- Value Configuration
    value_type metric_value_type NOT NULL DEFAULT 'number',
    unit TEXT NOT NULL DEFAULT '',                -- '%', 'INR', 'count', 'hours', etc.
    precision INTEGER DEFAULT 2,                  -- Decimal places
    min_value NUMERIC,                            -- Minimum possible value (for validation)
    max_value NUMERIC,                            -- Maximum possible value (for validation)
    default_baseline NUMERIC DEFAULT 0,           -- Default baseline for new KRs
    default_target NUMERIC,                       -- Suggested target value

    -- Sync & Caching
    refresh_frequency metric_refresh_frequency NOT NULL DEFAULT 'daily',
    cache_duration_seconds INTEGER DEFAULT 86400, -- Cache TTL in seconds (default 24h)
    last_global_sync_at TIMESTAMPTZ,             -- Last time this metric was synced globally

    -- Display & UI
    icon TEXT,                                    -- Icon identifier for UI
    color TEXT,                                   -- Color code for UI
    display_format TEXT,                          -- Format string: "{value}%", "₹{value}", etc.
    chart_type TEXT DEFAULT 'line',              -- 'line', 'bar', 'gauge', 'sparkline'

    -- Metadata
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,    -- System metrics can't be deleted
    tags TEXT[] DEFAULT '{}',                    -- Searchable tags
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_source_config CHECK (jsonb_typeof(source_config) = 'object'),
    CONSTRAINT valid_requires_context CHECK (jsonb_typeof(requires_context) = 'object')
);

COMMENT ON TABLE public.okr_metric_registry IS 'Universal metric registry for OKR auto-tracking. Supports any module, external APIs, and computed metrics.';

-- ============================================================================
-- STEP 3: Create Metric Execution Log Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.okr_metric_execution_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_key TEXT NOT NULL REFERENCES public.okr_metric_registry(metric_key) ON DELETE CASCADE,
    profile_id UUID,                              -- User context (if applicable)
    institution_id UUID,                          -- Institution context (if applicable)
    scope metric_scope NOT NULL DEFAULT 'individual',
    context_params JSONB,                         -- Full context used for execution

    -- Execution Details
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    execution_duration_ms INTEGER,                -- How long the query took
    source_type metric_source_type NOT NULL,

    -- Result
    raw_result JSONB,                             -- Raw response from source
    computed_value NUMERIC,                       -- Final computed value
    is_success BOOLEAN NOT NULL DEFAULT TRUE,
    error_message TEXT,

    -- Cache Info
    was_cached BOOLEAN DEFAULT FALSE,
    cache_key TEXT,
    cache_expires_at TIMESTAMPTZ
);

COMMENT ON TABLE public.okr_metric_execution_log IS 'Audit log for metric executions. Used for debugging and performance monitoring.';

-- ============================================================================
-- STEP 4: Create Metric Value Cache Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.okr_metric_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_key TEXT NOT NULL REFERENCES public.okr_metric_registry(metric_key) ON DELETE CASCADE,
    cache_key TEXT NOT NULL,                      -- Composite key: metric_key + context hash
    profile_id UUID,
    institution_id UUID,
    scope metric_scope NOT NULL DEFAULT 'individual',
    context_hash TEXT NOT NULL,                   -- Hash of context params for quick lookup

    -- Cached Value
    value NUMERIC NOT NULL,
    raw_data JSONB,                               -- Additional data from source
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,

    -- Metadata
    hit_count INTEGER DEFAULT 0,                  -- Cache hit counter
    last_accessed_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT unique_cache_entry UNIQUE (metric_key, cache_key)
);

COMMENT ON TABLE public.okr_metric_cache IS 'Cache for computed metric values to reduce repeated calculations.';

-- ============================================================================
-- STEP 5: Create External API Credentials Table (Encrypted)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.okr_external_api_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_name TEXT NOT NULL UNIQUE,                -- Identifier: 'google_fit', 'strava', etc.
    display_name TEXT NOT NULL,
    description TEXT,

    -- Auth Configuration (store encrypted in production)
    auth_type TEXT NOT NULL CHECK (auth_type IN ('api_key', 'oauth2', 'basic', 'bearer', 'custom')),
    auth_config JSONB NOT NULL,                   -- Encrypted auth details
    -- Example: {"api_key": "encrypted_key", "header_name": "X-API-Key"}
    -- Example: {"client_id": "...", "client_secret": "...", "token_url": "..."}

    -- Endpoint Configuration
    base_url TEXT NOT NULL,
    default_headers JSONB DEFAULT '{}',
    rate_limit_per_minute INTEGER DEFAULT 60,
    timeout_seconds INTEGER DEFAULT 30,

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_validated_at TIMESTAMPTZ,
    last_error TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.okr_external_api_credentials IS 'Credentials and configuration for external API integrations.';

-- ============================================================================
-- STEP 6: Create Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_metric_registry_module ON public.okr_metric_registry(module);
CREATE INDEX IF NOT EXISTS idx_metric_registry_category ON public.okr_metric_registry(category);
CREATE INDEX IF NOT EXISTS idx_metric_registry_active ON public.okr_metric_registry(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_metric_registry_source_type ON public.okr_metric_registry(source_type);
CREATE INDEX IF NOT EXISTS idx_metric_registry_roles ON public.okr_metric_registry USING GIN(applicable_roles);
CREATE INDEX IF NOT EXISTS idx_metric_registry_tags ON public.okr_metric_registry USING GIN(tags);

CREATE INDEX IF NOT EXISTS idx_metric_execution_log_metric ON public.okr_metric_execution_log(metric_key);
CREATE INDEX IF NOT EXISTS idx_metric_execution_log_profile ON public.okr_metric_execution_log(profile_id);
CREATE INDEX IF NOT EXISTS idx_metric_execution_log_time ON public.okr_metric_execution_log(executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_metric_cache_lookup ON public.okr_metric_cache(metric_key, cache_key);
CREATE INDEX IF NOT EXISTS idx_metric_cache_profile ON public.okr_metric_cache(profile_id);
CREATE INDEX IF NOT EXISTS idx_metric_cache_expires ON public.okr_metric_cache(expires_at);

-- ============================================================================
-- STEP 7: Create Helper Functions
-- ============================================================================

-- Function to generate cache key from context
CREATE OR REPLACE FUNCTION generate_metric_cache_key(
    p_metric_key TEXT,
    p_context JSONB
) RETURNS TEXT AS $$
BEGIN
    RETURN p_metric_key || ':' || md5(p_context::TEXT);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to check if cache is valid
CREATE OR REPLACE FUNCTION is_metric_cache_valid(
    p_metric_key TEXT,
    p_cache_key TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    v_expires_at TIMESTAMPTZ;
BEGIN
    SELECT expires_at INTO v_expires_at
    FROM public.okr_metric_cache
    WHERE metric_key = p_metric_key AND cache_key = p_cache_key;

    IF v_expires_at IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN v_expires_at > NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to get cached metric value
CREATE OR REPLACE FUNCTION get_cached_metric_value(
    p_metric_key TEXT,
    p_cache_key TEXT
) RETURNS NUMERIC AS $$
DECLARE
    v_value NUMERIC;
BEGIN
    UPDATE public.okr_metric_cache
    SET hit_count = hit_count + 1,
        last_accessed_at = NOW()
    WHERE metric_key = p_metric_key
      AND cache_key = p_cache_key
      AND expires_at > NOW()
    RETURNING value INTO v_value;

    RETURN v_value;
END;
$$ LANGUAGE plpgsql;

-- Function to set cached metric value
CREATE OR REPLACE FUNCTION set_cached_metric_value(
    p_metric_key TEXT,
    p_cache_key TEXT,
    p_profile_id UUID,
    p_institution_id UUID,
    p_scope metric_scope,
    p_context_hash TEXT,
    p_value NUMERIC,
    p_raw_data JSONB,
    p_ttl_seconds INTEGER
) RETURNS VOID AS $$
BEGIN
    INSERT INTO public.okr_metric_cache (
        metric_key, cache_key, profile_id, institution_id,
        scope, context_hash, value, raw_data, expires_at
    ) VALUES (
        p_metric_key, p_cache_key, p_profile_id, p_institution_id,
        p_scope, p_context_hash, p_value, p_raw_data,
        NOW() + (p_ttl_seconds || ' seconds')::INTERVAL
    )
    ON CONFLICT (metric_key, cache_key) DO UPDATE SET
        value = EXCLUDED.value,
        raw_data = EXCLUDED.raw_data,
        computed_at = NOW(),
        expires_at = EXCLUDED.expires_at,
        hit_count = 0;
END;
$$ LANGUAGE plpgsql;

-- Function to clean expired cache entries
CREATE OR REPLACE FUNCTION clean_expired_metric_cache() RETURNS INTEGER AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM public.okr_metric_cache
    WHERE expires_at < NOW();

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 8: Create Core Metric Calculation Functions
-- ============================================================================

-- Generic attendance rate calculator
CREATE OR REPLACE FUNCTION calc_attendance_rate(
    p_profile_id UUID,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL,
    p_institution_id UUID DEFAULT NULL
) RETURNS NUMERIC AS $$
DECLARE
    v_total INTEGER;
    v_present INTEGER;
    v_start DATE;
    v_end DATE;
BEGIN
    -- Default date range: current semester or last 90 days
    v_start := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '90 days');
    v_end := COALESCE(p_end_date, CURRENT_DATE);

    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE status IN ('present', 'late'))
    INTO v_total, v_present
    FROM public.student_attendance sa
    WHERE sa.student_id = p_profile_id
      AND sa.date BETWEEN v_start AND v_end
      AND (p_institution_id IS NULL OR sa.institution_id = p_institution_id);

    IF v_total = 0 THEN
        RETURN NULL; -- No data
    END IF;

    RETURN ROUND((v_present::NUMERIC / v_total) * 100, 2);
END;
$$ LANGUAGE plpgsql;

-- Fee collection rate calculator (fixed: uses final_amount and balance_amount columns)
CREATE OR REPLACE FUNCTION calc_fee_collection_rate(
    p_profile_id UUID DEFAULT NULL,
    p_institution_id UUID DEFAULT NULL,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL
) RETURNS NUMERIC AS $$
DECLARE
    v_total_billed NUMERIC;
    v_total_collected NUMERIC;
BEGIN
    SELECT
        COALESCE(SUM(final_amount), 0),
        COALESCE(SUM(final_amount - COALESCE(balance_amount, 0)), 0)
    INTO v_total_billed, v_total_collected
    FROM public.billing_student_bills
    WHERE (p_profile_id IS NULL OR student_id = p_profile_id)
      AND (p_institution_id IS NULL OR institution_id = p_institution_id)
      AND (p_start_date IS NULL OR created_at >= p_start_date)
      AND (p_end_date IS NULL OR created_at <= p_end_date);

    IF v_total_billed = 0 THEN
        RETURN 100; -- No bills = 100% collected
    END IF;

    RETURN ROUND((v_total_collected / v_total_billed) * 100, 2);
END;
$$ LANGUAGE plpgsql;

-- Learner enrollment count (fixed: cast lifecycle_status to TEXT for comparison)
CREATE OR REPLACE FUNCTION calc_enrollment_count(
    p_institution_id UUID DEFAULT NULL,
    p_department_id UUID DEFAULT NULL,
    p_program_id UUID DEFAULT NULL,
    p_status TEXT DEFAULT 'active'
) RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)
        FROM public.learners_profiles lp
        WHERE (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
          AND (p_department_id IS NULL OR lp.department_id = p_department_id)
          AND (p_program_id IS NULL OR lp.program_id = p_program_id)
          AND (p_status IS NULL OR lp.lifecycle_status::TEXT = p_status)
    );
END;
$$ LANGUAGE plpgsql;

-- Staff count by role (fixed: uses designation column instead of role)
CREATE OR REPLACE FUNCTION calc_staff_count(
    p_institution_id UUID DEFAULT NULL,
    p_department_id UUID DEFAULT NULL,
    p_role TEXT DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT TRUE
) RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)
        FROM public.staff s
        WHERE (p_institution_id IS NULL OR s.institution_id = p_institution_id)
          AND (p_department_id IS NULL OR s.department_id = p_department_id)
          AND (p_role IS NULL OR s.designation = p_role)
          AND s.is_active = p_is_active
    );
END;
$$ LANGUAGE plpgsql;

-- Course completion rate for a learner
CREATE OR REPLACE FUNCTION calc_course_completion_rate(
    p_profile_id UUID,
    p_semester_id UUID DEFAULT NULL
) RETURNS NUMERIC AS $$
DECLARE
    v_total INTEGER;
    v_completed INTEGER;
BEGIN
    -- This is a placeholder - adjust based on actual schema
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'completed')
    INTO v_total, v_completed
    FROM public.student_courses sc
    WHERE sc.student_id = p_profile_id
      AND (p_semester_id IS NULL OR sc.semester_id = p_semester_id);

    IF v_total = 0 THEN
        RETURN 0;
    END IF;

    RETURN ROUND((v_completed::NUMERIC / v_total) * 100, 2);
END;
$$ LANGUAGE plpgsql;

-- Resource utilization rate
CREATE OR REPLACE FUNCTION calc_resource_utilization(
    p_institution_id UUID,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL
) RETURNS NUMERIC AS $$
DECLARE
    v_total_capacity INTEGER;
    v_total_used INTEGER;
BEGIN
    SELECT
        COALESCE(SUM(r.capacity), 0),
        COUNT(DISTINCT rr.id)
    INTO v_total_capacity, v_total_used
    FROM public.resources r
    LEFT JOIN public.resource_reservations rr
        ON r.id = rr.resource_id
        AND rr.status = 'confirmed'
        AND (p_start_date IS NULL OR rr.start_date >= p_start_date)
        AND (p_end_date IS NULL OR rr.end_date <= p_end_date)
    WHERE r.institution_id = p_institution_id
      AND r.is_active = TRUE;

    IF v_total_capacity = 0 THEN
        RETURN 0;
    END IF;

    RETURN ROUND((v_total_used::NUMERIC / v_total_capacity) * 100, 2);
END;
$$ LANGUAGE plpgsql;

-- Application conversion rate
CREATE OR REPLACE FUNCTION calc_application_conversion_rate(
    p_institution_id UUID,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL
) RETURNS NUMERIC AS $$
DECLARE
    v_total INTEGER;
    v_converted INTEGER;
BEGIN
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE status IN ('enrolled', 'admitted', 'approved'))
    INTO v_total, v_converted
    FROM public.admissions
    WHERE institution_id = p_institution_id
      AND (p_start_date IS NULL OR created_at >= p_start_date)
      AND (p_end_date IS NULL OR created_at <= p_end_date);

    IF v_total = 0 THEN
        RETURN 0;
    END IF;

    RETURN ROUND((v_converted::NUMERIC / v_total) * 100, 2);
END;
$$ LANGUAGE plpgsql;

-- Timetable coverage rate
CREATE OR REPLACE FUNCTION calc_timetable_coverage(
    p_institution_id UUID,
    p_semester_id UUID DEFAULT NULL
) RETURNS NUMERIC AS $$
DECLARE
    v_total_slots INTEGER;
    v_filled_slots INTEGER;
BEGIN
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE staff_id IS NOT NULL)
    INTO v_total_slots, v_filled_slots
    FROM public.timetable_slots ts
    JOIN public.timetables t ON ts.timetable_id = t.id
    WHERE t.institution_id = p_institution_id
      AND (p_semester_id IS NULL OR t.semester_id = p_semester_id)
      AND t.is_active = TRUE;

    IF v_total_slots = 0 THEN
        RETURN 100; -- No slots = fully covered
    END IF;

    RETURN ROUND((v_filled_slots::NUMERIC / v_total_slots) * 100, 2);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 8b: Create Wrapper Functions for Consistent Signatures
-- All db_functions are called with (profile_id, institution_id, start_date, end_date)
-- ============================================================================

-- Wrapper for calc_enrollment_count with standardized 4-param signature
CREATE OR REPLACE FUNCTION calc_enrollment_count_wrapper(
    p_profile_id UUID,
    p_institution_id UUID,
    p_start_date DATE,
    p_end_date DATE
) RETURNS NUMERIC AS $$
BEGIN
    RETURN calc_enrollment_count(p_institution_id, NULL, NULL, 'active')::NUMERIC;
END;
$$ LANGUAGE plpgsql;

-- Wrapper for calc_staff_count with standardized 4-param signature
CREATE OR REPLACE FUNCTION calc_staff_count_wrapper(
    p_profile_id UUID,
    p_institution_id UUID,
    p_start_date DATE,
    p_end_date DATE
) RETURNS NUMERIC AS $$
BEGIN
    RETURN calc_staff_count(p_institution_id, NULL, NULL, TRUE)::NUMERIC;
END;
$$ LANGUAGE plpgsql;

-- Wrapper for calc_fee_collection_rate with standardized 4-param signature
CREATE OR REPLACE FUNCTION calc_fee_collection_rate_wrapper(
    p_profile_id UUID,
    p_institution_id UUID,
    p_start_date DATE,
    p_end_date DATE
) RETURNS NUMERIC AS $$
BEGIN
    RETURN calc_fee_collection_rate(p_profile_id, p_institution_id, p_start_date, p_end_date);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 9: Create Master Metric Executor Function
-- ============================================================================

-- This function executes any metric based on its registry configuration
CREATE OR REPLACE FUNCTION execute_metric(
    p_metric_key TEXT,
    p_context JSONB DEFAULT '{}'
) RETURNS TABLE (
    value NUMERIC,
    raw_data JSONB,
    source_type metric_source_type,
    executed_at TIMESTAMPTZ,
    was_cached BOOLEAN,
    error TEXT
) AS $$
DECLARE
    v_metric RECORD;
    v_cache_key TEXT;
    v_cached_value NUMERIC;
    v_result NUMERIC;
    v_raw_data JSONB;
    v_error TEXT;
    v_start_time TIMESTAMPTZ;
    v_duration_ms INTEGER;
    v_profile_id UUID;
    v_institution_id UUID;
    v_scope metric_scope;
    v_query TEXT;  -- For db_query execution
BEGIN
    v_start_time := clock_timestamp();

    -- Get metric configuration
    SELECT * INTO v_metric
    FROM public.okr_metric_registry
    WHERE metric_key = p_metric_key AND is_active = TRUE;

    IF v_metric IS NULL THEN
        RETURN QUERY SELECT
            NULL::NUMERIC,
            NULL::JSONB,
            NULL::metric_source_type,
            NOW(),
            FALSE,
            'Metric not found: ' || p_metric_key;
        RETURN;
    END IF;

    -- Extract context
    v_profile_id := (p_context->>'profile_id')::UUID;
    v_institution_id := (p_context->>'institution_id')::UUID;
    v_scope := COALESCE((p_context->>'scope')::metric_scope, 'individual');

    -- Check cache
    v_cache_key := generate_metric_cache_key(p_metric_key, p_context);
    IF v_metric.refresh_frequency != 'realtime' THEN
        v_cached_value := get_cached_metric_value(p_metric_key, v_cache_key);
        IF v_cached_value IS NOT NULL THEN
            RETURN QUERY SELECT
                v_cached_value,
                NULL::JSONB,
                v_metric.source_type,
                NOW(),
                TRUE,
                NULL::TEXT;
            RETURN;
        END IF;
    END IF;

    -- Execute based on source type
    BEGIN
        CASE v_metric.source_type
            WHEN 'db_function' THEN
                -- Execute database function
                -- Use %I for identifier quoting to prevent SQL injection
                EXECUTE format(
                    'SELECT %I($1, $2, $3, $4)',
                    v_metric.source_config->>'function_name'
                )
                INTO v_result
                USING
                    v_profile_id,
                    v_institution_id,
                    (p_context->>'start_date')::DATE,
                    (p_context->>'end_date')::DATE;

            WHEN 'db_query' THEN
                -- Execute raw SQL query (with parameter substitution)
                -- Note: UUIDs are validated by the ::UUID cast, scope is an enum
                -- Handle NULL values by replacing entire comparison with IS NULL check
                -- v_query is declared at function level

                v_query := v_metric.source_config->>'query';

                -- Handle profile_id substitution
                IF v_profile_id IS NOT NULL THEN
                    v_query := replace(v_query, '{{profile_id}}', v_profile_id::TEXT);
                ELSE
                    -- Replace patterns like "= '{{profile_id}}'" or "= '{{profile_id}}'::uuid" with "IS NULL"
                    v_query := regexp_replace(v_query, '=\s*''{{profile_id}}''(::uuid)?', 'IS NULL', 'gi');
                    -- Also handle remaining raw placeholders
                    v_query := replace(v_query, '{{profile_id}}', 'NULL');
                END IF;

                -- Handle institution_id substitution
                IF v_institution_id IS NOT NULL THEN
                    v_query := replace(v_query, '{{institution_id}}', v_institution_id::TEXT);
                ELSE
                    v_query := regexp_replace(v_query, '=\s*''{{institution_id}}''(::uuid)?', 'IS NULL', 'gi');
                    v_query := replace(v_query, '{{institution_id}}', 'NULL');
                END IF;

                -- Handle scope substitution (always has a value due to COALESCE)
                v_query := replace(v_query, '{{scope}}', v_scope::TEXT);

                -- Handle section_id substitution
                IF (p_context->>'section_id') IS NOT NULL THEN
                    v_query := replace(v_query, '{{section_id}}', (p_context->>'section_id'));
                ELSE
                    v_query := regexp_replace(v_query, '=\s*''{{section_id}}''(::uuid)?', 'IS NULL', 'gi');
                    v_query := replace(v_query, '{{section_id}}', 'NULL');
                END IF;

                EXECUTE v_query INTO v_result;

            WHEN 'computed' THEN
                -- Computed metrics are handled by the application layer
                v_result := NULL;
                v_error := 'Computed metrics must be evaluated by application';

            ELSE
                -- edge_function and external_api handled by application layer
                v_result := NULL;
                v_error := 'Source type requires application-layer execution';
        END CASE;

    EXCEPTION WHEN OTHERS THEN
        v_error := SQLERRM;
        v_result := NULL;
    END;

    -- Calculate duration
    v_duration_ms := EXTRACT(MILLISECONDS FROM clock_timestamp() - v_start_time)::INTEGER;

    -- Log execution
    INSERT INTO public.okr_metric_execution_log (
        metric_key, profile_id, institution_id, scope, context_params,
        execution_duration_ms, source_type, computed_value, is_success, error_message
    ) VALUES (
        p_metric_key, v_profile_id, v_institution_id, v_scope, p_context,
        v_duration_ms, v_metric.source_type, v_result, v_error IS NULL, v_error
    );

    -- Cache result if successful
    IF v_result IS NOT NULL AND v_metric.refresh_frequency != 'realtime' THEN
        PERFORM set_cached_metric_value(
            p_metric_key, v_cache_key, v_profile_id, v_institution_id,
            v_scope, md5(p_context::TEXT), v_result, v_raw_data,
            v_metric.cache_duration_seconds
        );
    END IF;

    RETURN QUERY SELECT
        v_result,
        v_raw_data,
        v_metric.source_type,
        NOW(),
        FALSE,
        v_error;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 10: Seed Initial Metrics
-- ============================================================================

-- Clear old auto-track sources (we're replacing with new registry)
-- Note: Keep old table for backward compatibility during migration
-- DELETE FROM public.okr_auto_track_sources;

-- Insert comprehensive metric definitions
INSERT INTO public.okr_metric_registry (
    metric_key, display_name, description, module, category,
    applicable_roles, applicable_scopes, requires_context,
    source_type, source_config,
    value_type, unit, default_baseline, default_target,
    refresh_frequency, cache_duration_seconds,
    icon, display_format, tags, is_system
) VALUES

-- ============================================================================
-- ATTENDANCE METRICS
-- ============================================================================
(
    'attendance.learner_rate',
    'Attendance Rate',
    'Disabled: Requires profile_id->learner_id mapping not in current schema',
    'attendance', 'academic',
    ARRAY['learner'], ARRAY['individual']::metric_scope[],
    '{"profile_id": true}'::JSONB,
    'db_function', '{"function_name": "calc_attendance_rate"}'::JSONB,
    'percentage', '%', 0, 90,
    'daily', 86400,
    'calendar-check', '{value}%', ARRAY['attendance', 'learner', 'academic'], FALSE
),
(
    'attendance.section_average',
    'Section Attendance Average',
    'Average attendance percentage for a class section',
    'attendance', 'academic',
    ARRAY['faculty', 'hod', 'admin'], ARRAY['section']::metric_scope[],
    '{"section_id": true}'::JSONB,
    'db_query', '{"query": "SELECT AVG(attendance_percentage) FROM student_attendance_summary WHERE section_id = ''{{section_id}}''"}'::JSONB,
    'percentage', '%', 0, 85,
    'daily', 86400,
    'users', '{value}%', ARRAY['attendance', 'section', 'academic'], TRUE
),
(
    'attendance.institution_average',
    'Institution Attendance',
    'Overall attendance percentage for the institution',
    'attendance', 'academic',
    ARRAY['admin', 'principal'], ARRAY['institution']::metric_scope[],
    '{"institution_id": true}'::JSONB,
    'db_query', '{"query": "SELECT AVG(attendance_percentage) FROM student_attendance_summary WHERE institution_id = ''{{institution_id}}''"}'::JSONB,
    'percentage', '%', 0, 85,
    'daily', 86400,
    'building', '{value}%', ARRAY['attendance', 'institution', 'academic'], TRUE
),
(
    'attendance.faculty_marking_rate',
    'Faculty Attendance Marking Rate',
    'Percentage of classes where attendance was marked on time',
    'attendance', 'operational',
    ARRAY['faculty', 'hod', 'admin'], ARRAY['individual', 'department']::metric_scope[],
    '{"profile_id": false, "department_id": false}'::JSONB,
    'db_query', '{"query": "SELECT (marked_on_time::NUMERIC / total_classes) * 100 FROM attendance_marking_stats WHERE profile_id = ''{{profile_id}}''"}'::JSONB,
    'percentage', '%', 0, 100,
    'daily', 86400,
    'clock', '{value}%', ARRAY['attendance', 'faculty', 'operational'], TRUE
),

-- ============================================================================
-- BILLING & FINANCE METRICS
-- ============================================================================
(
    'billing.collection_rate',
    'Fee Collection Rate',
    'Percentage of billed fees that have been collected',
    'billing', 'financial',
    ARRAY['admin', 'accountant'], ARRAY['institution', 'department']::metric_scope[],
    '{"institution_id": true}'::JSONB,
    'db_function', '{"function_name": "calc_fee_collection_rate_wrapper"}'::JSONB,
    'percentage', '%', 0, 95,
    'hourly', 3600,
    'indian-rupee', '{value}%', ARRAY['billing', 'finance', 'collection'], TRUE
),
(
    'billing.learner_payment_status',
    'Learner Fee Payment Status',
    'Percentage of fees paid by a specific learner',
    'billing', 'financial',
    ARRAY['learner', 'parent', 'admin'], ARRAY['individual']::metric_scope[],
    '{"profile_id": true}'::JSONB,
    'db_function', '{"function_name": "calc_fee_collection_rate_wrapper"}'::JSONB,
    'percentage', '%', 0, 100,
    'hourly', 3600,
    'wallet', '{value}%', ARRAY['billing', 'learner', 'payment'], TRUE
),
(
    'billing.outstanding_amount',
    'Outstanding Amount',
    'Total pending fee amount',
    'billing', 'financial',
    ARRAY['admin', 'accountant'], ARRAY['institution', 'individual']::metric_scope[],
    '{"institution_id": false, "profile_id": false}'::JSONB,
    'db_query', '{"query": "SELECT COALESCE(SUM(balance_amount), 0) as value FROM billing_student_bills WHERE institution_id = ''{{institution_id}}''::uuid AND balance_amount > 0"}'::JSONB,
    'currency', 'INR', 0, 0,
    'hourly', 3600,
    'alert-circle', '₹{value}', ARRAY['billing', 'outstanding', 'financial'], TRUE
),
(
    'billing.daily_collection',
    'Daily Collection Amount',
    'Total amount collected today',
    'billing', 'financial',
    ARRAY['admin', 'accountant'], ARRAY['institution']::metric_scope[],
    '{"institution_id": true}'::JSONB,
    'db_query', '{"query": "SELECT COALESCE(SUM(amount), 0) FROM billing_receipts WHERE institution_id = ''{{institution_id}}'' AND DATE(created_at) = CURRENT_DATE"}'::JSONB,
    'currency', 'INR', 0, NULL,
    'realtime', 0,
    'trending-up', '₹{value}', ARRAY['billing', 'daily', 'collection'], TRUE
),

-- ============================================================================
-- ENROLLMENT & LEARNER METRICS
-- ============================================================================
(
    'enrollment.active_count',
    'Active Learners',
    'Total number of active enrolled learners',
    'learners', 'academic',
    ARRAY['admin', 'hod'], ARRAY['institution', 'department', 'program']::metric_scope[],
    '{"institution_id": false, "department_id": false, "program_id": false}'::JSONB,
    'db_function', '{"function_name": "calc_enrollment_count_wrapper"}'::JSONB,
    'count', '', 0, NULL,
    'daily', 86400,
    'users', '{value}', ARRAY['enrollment', 'learners', 'count'], TRUE
),
(
    'enrollment.new_this_month',
    'New Enrollments This Month',
    'Number of new learners enrolled this month',
    'learners', 'academic',
    ARRAY['admin'], ARRAY['institution']::metric_scope[],
    '{"institution_id": true}'::JSONB,
    'db_query', '{"query": "SELECT COUNT(*) FROM learners_profiles WHERE institution_id = ''{{institution_id}}'' AND lifecycle_status::TEXT = ''active'' AND DATE_TRUNC(''month'', created_at) = DATE_TRUNC(''month'', CURRENT_DATE)"}'::JSONB,
    'count', '', 0, NULL,
    'daily', 86400,
    'user-plus', '{value}', ARRAY['enrollment', 'new', 'monthly'], TRUE
),
(
    'enrollment.retention_rate',
    'Learner Retention Rate',
    'Percentage of learners retained year-over-year',
    'learners', 'academic',
    ARRAY['admin', 'principal'], ARRAY['institution']::metric_scope[],
    '{"institution_id": true}'::JSONB,
    'db_query', '{"query": "SELECT ROUND((retained::NUMERIC / NULLIF(total, 0)) * 100, 2) FROM (SELECT COUNT(*) FILTER (WHERE lifecycle_status::TEXT IN (''active'', ''graduated'')) as retained, COUNT(*) as total FROM learners_profiles WHERE institution_id = ''{{institution_id}}'' AND created_at < CURRENT_DATE - INTERVAL ''1 year'') sub"}'::JSONB,
    'percentage', '%', 0, 90,
    'weekly', 604800,
    'refresh-cw', '{value}%', ARRAY['enrollment', 'retention'], TRUE
),

-- ============================================================================
-- STAFF METRICS
-- ============================================================================
(
    'staff.active_count',
    'Active Staff Count',
    'Total number of active staff members',
    'staff', 'operational',
    ARRAY['admin', 'hr'], ARRAY['institution', 'department']::metric_scope[],
    '{"institution_id": false, "department_id": false}'::JSONB,
    'db_function', '{"function_name": "calc_staff_count_wrapper"}'::JSONB,
    'count', '', 0, NULL,
    'daily', 86400,
    'briefcase', '{value}', ARRAY['staff', 'count', 'hr'], TRUE
),
(
    'staff.faculty_student_ratio',
    'Faculty-Student Ratio',
    'Number of students per faculty member',
    'staff', 'academic',
    ARRAY['admin', 'principal'], ARRAY['institution', 'department']::metric_scope[],
    '{"institution_id": true}'::JSONB,
    'db_query', '{"query": "SELECT ROUND((SELECT COUNT(*) FROM learners_profiles WHERE institution_id = ''{{institution_id}}'' AND lifecycle_status::TEXT = ''active'')::NUMERIC / NULLIF((SELECT COUNT(*) FROM staff WHERE institution_id = ''{{institution_id}}'' AND designation = ''faculty'' AND is_active = TRUE), 0), 1)"}'::JSONB,
    'ratio', ':1', 0, 20,
    'daily', 86400,
    'users', '1:{value}', ARRAY['staff', 'ratio', 'academic'], TRUE
),

-- ============================================================================
-- ACADEMIC METRICS
-- ============================================================================
(
    'academic.timetable_coverage',
    'Timetable Coverage',
    'Percentage of timetable slots assigned to faculty',
    'timetable', 'operational',
    ARRAY['admin', 'hod'], ARRAY['institution', 'department']::metric_scope[],
    '{"institution_id": true}'::JSONB,
    'db_function', '{"function_name": "calc_timetable_coverage"}'::JSONB,
    'percentage', '%', 0, 100,
    'daily', 86400,
    'calendar', '{value}%', ARRAY['timetable', 'coverage', 'academic'], TRUE
),
(
    'academic.course_count',
    'Active Courses',
    'Total number of active courses',
    'courses', 'academic',
    ARRAY['admin', 'hod'], ARRAY['institution', 'department', 'program']::metric_scope[],
    '{"institution_id": false}'::JSONB,
    'db_query', '{"query": "SELECT COUNT(*) FROM courses WHERE is_active = TRUE AND (institution_id = ''{{institution_id}}'' OR ''{{institution_id}}'' IS NULL)"}'::JSONB,
    'count', '', 0, NULL,
    'daily', 86400,
    'book-open', '{value}', ARRAY['courses', 'academic', 'count'], TRUE
),

-- ============================================================================
-- ADMISSIONS METRICS (Disabled: admissions table doesn't exist yet)
-- ============================================================================
(
    'admissions.applications_count',
    'Applications Received',
    'Disabled: Admissions module not yet implemented',
    'admissions', 'enrollment',
    ARRAY['admin'], ARRAY['institution']::metric_scope[],
    '{"institution_id": true}'::JSONB,
    'db_query', '{"query": "SELECT COUNT(*) FROM admissions WHERE institution_id = ''{{institution_id}}'' AND DATE_TRUNC(''year'', created_at) = DATE_TRUNC(''year'', CURRENT_DATE)"}'::JSONB,
    'count', '', 0, NULL,
    'daily', 86400,
    'file-text', '{value}', ARRAY['admissions', 'applications', 'count'], FALSE
),
(
    'admissions.conversion_rate',
    'Application Conversion Rate',
    'Disabled: Admissions module not yet implemented',
    'admissions', 'enrollment',
    ARRAY['admin'], ARRAY['institution']::metric_scope[],
    '{"institution_id": true}'::JSONB,
    'db_function', '{"function_name": "calc_application_conversion_rate"}'::JSONB,
    'percentage', '%', 0, 50,
    'weekly', 604800,
    'trending-up', '{value}%', ARRAY['admissions', 'conversion', 'enrollment'], FALSE
),

-- ============================================================================
-- RESOURCE METRICS
-- ============================================================================
(
    'resources.utilization_rate',
    'Resource Utilization',
    'Percentage of resources being actively used',
    'resources', 'operational',
    ARRAY['admin'], ARRAY['institution']::metric_scope[],
    '{"institution_id": true}'::JSONB,
    'db_function', '{"function_name": "calc_resource_utilization"}'::JSONB,
    'percentage', '%', 0, 80,
    'daily', 86400,
    'box', '{value}%', ARRAY['resources', 'utilization', 'operational'], TRUE
),
(
    'resources.maintenance_pending',
    'Pending Maintenance Tasks',
    'Number of overdue maintenance tasks',
    'resources', 'operational',
    ARRAY['admin', 'maintenance'], ARRAY['institution']::metric_scope[],
    '{"institution_id": true}'::JSONB,
    'db_query', '{"query": "SELECT COUNT(*) FROM resource_maintenance_schedules WHERE institution_id = ''{{institution_id}}'' AND status = ''pending'' AND scheduled_date < CURRENT_DATE"}'::JSONB,
    'count', '', 0, 0,
    'daily', 86400,
    'tool', '{value}', ARRAY['resources', 'maintenance', 'pending'], TRUE
),

-- ============================================================================
-- EXTERNAL API METRICS (Templates)
-- ============================================================================
(
    'external.google_classroom_assignments',
    'Google Classroom Assignments',
    'Assignment completion rate from Google Classroom',
    'external', 'academic',
    ARRAY['learner', 'faculty'], ARRAY['individual']::metric_scope[],
    '{"profile_id": true, "api_credentials": "google_classroom"}'::JSONB,
    'external_api', '{"endpoint": "/v1/courses/{course_id}/assignments", "method": "GET", "response_path": "completionRate", "auth_ref": "google_classroom"}'::JSONB,
    'percentage', '%', 0, 100,
    'hourly', 3600,
    'external-link', '{value}%', ARRAY['external', 'google', 'classroom', 'assignments'], FALSE
),
(
    'external.library_books_borrowed',
    'Library Books Borrowed',
    'Count of books currently borrowed from library system',
    'external', 'academic',
    ARRAY['learner'], ARRAY['individual']::metric_scope[],
    '{"profile_id": true, "api_credentials": "library_system"}'::JSONB,
    'external_api', '{"endpoint": "/api/borrowings/active", "method": "GET", "params": {"student_id": "{{profile_id}}"}, "response_path": "count", "auth_ref": "library_system"}'::JSONB,
    'count', 'books', 0, 5,
    'daily', 86400,
    'book', '{value}', ARRAY['external', 'library', 'books'], FALSE
)

ON CONFLICT (metric_key) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    source_config = EXCLUDED.source_config,
    updated_at = NOW();

-- ============================================================================
-- STEP 11: Create Triggers
-- ============================================================================

-- Updated_at trigger for metric registry
CREATE TRIGGER update_okr_metric_registry_updated_at
    BEFORE UPDATE ON public.okr_metric_registry
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Updated_at trigger for API credentials
CREATE TRIGGER update_okr_external_api_credentials_updated_at
    BEFORE UPDATE ON public.okr_external_api_credentials
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- STEP 12: Enable RLS
-- ============================================================================

ALTER TABLE public.okr_metric_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.okr_metric_execution_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.okr_metric_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.okr_external_api_credentials ENABLE ROW LEVEL SECURITY;

-- Metric registry is readable by all authenticated users (active metrics only for non-admins)
CREATE POLICY "okr_metric_registry_select" ON public.okr_metric_registry
    FOR SELECT TO authenticated
    USING (
        is_active = TRUE
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'super_admin')
        )
    );

-- Only admins can modify metric registry
CREATE POLICY "okr_metric_registry_admin" ON public.okr_metric_registry
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'super_admin')
        )
    );

CREATE POLICY "okr_metric_registry_update" ON public.okr_metric_registry
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'super_admin')
        )
    );

CREATE POLICY "okr_metric_registry_delete" ON public.okr_metric_registry
    FOR DELETE TO authenticated
    USING (
        is_system = FALSE
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'super_admin')
        )
    );

-- Execution log: users can see their own, admins can see all
CREATE POLICY "okr_metric_execution_log_select" ON public.okr_metric_execution_log
    FOR SELECT TO authenticated
    USING (
        profile_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'super_admin')
        )
    );

-- Cache: system access only (managed by functions)
CREATE POLICY "okr_metric_cache_system" ON public.okr_metric_cache
    FOR ALL TO authenticated
    USING (TRUE);

-- API credentials: admin only
CREATE POLICY "okr_external_api_credentials_admin" ON public.okr_external_api_credentials
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'super_admin')
        )
    );

COMMIT;

-- ============================================================================
-- USAGE EXAMPLES
-- ============================================================================

/*
-- Get a metric value for a learner
SELECT * FROM execute_metric(
    'attendance.learner_rate',
    '{"profile_id": "user-uuid-here", "institution_id": "inst-uuid-here"}'
);

-- Get institution-level metric
SELECT * FROM execute_metric(
    'billing.collection_rate',
    '{"institution_id": "inst-uuid-here", "start_date": "2026-01-01", "end_date": "2026-01-31"}'
);

-- List all available metrics for a learner
SELECT metric_key, display_name, description, unit, default_target
FROM okr_metric_registry
WHERE 'learner' = ANY(applicable_roles)
  AND is_active = TRUE
ORDER BY module, display_name;

-- Get metrics by category
SELECT * FROM okr_metric_registry
WHERE category = 'academic' AND is_active = TRUE;

-- Check cache status
SELECT metric_key, cache_key, value, computed_at, expires_at, hit_count
FROM okr_metric_cache
WHERE profile_id = 'user-uuid-here'
ORDER BY computed_at DESC;
*/
