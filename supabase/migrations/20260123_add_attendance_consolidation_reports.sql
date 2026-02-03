-- =====================================================
-- ATTENDANCE CONSOLIDATION REPORTS TABLE
-- =====================================================
-- Purpose: Store generated institution-wide attendance consolidation reports
-- Created: 2026-01-23
-- Author: Claude Code
-- =====================================================

-- Create enum for report status
DO $$ BEGIN
    CREATE TYPE report_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create enum for report format
DO $$ BEGIN
    CREATE TYPE report_format AS ENUM ('pdf', 'excel', 'csv');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create attendance consolidation reports table
CREATE TABLE IF NOT EXISTS public.attendance_consolidation_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Basic Information
    report_name VARCHAR(255) NOT NULL,
    report_description TEXT,

    -- Institution & User
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    generated_by UUID NOT NULL REFERENCES public.profiles(id),

    -- Report Parameters (stored as JSONB for flexibility)
    report_params JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Example structure:
    -- {
    --   "dateFrom": "2026-01-01",
    --   "dateTo": "2026-01-31",
    --   "programs": ["uuid1", "uuid2"],
    --   "semesters": ["uuid1", "uuid2"],
    --   "sections": ["uuid1", "uuid2"],
    --   "students": ["uuid1", "uuid2"],
    --   "groupBy": "program" | "semester" | "section" | "student",
    --   "includeAbsentDetails": true,
    --   "includePeriodBreakdown": false
    -- }

    -- Report Results (stored as JSONB)
    report_data JSONB DEFAULT '{}'::jsonb,
    -- Example structure:
    -- {
    --   "summary": {
    --     "totalStudents": 150,
    --     "totalWorkingDays": 20,
    --     "averageAttendance": 85.5,
    --     "totalPresent": 2550,
    --     "totalAbsent": 450
    --   },
    --   "groups": [{
    --     "groupName": "Computer Science - Semester 1",
    --     "groupId": "uuid",
    --     "students": 30,
    --     "workingDays": 20,
    --     "avgAttendance": 88.5,
    --     "details": [...]
    --   }]
    -- }

    -- Report Status & Metadata
    status report_status DEFAULT 'pending',
    format report_format DEFAULT 'pdf',
    file_url TEXT, -- S3 or storage URL for generated file
    file_size BIGINT, -- File size in bytes

    -- Error Handling
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,

    -- Soft Delete
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES public.profiles(id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_consolidation_reports_institution
    ON public.attendance_consolidation_reports(institution_id)
    WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_consolidation_reports_generated_by
    ON public.attendance_consolidation_reports(generated_by)
    WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_consolidation_reports_status
    ON public.attendance_consolidation_reports(status);

CREATE INDEX IF NOT EXISTS idx_consolidation_reports_created_at
    ON public.attendance_consolidation_reports(created_at DESC);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_consolidation_reports_institution_status_date
    ON public.attendance_consolidation_reports(institution_id, status, created_at DESC)
    WHERE is_deleted = false;

-- GIN index for JSONB queries on report_params
CREATE INDEX IF NOT EXISTS idx_consolidation_reports_params
    ON public.attendance_consolidation_reports USING GIN (report_params);

-- GIN index for JSONB queries on report_data
CREATE INDEX IF NOT EXISTS idx_consolidation_reports_data
    ON public.attendance_consolidation_reports USING GIN (report_data);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_attendance_consolidation_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_attendance_consolidation_reports_updated_at
    BEFORE UPDATE ON public.attendance_consolidation_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_attendance_consolidation_reports_updated_at();

-- Add RLS policies
ALTER TABLE public.attendance_consolidation_reports ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view reports from their institution
CREATE POLICY "Users can view consolidation reports from their institution"
    ON public.attendance_consolidation_reports
    FOR SELECT
    USING (
        institution_id IN (
            SELECT institution_id
            FROM public.user_institution_access
            WHERE user_id = auth.uid()
            AND is_active = true
        )
        AND is_deleted = false
    );

-- Policy: Users with HOD or Admin role can create reports
CREATE POLICY "HOD and Admins can create consolidation reports"
    ON public.attendance_consolidation_reports
    FOR INSERT
    WITH CHECK (
        institution_id IN (
            SELECT uia.institution_id
            FROM public.user_institution_access uia
            JOIN public.profiles p ON p.id = uia.user_id
            WHERE uia.user_id = auth.uid()
            AND uia.is_active = true
            AND p.role IN ('super_admin', 'admin', 'hod', 'principal')
        )
    );

-- Policy: Users can update their own reports (status changes, etc.)
CREATE POLICY "Users can update their own consolidation reports"
    ON public.attendance_consolidation_reports
    FOR UPDATE
    USING (generated_by = auth.uid() AND is_deleted = false)
    WITH CHECK (generated_by = auth.uid());

-- Policy: Admins can delete reports (soft delete)
CREATE POLICY "Admins can delete consolidation reports"
    ON public.attendance_consolidation_reports
    FOR UPDATE
    USING (
        institution_id IN (
            SELECT uia.institution_id
            FROM public.user_institution_access uia
            JOIN public.profiles p ON p.id = uia.user_id
            WHERE uia.user_id = auth.uid()
            AND uia.is_active = true
            AND p.role IN ('super_admin', 'admin', 'principal')
        )
    );

-- Add comments for documentation
COMMENT ON TABLE public.attendance_consolidation_reports IS 'Stores generated institution-wide attendance consolidation reports with flexible parameters and results';
COMMENT ON COLUMN public.attendance_consolidation_reports.report_params IS 'JSONB field storing report generation parameters (date range, filters, grouping)';
COMMENT ON COLUMN public.attendance_consolidation_reports.report_data IS 'JSONB field storing calculated report results and statistics';
COMMENT ON COLUMN public.attendance_consolidation_reports.status IS 'Report generation status: pending, processing, completed, failed';
COMMENT ON COLUMN public.attendance_consolidation_reports.format IS 'Desired output format: pdf, excel, csv';
