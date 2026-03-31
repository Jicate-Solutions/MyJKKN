-- Migration: Add WhatsApp consent columns to admission_leads
-- Date: 2026-03-31
-- Purpose: Enable DPDPA-compliant WhatsApp messaging from expo capture, chat inbox,
--          segment service, re-engagement service, and consent service

ALTER TABLE admission_leads
ADD COLUMN IF NOT EXISTS wa_opt_in BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS wa_opt_in_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS wa_opt_in_source TEXT,
ADD COLUMN IF NOT EXISTS wa_opt_out_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_admission_leads_wa_opt_in
ON admission_leads(wa_opt_in) WHERE wa_opt_in = true;
