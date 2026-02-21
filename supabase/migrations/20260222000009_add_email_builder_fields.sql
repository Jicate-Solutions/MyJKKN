-- ============================================
-- Unified Communication Suite: Email Builder
-- Phase 4.5 — Drag-and-Drop Email Builder
-- ============================================

-- 1. Add email builder fields to communication templates
ALTER TABLE public.admission_communication_templates
    ADD COLUMN IF NOT EXISTS html_content TEXT,           -- Rendered HTML
    ADD COLUMN IF NOT EXISTS builder_json JSONB,           -- Builder block structure (for re-editing)
    ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,            -- Preview thumbnail
    ADD COLUMN IF NOT EXISTS is_starter_template BOOLEAN NOT NULL DEFAULT false;
