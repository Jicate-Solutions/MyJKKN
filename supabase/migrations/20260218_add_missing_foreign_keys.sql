-- Migration: Add missing foreign key constraints for departments table
-- Date: 2026-02-18
-- Description: Adds FK constraints for departments → institutions and departments → degrees
--              if they don't already exist. Also refreshes PostgREST schema cache.

-- Add missing FK for departments → institutions (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_departments_institution'
        AND table_name = 'departments'
    ) THEN
        ALTER TABLE departments
            ADD CONSTRAINT fk_departments_institution
            FOREIGN KEY (institution_id) REFERENCES institutions(id)
            ON DELETE CASCADE;
        RAISE NOTICE 'Added constraint fk_departments_institution';
    ELSE
        RAISE NOTICE 'Constraint fk_departments_institution already exists';
    END IF;
END $$;

-- Add missing FK for departments → degrees (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_departments_degree'
        AND table_name = 'departments'
    ) THEN
        ALTER TABLE departments
            ADD CONSTRAINT fk_departments_degree
            FOREIGN KEY (degree_id) REFERENCES degrees(id)
            ON DELETE CASCADE;
        RAISE NOTICE 'Added constraint fk_departments_degree';
    ELSE
        RAISE NOTICE 'Constraint fk_departments_degree already exists';
    END IF;
END $$;

-- Refresh PostgREST schema cache to pick up new constraints
NOTIFY pgrst, 'reload schema';
