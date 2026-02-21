-- ============================================
-- Unified Communication Suite: Email Logs
-- Phase 1.1 — Email Infrastructure
-- ============================================

-- 1. New table: admission_email_logs
CREATE TABLE IF NOT EXISTS public.admission_email_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES public.admission_leads(id) ON DELETE SET NULL,
    campaign_id UUID REFERENCES public.admission_campaign_queue(id) ON DELETE SET NULL,
    template_id UUID REFERENCES public.admission_communication_templates(id) ON DELETE SET NULL,

    to_email TEXT NOT NULL,
    from_email TEXT NOT NULL,
    subject TEXT NOT NULL,

    -- Resend tracking
    resend_message_id TEXT,
    status TEXT NOT NULL DEFAULT 'queued',
    -- status values: queued | sent | delivered | opened | clicked | bounced | complained | failed

    opened_at TIMESTAMPTZ,
    clicked_at TIMESTAMPTZ,
    bounced_at TIMESTAMPTZ,
    error_message TEXT,

    -- Metadata
    tags JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. RLS
ALTER TABLE public.admission_email_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_logs_institution_access" ON public.admission_email_logs;
CREATE POLICY "email_logs_institution_access" ON public.admission_email_logs
    FOR ALL USING (
        institution_id IN (
            SELECT institution_id FROM public.user_institution_access
            WHERE user_id = auth.uid()
        )
    );

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_email_logs_institution ON public.admission_email_logs(institution_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_lead ON public.admission_email_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_campaign ON public.admission_email_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON public.admission_email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_created ON public.admission_email_logs(created_at DESC);
