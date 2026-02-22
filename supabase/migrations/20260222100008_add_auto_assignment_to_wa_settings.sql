-- ============================================================================
-- Add Auto-Assignment Columns to whatsapp_settings
-- Created: 2026-02-22
-- Description: Adds round-robin, by-program, and by-source auto-assignment
--              configuration to the per-institution WhatsApp settings table.
-- ============================================================================

-- Add auto-assignment mode columns
ALTER TABLE public.wa_settings
  ADD COLUMN IF NOT EXISTS auto_assign_round_robin BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_assign_by_program BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_assign_by_source BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS program_assignments JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS source_assignments JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Comments
COMMENT ON COLUMN public.wa_settings.auto_assign_round_robin IS 'Enable round-robin auto-assignment of incoming WhatsApp conversations';
COMMENT ON COLUMN public.wa_settings.auto_assign_by_program IS 'Enable routing by program interest to designated counselors';
COMMENT ON COLUMN public.wa_settings.auto_assign_by_source IS 'Enable routing by lead source to designated counselors';
COMMENT ON COLUMN public.wa_settings.program_assignments IS 'Map of program name -> counselor_id for by-program routing. E.g. {"B.Tech CS": "uuid-1", "MBA": "uuid-2"}';
COMMENT ON COLUMN public.wa_settings.source_assignments IS 'Map of source_type -> counselor_id for by-source routing. E.g. {"organic": "uuid-1", "referral": "uuid-2"}';
