-- ============================================
-- Unified Communication Suite: Multilingual
-- Phase 4.4 — Multilingual SMS Support
-- ============================================

-- 1. Add language field to communication templates
ALTER TABLE public.admission_communication_templates
    ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';
-- Allows multiple templates with same name but different languages
-- Values: en | ta | hi

-- 2. Add preferred language field to leads
ALTER TABLE public.admission_leads
    ADD COLUMN IF NOT EXISTS preferred_language TEXT NOT NULL DEFAULT 'en';
-- en | ta | hi

-- 3. Indexes for language lookups
CREATE INDEX IF NOT EXISTS idx_comm_templates_language ON public.admission_communication_templates(language);
CREATE INDEX IF NOT EXISTS idx_leads_preferred_language ON public.admission_leads(preferred_language);
