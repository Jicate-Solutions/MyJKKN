-- ============================================
-- Unified Communication Suite: AI Chatbot
-- Phase 3.1 — Prospect-Facing AI Chatbot
-- ============================================

-- 1. Chatbot configuration per institution
CREATE TABLE IF NOT EXISTS public.chatbot_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    welcome_message TEXT NOT NULL DEFAULT 'Hello! I''m the JKKN Admissions Assistant. How can I help you today?',
    system_prompt TEXT,
    enabled_channels TEXT[] DEFAULT '{website,whatsapp}',
    languages TEXT[] DEFAULT '{en}',
    business_hours JSONB DEFAULT '{"start":"09:00","end":"18:00","timezone":"Asia/Kolkata"}'::jsonb,
    handoff_triggers TEXT[] DEFAULT '{speak to human,talk to counselor,call me}',
    max_turns_before_handoff INT NOT NULL DEFAULT 10,
    collect_contact_info BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Knowledge base documents
CREATE TABLE IF NOT EXISTS public.chatbot_knowledge_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chatbot_id UUID NOT NULL REFERENCES public.chatbot_configs(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    source_type TEXT NOT NULL,        -- url | document | manual
    source_url TEXT,
    content TEXT NOT NULL,            -- Extracted/processed text content
    content_embedding TEXT,            -- Placeholder for vector embeddings (enable pgvector later)
    status TEXT NOT NULL DEFAULT 'active',  -- active | processing | failed
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Chat sessions
CREATE TABLE IF NOT EXISTS public.chatbot_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chatbot_id UUID NOT NULL REFERENCES public.chatbot_configs(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    channel TEXT NOT NULL,             -- website | whatsapp
    visitor_id TEXT,
    lead_id UUID REFERENCES public.admission_leads(id) ON DELETE SET NULL,
    wa_conversation_id UUID REFERENCES public.wa_conversations(id) ON DELETE SET NULL,

    context JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- { interested_program, collected_name, collected_email, collected_phone, intent_score, language }

    status TEXT NOT NULL DEFAULT 'active',   -- active | handed_off | ended
    handed_off_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    handoff_reason TEXT,

    message_count INT NOT NULL DEFAULT 0,

    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ
);

-- 4. Chat messages within sessions
CREATE TABLE IF NOT EXISTS public.chatbot_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.chatbot_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,                -- user | assistant | system
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    -- { intent_detected, confidence, suggested_action, tokens_used }
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. RLS
ALTER TABLE public.chatbot_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_messages ENABLE ROW LEVEL SECURITY;

-- Policies (standard institution-scoped)
DROP POLICY IF EXISTS "chatbot_configs_access" ON public.chatbot_configs;
CREATE POLICY "chatbot_configs_access" ON public.chatbot_configs
    FOR ALL USING (institution_id IN (
        SELECT institution_id FROM public.user_institution_access WHERE user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "chatbot_kb_access" ON public.chatbot_knowledge_base;
CREATE POLICY "chatbot_kb_access" ON public.chatbot_knowledge_base
    FOR ALL USING (chatbot_id IN (
        SELECT id FROM public.chatbot_configs WHERE institution_id IN (
            SELECT institution_id FROM public.user_institution_access WHERE user_id = auth.uid()
        )
    ));

DROP POLICY IF EXISTS "chatbot_sessions_access" ON public.chatbot_sessions;
CREATE POLICY "chatbot_sessions_access" ON public.chatbot_sessions
    FOR ALL USING (institution_id IN (
        SELECT institution_id FROM public.user_institution_access WHERE user_id = auth.uid()
    ));

-- Public access policy for chatbot_sessions (prospects create sessions without auth)
DROP POLICY IF EXISTS "chatbot_sessions_public_create" ON public.chatbot_sessions;
CREATE POLICY "chatbot_sessions_public_create" ON public.chatbot_sessions
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "chatbot_messages_access" ON public.chatbot_messages;
CREATE POLICY "chatbot_messages_access" ON public.chatbot_messages
    FOR ALL USING (session_id IN (
        SELECT id FROM public.chatbot_sessions WHERE institution_id IN (
            SELECT institution_id FROM public.user_institution_access WHERE user_id = auth.uid()
        )
    ));

-- Public access for chatbot messages (prospects can read/write their session)
DROP POLICY IF EXISTS "chatbot_messages_public" ON public.chatbot_messages;
CREATE POLICY "chatbot_messages_public" ON public.chatbot_messages
    FOR ALL USING (true);

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_chatbot_configs_institution ON public.chatbot_configs(institution_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_kb_chatbot ON public.chatbot_knowledge_base(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_chatbot ON public.chatbot_sessions(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_institution ON public.chatbot_sessions(institution_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_lead ON public.chatbot_sessions(lead_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_status ON public.chatbot_sessions(status);
CREATE INDEX IF NOT EXISTS idx_chatbot_messages_session ON public.chatbot_messages(session_id);
