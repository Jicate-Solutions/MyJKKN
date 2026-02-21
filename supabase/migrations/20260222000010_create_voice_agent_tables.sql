-- ============================================
-- Unified Communication Suite: AI Voice Agents
-- Phase 4.6 — AI Voice Agents
-- ============================================

-- 1. Voice agent type enum
DO $$ BEGIN
    CREATE TYPE voice_agent_type AS ENUM (
        'lead_qualifier',
        'lead_reactivator',
        'auto_reminder'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Voice agent configurations per institution
CREATE TABLE IF NOT EXISTS public.ai_voice_agent_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    agent_type voice_agent_type NOT NULL,
    name TEXT NOT NULL,
    description TEXT,

    -- Script and behavior
    system_prompt TEXT NOT NULL,
    qualifying_questions JSONB DEFAULT '[]'::jsonb,
    -- [{ question, expected_responses, scoring_rule }]

    -- Scheduling
    is_active BOOLEAN NOT NULL DEFAULT false,
    calling_hours JSONB DEFAULT '{"start":"09:00","end":"18:00","timezone":"Asia/Kolkata"}'::jsonb,
    max_retries INT NOT NULL DEFAULT 2,
    retry_interval_hours INT NOT NULL DEFAULT 4,

    -- Trigger conditions
    trigger_conditions JSONB DEFAULT '{}'::jsonb,
    -- e.g., { "min_days_inactive": 14 } for reactivator
    -- e.g., { "on_lead_created": true } for qualifier

    -- Voice settings
    voice_provider TEXT DEFAULT 'exotel',  -- exotel | elevenlabs
    voice_id TEXT,
    language TEXT NOT NULL DEFAULT 'en',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Individual voice agent call records
CREATE TABLE IF NOT EXISTS public.ai_voice_agent_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    agent_config_id UUID NOT NULL REFERENCES public.ai_voice_agent_configs(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES public.admission_leads(id) ON DELETE SET NULL,

    call_sid TEXT,                      -- Exotel call identifier
    to_number TEXT NOT NULL,
    from_number TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'queued',
    -- queued | initiated | ringing | in-progress | completed | busy | no-answer | failed | cancelled

    duration_seconds INT,
    recording_url TEXT,

    -- AI conversation transcript
    transcript JSONB DEFAULT '[]'::jsonb,
    -- [{ role: 'agent'|'prospect', content, timestamp }]

    -- AI assessment
    outcome TEXT,
    -- qualified | not_qualified | callback_requested | not_reachable | voicemail | other
    intent_score INT,                  -- 0-100
    qualification_data JSONB DEFAULT '{}'::jsonb,
    -- { answers: [{ question, response, score }], recommended_action }

    -- Follow-up actions taken
    lead_stage_updated_to TEXT,
    follow_up_scheduled_at TIMESTAMPTZ,
    notes TEXT,

    attempt_number INT NOT NULL DEFAULT 1,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. RLS
ALTER TABLE public.ai_voice_agent_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_voice_agent_calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "voice_agent_configs_access" ON public.ai_voice_agent_configs;
CREATE POLICY "voice_agent_configs_access" ON public.ai_voice_agent_configs
    FOR ALL USING (institution_id IN (
        SELECT institution_id FROM public.user_institution_access WHERE user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "voice_agent_calls_access" ON public.ai_voice_agent_calls;
CREATE POLICY "voice_agent_calls_access" ON public.ai_voice_agent_calls
    FOR ALL USING (institution_id IN (
        SELECT institution_id FROM public.user_institution_access WHERE user_id = auth.uid()
    ));

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_voice_agent_configs_institution ON public.ai_voice_agent_configs(institution_id);
CREATE INDEX IF NOT EXISTS idx_voice_agent_configs_type ON public.ai_voice_agent_configs(agent_type);
CREATE INDEX IF NOT EXISTS idx_voice_agent_configs_active ON public.ai_voice_agent_configs(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_voice_agent_calls_institution ON public.ai_voice_agent_calls(institution_id);
CREATE INDEX IF NOT EXISTS idx_voice_agent_calls_config ON public.ai_voice_agent_calls(agent_config_id);
CREATE INDEX IF NOT EXISTS idx_voice_agent_calls_lead ON public.ai_voice_agent_calls(lead_id);
CREATE INDEX IF NOT EXISTS idx_voice_agent_calls_status ON public.ai_voice_agent_calls(status);
CREATE INDEX IF NOT EXISTS idx_voice_agent_calls_created ON public.ai_voice_agent_calls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_agent_calls_call_sid ON public.ai_voice_agent_calls(call_sid);
