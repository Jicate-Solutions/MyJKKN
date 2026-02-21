-- ============================================
-- Unified Communication Suite: WhatsApp Chat
-- Phase 1.2 — WhatsApp Live Chat (Echo Equivalent)
-- ============================================

-- 1. Conversations table
CREATE TABLE IF NOT EXISTS public.wa_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES public.admission_leads(id) ON DELETE SET NULL,

    contact_phone TEXT NOT NULL,
    contact_name TEXT,
    contact_wa_id TEXT,                -- WhatsApp ID (may differ from phone)
    contact_profile_pic_url TEXT,

    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'open',
    -- status: open | waiting | resolved | expired

    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_message_preview TEXT,
    last_inbound_at TIMESTAMPTZ,       -- For 24hr window tracking
    unread_count INT NOT NULL DEFAULT 0,

    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_wa_conv_institution_phone UNIQUE(institution_id, contact_phone)
);

-- 2. Messages table
CREATE TABLE IF NOT EXISTS public.wa_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
    wa_message_id TEXT,                 -- Meta's message ID

    direction TEXT NOT NULL,            -- inbound | outbound
    sender_type TEXT NOT NULL,          -- prospect | counselor | system | bot
    sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

    message_type TEXT NOT NULL DEFAULT 'text',
    -- text | image | video | document | audio | location | contacts | interactive | template | reaction

    content JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Flexible JSON: { text?, media_url?, caption?, template_name?, button_reply?, etc. }

    status TEXT NOT NULL DEFAULT 'sent',
    -- sent | delivered | read | failed
    error_message TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Quick reply templates for counselors (canned responses)
CREATE TABLE IF NOT EXISTS public.wa_quick_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    shortcut TEXT,                      -- e.g., "/fee" expands to fee structure message
    category TEXT,                      -- greeting | fee | program | general
    usage_count INT NOT NULL DEFAULT 0,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. RLS
ALTER TABLE public.wa_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_quick_replies ENABLE ROW LEVEL SECURITY;

-- Policies (institution-scoped access)
DROP POLICY IF EXISTS "wa_conversations_access" ON public.wa_conversations;
CREATE POLICY "wa_conversations_access" ON public.wa_conversations
    FOR ALL USING (
        institution_id IN (
            SELECT institution_id FROM public.user_institution_access WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "wa_messages_access" ON public.wa_messages;
CREATE POLICY "wa_messages_access" ON public.wa_messages
    FOR ALL USING (
        conversation_id IN (
            SELECT id FROM public.wa_conversations WHERE institution_id IN (
                SELECT institution_id FROM public.user_institution_access WHERE user_id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "wa_quick_replies_access" ON public.wa_quick_replies;
CREATE POLICY "wa_quick_replies_access" ON public.wa_quick_replies
    FOR ALL USING (
        institution_id IN (
            SELECT institution_id FROM public.user_institution_access WHERE user_id = auth.uid()
        )
    );

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_wa_conv_institution ON public.wa_conversations(institution_id);
CREATE INDEX IF NOT EXISTS idx_wa_conv_status ON public.wa_conversations(status);
CREATE INDEX IF NOT EXISTS idx_wa_conv_assigned ON public.wa_conversations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_wa_conv_last_msg ON public.wa_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_conv_phone ON public.wa_conversations(contact_phone);
CREATE INDEX IF NOT EXISTS idx_wa_conv_lead ON public.wa_conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_wa_msg_conversation ON public.wa_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_wa_msg_created ON public.wa_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_msg_wa_id ON public.wa_messages(wa_message_id);
CREATE INDEX IF NOT EXISTS idx_wa_msg_direction ON public.wa_messages(direction);
