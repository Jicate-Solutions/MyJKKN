-- ============================================
-- Unified Communication Suite: WhatsApp Forms
-- Phase 4.3 — WhatsApp In-Chat Forms
-- ============================================

-- 1. Form template definitions
CREATE TABLE IF NOT EXISTS public.wa_form_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    form_type TEXT NOT NULL DEFAULT 'buttons',
    -- buttons | list | flow

    -- Form definition (structure depends on form_type)
    definition JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- For buttons: { body, buttons: [{ id, title }] }
    -- For list: { body, button_text, sections: [{ title, rows: [{ id, title, description }] }] }
    -- For flow: { flow_id, flow_action, flow_params, screens: [...] }

    -- Mapping: which lead fields to update from responses
    field_mappings JSONB DEFAULT '{}'::jsonb,
    -- e.g., { "program_interest": "interested_program", "campus": "preferred_campus" }

    is_active BOOLEAN NOT NULL DEFAULT true,
    usage_count INT NOT NULL DEFAULT 0,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Form responses
CREATE TABLE IF NOT EXISTS public.wa_form_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    form_template_id UUID NOT NULL REFERENCES public.wa_form_templates(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES public.wa_conversations(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES public.admission_leads(id) ON DELETE SET NULL,

    contact_phone TEXT NOT NULL,
    response_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- { field_id: selected_value, ... }

    -- Whether the response was auto-synced to lead profile
    synced_to_lead BOOLEAN NOT NULL DEFAULT false,
    synced_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. RLS
ALTER TABLE public.wa_form_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_form_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_form_templates_access" ON public.wa_form_templates;
CREATE POLICY "wa_form_templates_access" ON public.wa_form_templates
    FOR ALL USING (institution_id IN (
        SELECT institution_id FROM public.user_institution_access WHERE user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "wa_form_responses_access" ON public.wa_form_responses;
CREATE POLICY "wa_form_responses_access" ON public.wa_form_responses
    FOR ALL USING (institution_id IN (
        SELECT institution_id FROM public.user_institution_access WHERE user_id = auth.uid()
    ));

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_wa_form_templates_institution ON public.wa_form_templates(institution_id);
CREATE INDEX IF NOT EXISTS idx_wa_form_templates_active ON public.wa_form_templates(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_wa_form_responses_institution ON public.wa_form_responses(institution_id);
CREATE INDEX IF NOT EXISTS idx_wa_form_responses_template ON public.wa_form_responses(form_template_id);
CREATE INDEX IF NOT EXISTS idx_wa_form_responses_conversation ON public.wa_form_responses(conversation_id);
CREATE INDEX IF NOT EXISTS idx_wa_form_responses_lead ON public.wa_form_responses(lead_id);
CREATE INDEX IF NOT EXISTS idx_wa_form_responses_created ON public.wa_form_responses(created_at DESC);
