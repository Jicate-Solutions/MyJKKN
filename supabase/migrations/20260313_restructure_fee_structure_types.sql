-- Migration: Restructure fee_structure_type to support 5 types
-- Date: 2026-03-13
-- Purpose: Expand from 2 fee types (tuition_hostel, dayscholar) to 5 types
--          with conditional optional fees per type

-- 1. Drop old CHECK constraint
ALTER TABLE public.learners_profiles
  DROP CONSTRAINT IF EXISTS chk_fee_structure_type;

-- 2. Migrate existing 'dayscholar' rows to 'tuition_only'
--    Move dayscholar_fee value into tuition_fee if tuition_fee is null
UPDATE public.learners_profiles
SET
  fee_structure_type = 'tuition_only',
  tuition_fee = COALESCE(tuition_fee, dayscholar_fee)
WHERE fee_structure_type = 'dayscholar';

-- 3. Add new CHECK constraint with all 5 types
ALTER TABLE public.learners_profiles
  ADD CONSTRAINT chk_fee_structure_type
  CHECK (fee_structure_type IS NULL OR fee_structure_type IN (
    'tuition_hostel',
    'tuition_uniform_hospital',
    'tuition_instruments_hospital',
    'tuition_instruments',
    'tuition_only'
  ));

-- 4. Update column comment
COMMENT ON COLUMN public.learners_profiles.fee_structure_type IS
  'Fee structure: tuition_hostel (separate tuition+hostel), tuition_uniform_hospital (combined), tuition_instruments_hospital (combined), tuition_instruments (combined), tuition_only (tuition only)';
COMMENT ON COLUMN public.learners_profiles.dayscholar_fee IS 'DEPRECATED: retained for backward compatibility, no longer used for new records';
