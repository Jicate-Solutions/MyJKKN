-- ============================================================================
-- WHATSAPP CHAT TABLES
-- Created: 2026-02-26
-- Purpose: Two-way WhatsApp conversation management for Admission CRM
-- wa_conversations: One row per unique phone+institution conversation thread
-- wa_messages: Individual messages within a conversation
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. WA_CONVERSATIONS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wa_conversations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id          uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

  -- Linked admission lead (optional — auto-linked when phone matches)
  lead_id                 uuid REFERENCES admission_leads(id) ON DELETE SET NULL,

  -- Contact info from WhatsApp
  contact_phone           varchar(20)  NOT NULL,
  contact_name            varchar(255),
  contact_wa_id           varchar(50),
  contact_profile_pic_url text,

  -- Assignment
  assigned_to             uuid REFERENCES profiles(id) ON DELETE SET NULL,

  -- Conversation state
  status                  varchar(20)  NOT NULL DEFAULT 'open'
                            CHECK (status IN ('open', 'waiting', 'resolved', 'expired')),
  last_message_at         timestamptz  NOT NULL DEFAULT now(),
  last_message_preview    text,
  last_inbound_at         timestamptz,
  unread_count            integer      NOT NULL DEFAULT 0,

  -- Flexible metadata (tags, routing priority, etc.)
  tags                    text[]  NOT NULL DEFAULT '{}',
  metadata                jsonb   NOT NULL DEFAULT '{}',

  created_at              timestamptz  NOT NULL DEFAULT now(),
  updated_at              timestamptz  NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_wa_conv_institution   ON wa_conversations(institution_id);
CREATE INDEX IF NOT EXISTS idx_wa_conv_lead          ON wa_conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_wa_conv_status        ON wa_conversations(institution_id, status);
CREATE INDEX IF NOT EXISTS idx_wa_conv_assigned_to   ON wa_conversations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_wa_conv_last_message  ON wa_conversations(institution_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_conv_contact_phone ON wa_conversations(institution_id, contact_phone);
CREATE INDEX IF NOT EXISTS idx_wa_conv_tags          ON wa_conversations USING GIN(tags);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. WA_MESSAGES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wa_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid        NOT NULL REFERENCES wa_conversations(id) ON DELETE CASCADE,
  wa_message_id    varchar(100),      -- Meta's message ID (null for system messages)
  direction        varchar(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender_type      varchar(20) NOT NULL
                     CHECK (sender_type IN ('prospect', 'counselor', 'system', 'bot')),
  sender_id        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  message_type     varchar(50) NOT NULL DEFAULT 'text',
  content          jsonb       NOT NULL DEFAULT '{}',
  status           varchar(20) NOT NULL DEFAULT 'sent'
                     CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  error_message    text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Indexes for message retrieval (cursor-based pagination by created_at)
CREATE INDEX IF NOT EXISTS idx_wa_msg_conversation  ON wa_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_msg_wa_message_id ON wa_messages(wa_message_id) WHERE wa_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_msg_sender        ON wa_messages(sender_id) WHERE sender_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS POLICIES
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE wa_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_messages      ENABLE ROW LEVEL SECURITY;

-- wa_conversations: same auth_institution_id() pattern as admission_leads
CREATE POLICY "wa_conv_select" ON wa_conversations FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "wa_conv_insert" ON wa_conversations FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "wa_conv_update" ON wa_conversations FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "wa_conv_delete" ON wa_conversations FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

-- wa_messages: join through wa_conversations to get institution_id
CREATE POLICY "wa_msg_select" ON wa_messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM wa_conversations c
    WHERE c.id = conversation_id
      AND (c.institution_id = auth_institution_id()
           OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  )
);
CREATE POLICY "wa_msg_insert" ON wa_messages FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM wa_conversations c
    WHERE c.id = conversation_id
      AND (c.institution_id = auth_institution_id()
           OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  )
);
CREATE POLICY "wa_msg_update" ON wa_messages FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM wa_conversations c
    WHERE c.id = conversation_id
      AND (c.institution_id = auth_institution_id()
           OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  )
);
CREATE POLICY "wa_msg_delete" ON wa_messages FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM wa_conversations c
    WHERE c.id = conversation_id
      AND (c.institution_id = auth_institution_id()
           OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  )
);
