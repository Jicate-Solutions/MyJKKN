-- Migration: Add finance/fee fields to learners_profiles
-- Date: 2026-03-04
-- Purpose: Store per-student fee structure data for admission finance tracking

-- Add fee columns to learners_profiles
ALTER TABLE public.learners_profiles
  ADD COLUMN IF NOT EXISTS application_fee NUMERIC(15,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS university_reg_fee NUMERIC(15,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fee_structure_type TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tuition_fee NUMERIC(15,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS hostel_fee NUMERIC(15,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS dayscholar_fee NUMERIC(15,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS uniform_fee NUMERIC(15,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS hospital_training_fee NUMERIC(15,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS placement_fee NUMERIC(15,2) DEFAULT NULL;

-- Add check constraint for fee_structure_type
ALTER TABLE public.learners_profiles
  ADD CONSTRAINT chk_fee_structure_type
  CHECK (fee_structure_type IS NULL OR fee_structure_type IN ('tuition_hostel', 'dayscholar'));

-- Add check constraints for non-negative fees
ALTER TABLE public.learners_profiles
  ADD CONSTRAINT chk_application_fee_positive CHECK (application_fee IS NULL OR application_fee >= 0),
  ADD CONSTRAINT chk_university_reg_fee_positive CHECK (university_reg_fee IS NULL OR university_reg_fee >= 0),
  ADD CONSTRAINT chk_tuition_fee_positive CHECK (tuition_fee IS NULL OR tuition_fee >= 0),
  ADD CONSTRAINT chk_hostel_fee_positive CHECK (hostel_fee IS NULL OR hostel_fee >= 0),
  ADD CONSTRAINT chk_dayscholar_fee_positive CHECK (dayscholar_fee IS NULL OR dayscholar_fee >= 0),
  ADD CONSTRAINT chk_uniform_fee_positive CHECK (uniform_fee IS NULL OR uniform_fee >= 0),
  ADD CONSTRAINT chk_hospital_training_fee_positive CHECK (hospital_training_fee IS NULL OR hospital_training_fee >= 0),
  ADD CONSTRAINT chk_placement_fee_positive CHECK (placement_fee IS NULL OR placement_fee >= 0);

-- Comment for documentation
COMMENT ON COLUMN public.learners_profiles.fee_structure_type IS 'tuition_hostel = separate tuition + hostel; dayscholar = combined dayscholar fee';
