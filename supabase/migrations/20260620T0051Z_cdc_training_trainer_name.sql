-- Migration: 20260620T0051Z_cdc_training_trainer_name
-- Date: 2026-06-20
-- Reason: BUG-004076 — Training Programme form (/cdc/training/new) had no field
--         to capture the trainer's name. Add a nullable trainer_name column to
--         cdc_training_programmes so the form can persist who delivered/leads
--         the programme.
-- Additive only · idempotent · snake_case.

ALTER TABLE public.cdc_training_programmes
  ADD COLUMN IF NOT EXISTS trainer_name text;

COMMENT ON COLUMN public.cdc_training_programmes.trainer_name
  IS 'Name of the trainer / facilitator delivering the programme (BUG-004076).';
