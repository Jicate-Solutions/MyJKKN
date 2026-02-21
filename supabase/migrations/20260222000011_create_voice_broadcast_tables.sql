-- ============================================
-- Unified Communication Suite: Voice Broadcast
-- Phase 4.7 — Voice Broadcast (IVR)
-- ============================================

-- 1. Voice broadcast campaigns
CREATE TABLE IF NOT EXISTS public.admission_voice_broadcast_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,

    -- Audio content
    audio_url TEXT NOT NULL,           -- Pre-recorded message URL
    audio_duration_seconds INT,

    -- Audience
    audience_filter JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Lead filter criteria: { stages, sources, programs, tags, score_range, ... }
    total_recipients INT NOT NULL DEFAULT 0,

    -- Scheduling
    status TEXT NOT NULL DEFAULT 'draft',
    -- draft | scheduled | in_progress | paused | completed | cancelled
    scheduled_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    -- IVR options
    press_1_action TEXT,               -- connect_counselor | collect_callback | confirm_attendance
    press_1_connect_to TEXT,           -- Phone number or counselor assignment rule

    -- Stats (updated as campaign runs)
    total_attempted INT NOT NULL DEFAULT 0,
    total_answered INT NOT NULL DEFAULT 0,
    total_listened INT NOT NULL DEFAULT 0,  -- Listened >50% of audio
    total_pressed_1 INT NOT NULL DEFAULT 0,
    total_connected INT NOT NULL DEFAULT 0,
    total_failed INT NOT NULL DEFAULT 0,

    -- Settings
    max_retries INT NOT NULL DEFAULT 1,
    retry_interval_minutes INT NOT NULL DEFAULT 60,
    calling_hours JSONB DEFAULT '{"start":"09:00","end":"18:00","timezone":"Asia/Kolkata"}'::jsonb,

    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Individual broadcast call logs
CREATE TABLE IF NOT EXISTS public.admission_voice_broadcast_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.admission_voice_broadcast_campaigns(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES public.admission_leads(id) ON DELETE SET NULL,

    call_sid TEXT,
    to_number TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'queued',
    -- queued | initiated | answered | listened | pressed_1 | connected | busy | no_answer | failed

    duration_seconds INT,
    listened_seconds INT,
    pressed_1 BOOLEAN NOT NULL DEFAULT false,
    connected_to_counselor BOOLEAN NOT NULL DEFAULT false,

    attempt_number INT NOT NULL DEFAULT 1,
    error_message TEXT,

    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. RLS
ALTER TABLE public.admission_voice_broadcast_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_voice_broadcast_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "voice_broadcast_campaigns_access" ON public.admission_voice_broadcast_campaigns;
CREATE POLICY "voice_broadcast_campaigns_access" ON public.admission_voice_broadcast_campaigns
    FOR ALL USING (institution_id IN (
        SELECT institution_id FROM public.user_institution_access WHERE user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "voice_broadcast_logs_access" ON public.admission_voice_broadcast_logs;
CREATE POLICY "voice_broadcast_logs_access" ON public.admission_voice_broadcast_logs
    FOR ALL USING (institution_id IN (
        SELECT institution_id FROM public.user_institution_access WHERE user_id = auth.uid()
    ));

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_vb_campaigns_institution ON public.admission_voice_broadcast_campaigns(institution_id);
CREATE INDEX IF NOT EXISTS idx_vb_campaigns_status ON public.admission_voice_broadcast_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_vb_campaigns_scheduled ON public.admission_voice_broadcast_campaigns(scheduled_at)
    WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_vb_campaigns_created ON public.admission_voice_broadcast_campaigns(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vb_logs_campaign ON public.admission_voice_broadcast_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_vb_logs_institution ON public.admission_voice_broadcast_logs(institution_id);
CREATE INDEX IF NOT EXISTS idx_vb_logs_lead ON public.admission_voice_broadcast_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_vb_logs_status ON public.admission_voice_broadcast_logs(status);
CREATE INDEX IF NOT EXISTS idx_vb_logs_call_sid ON public.admission_voice_broadcast_logs(call_sid);
