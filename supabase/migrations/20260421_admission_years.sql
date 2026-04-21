-- Migration: 20260421_admission_years.sql
-- Purpose: Add per-program admission year tracking under Admission Settings.
-- Author:  admission module
-- Date:    2026-04-21
--
-- What this migration does:
--   1. Creates table `public.admission_years` — one row per (institution, program,
--      program_start_year). Stores a human-friendly label, program cohort years,
--      and an is_active flag.
--   2. Creates supporting indexes (institution, program, name).
--   3. Enables RLS and attaches 4 policies (select/insert/update/delete) that
--      follow the dynamic permission pattern used across the project.
--
-- Rollback: DROP TABLE public.admission_years;

-- ============================================================================
-- 1. Table + constraints + indexes
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admission_years (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    admission_year_name VARCHAR(150) NOT NULL,
    program_start_year INTEGER NOT NULL CHECK (program_start_year BETWEEN 2000 AND 2100),
    program_end_year INTEGER NOT NULL CHECK (program_end_year BETWEEN 2000 AND 2100),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT admission_years_year_order CHECK (program_end_year >= program_start_year),
    CONSTRAINT admission_years_unique_per_program UNIQUE (institution_id, program_id, program_start_year)
);

CREATE INDEX IF NOT EXISTS idx_admission_years_institution ON public.admission_years(institution_id);
CREATE INDEX IF NOT EXISTS idx_admission_years_program ON public.admission_years(program_id);
CREATE INDEX IF NOT EXISTS idx_admission_years_name ON public.admission_years(admission_year_name);

-- ============================================================================
-- 2. RLS policies (dynamic permission + institution-scope pattern)
-- ============================================================================

ALTER TABLE public.admission_years ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admission_years_select" ON public.admission_years;
CREATE POLICY "admission_years_select" ON public.admission_years
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR (user_has_permission('admission.settings.years.view')
            AND role_has_institution_access(institution_id))
    );

DROP POLICY IF EXISTS "admission_years_insert" ON public.admission_years;
CREATE POLICY "admission_years_insert" ON public.admission_years
    FOR INSERT WITH CHECK (
        is_super_admin() OR is_admin()
        OR (user_has_permission('admission.settings.years.create')
            AND role_has_institution_access(institution_id))
    );

DROP POLICY IF EXISTS "admission_years_update" ON public.admission_years;
CREATE POLICY "admission_years_update" ON public.admission_years
    FOR UPDATE USING (
        is_super_admin() OR is_admin()
        OR (user_has_permission('admission.settings.years.edit')
            AND role_has_institution_access(institution_id))
    );

DROP POLICY IF EXISTS "admission_years_delete" ON public.admission_years;
CREATE POLICY "admission_years_delete" ON public.admission_years
    FOR DELETE USING (
        is_super_admin() OR is_admin()
        OR (user_has_permission('admission.settings.years.delete')
            AND role_has_institution_access(institution_id))
    );
