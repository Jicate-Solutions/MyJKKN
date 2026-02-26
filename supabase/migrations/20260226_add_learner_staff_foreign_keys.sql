-- Migration: Add missing FK constraints to enable PostgREST relationship expansion
-- Date: 2026-02-26
-- Purpose: learners_profiles and staff tables have institution_id / section_id /
--          department_id UUID columns but no declared FOREIGN KEY constraints.
--          Without these constraints, PostgREST cannot resolve embedded-resource
--          joins (e.g. institution:institution_id(name)) and returns HTTP 400.
--          Adding the constraints allows the service layer to use either the
--          current two-step batch-lookup pattern OR native FK expansion.
--
-- Apply manually in Supabase SQL Editor (MCP is read-only).
-- All blocks use IF NOT EXISTS guards so re-running is safe.

-- ── learners_profiles → institutions ──────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_learners_profiles_institution'
      AND table_name = 'learners_profiles'
  ) THEN
    ALTER TABLE learners_profiles
      ADD CONSTRAINT fk_learners_profiles_institution
      FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── learners_profiles → sections ──────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_learners_profiles_section'
      AND table_name = 'learners_profiles'
  ) THEN
    ALTER TABLE learners_profiles
      ADD CONSTRAINT fk_learners_profiles_section
      FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── staff → institutions ───────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_staff_institution'
      AND table_name = 'staff'
  ) THEN
    ALTER TABLE staff
      ADD CONSTRAINT fk_staff_institution
      FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ── staff → departments ────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_staff_department'
      AND table_name = 'staff'
  ) THEN
    ALTER TABLE staff
      ADD CONSTRAINT fk_staff_department
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ── learners_profiles → degrees ───────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_learners_profiles_degree'
      AND table_name = 'learners_profiles'
  ) THEN
    ALTER TABLE learners_profiles
      ADD CONSTRAINT fk_learners_profiles_degree
      FOREIGN KEY (degree_id) REFERENCES degrees(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── learners_profiles → departments ───────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_learners_profiles_department'
      AND table_name = 'learners_profiles'
  ) THEN
    ALTER TABLE learners_profiles
      ADD CONSTRAINT fk_learners_profiles_department
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── learners_profiles → programs ──────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_learners_profiles_program'
      AND table_name = 'learners_profiles'
  ) THEN
    ALTER TABLE learners_profiles
      ADD CONSTRAINT fk_learners_profiles_program
      FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── learners_profiles → semesters ─────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_learners_profiles_semester'
      AND table_name = 'learners_profiles'
  ) THEN
    ALTER TABLE learners_profiles
      ADD CONSTRAINT fk_learners_profiles_semester
      FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── learners_profiles → academic_years ────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_learners_profiles_academic_year'
      AND table_name = 'learners_profiles'
  ) THEN
    ALTER TABLE learners_profiles
      ADD CONSTRAINT fk_learners_profiles_academic_year
      FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── learners_profiles → regulations ───────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_learners_profiles_regulation'
      AND table_name = 'learners_profiles'
  ) THEN
    ALTER TABLE learners_profiles
      ADD CONSTRAINT fk_learners_profiles_regulation
      FOREIGN KEY (regulation_id) REFERENCES regulations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── learners_profiles → batches ───────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_learners_profiles_batch'
      AND table_name = 'learners_profiles'
  ) THEN
    ALTER TABLE learners_profiles
      ADD CONSTRAINT fk_learners_profiles_batch
      FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Notify PostgREST to reload its schema cache so FK expansion works immediately
NOTIFY pgrst, 'reload schema';
