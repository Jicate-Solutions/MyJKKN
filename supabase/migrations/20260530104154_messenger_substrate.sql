-- ============================================================================
-- Migration: 20260530104154_messenger_substrate.sql
-- Module:    Facebook Messenger inbox (Agent δ)
-- Purpose:   Substrate for the Messenger Page inbox: conversations + messages,
--            indexed by Page + PSID, optional FK to admission leads. Plus two
--            platform_policies rows that the webhook receiver + Send API need:
--              - meta.messenger.verify_token   — random hex; Meta webhook
--                                                 challenge/response check.
--              - meta.messenger.is_enabled     — Director-controlled killswitch
--                                                 for the whole module.
--
-- Companion tables (existing): platform_policies, profiles, institutions,
-- leads (FK target).
--
-- Idempotent. Safe to re-apply. INSERTs use ON CONFLICT DO NOTHING via the
-- existing platform_policies UNIQUE (policy_key, scope_type, COALESCE(scope_id,
-- sentinel)) index.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Enum types
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'messenger_conversation_status') THEN
    CREATE TYPE public.messenger_conversation_status AS ENUM ('open', 'closed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'messenger_message_direction') THEN
    CREATE TYPE public.messenger_message_direction AS ENUM ('in', 'out');
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2) messenger_conversations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.messenger_conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,
  page_id         text NOT NULL,
  psid            text NOT NULL,
  lead_id         uuid NULL REFERENCES public.admission_leads(id) ON DELETE SET NULL,
  last_inbound_at timestamptz NULL,
  last_outbound_at timestamptz NULL,
  status          public.messenger_conversation_status NOT NULL DEFAULT 'open',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One conversation per (page, psid). Re-opens reuse the same row.
CREATE UNIQUE INDEX IF NOT EXISTS uq_messenger_conversations_page_psid
  ON public.messenger_conversations (page_id, psid);

CREATE INDEX IF NOT EXISTS idx_messenger_conversations_institution_status_updated
  ON public.messenger_conversations (institution_id, status, last_inbound_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_messenger_conversations_lead
  ON public.messenger_conversations (lead_id)
  WHERE lead_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3) messenger_messages
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.messenger_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.messenger_conversations(id) ON DELETE CASCADE,
  direction       public.messenger_message_direction NOT NULL,
  mid             text NULL,
  text            text NULL,
  attachments     jsonb NULL,
  sent_at         timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Meta `mid` is unique per Page; we treat it as a strong idempotency key for
-- inbound webhook retries. Partial index — `mid` is nullable because outbound
-- rows record `mid` only after Send API returns.
CREATE UNIQUE INDEX IF NOT EXISTS uq_messenger_messages_mid
  ON public.messenger_messages (mid)
  WHERE mid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messenger_messages_conversation_sent_at
  ON public.messenger_messages (conversation_id, sent_at DESC);

-- ---------------------------------------------------------------------------
-- 4) updated_at trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_messenger_conversations_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messenger_conversations_touch_updated_at
  ON public.messenger_conversations;
CREATE TRIGGER trg_messenger_conversations_touch_updated_at
  BEFORE UPDATE ON public.messenger_conversations
  FOR EACH ROW EXECUTE FUNCTION public.fn_messenger_conversations_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 5) RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.messenger_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messenger_messages       ENABLE ROW LEVEL SECURITY;

-- Service role — used by the webhook receiver and the Send API route — has
-- full access. These routes authenticate the user separately before calling
-- the service-role client.
DROP POLICY IF EXISTS messenger_conversations_service_all ON public.messenger_conversations;
CREATE POLICY messenger_conversations_service_all
  ON public.messenger_conversations FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS messenger_messages_service_all ON public.messenger_messages;
CREATE POLICY messenger_messages_service_all
  ON public.messenger_messages FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Authenticated read: super_admin + institution_admin scoped to their institution.
DROP POLICY IF EXISTS messenger_conversations_select ON public.messenger_conversations;
CREATE POLICY messenger_conversations_select
  ON public.messenger_conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.is_super_admin = true
          OR p.institution_id = messenger_conversations.institution_id
        )
    )
  );

DROP POLICY IF EXISTS messenger_messages_select ON public.messenger_messages;
CREATE POLICY messenger_messages_select
  ON public.messenger_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.messenger_conversations c
        JOIN public.profiles p ON p.id = auth.uid()
       WHERE c.id = messenger_messages.conversation_id
         AND (
           p.is_super_admin = true
           OR p.institution_id = c.institution_id
         )
    )
  );

-- ---------------------------------------------------------------------------
-- 6) platform_policies — 2 rows
-- ---------------------------------------------------------------------------

-- Verify token: random hex(32) generated at apply-time so each environment
-- gets a unique value. Director rotates by updating this row via the admin UI
-- (or by issuing UPDATE through the SQL editor).
INSERT INTO public.platform_policies (
  policy_key,
  scope_type, scope_id,
  value, data_type,
  description,
  ui_widget, ui_category,
  is_system, is_active
) VALUES
  (
    'meta.messenger.verify_token',
    'global', NULL,
    to_jsonb(encode(gen_random_bytes(16), 'hex')), 'string',
    'Meta Messenger webhook verify token. Paste this into the Meta App Dashboard webhook config (Page product, Verify Token field). Rotating this value forces Meta to re-verify the subscription on next save.',
    'text',
    'Social — Messenger',
    true, true
  ),
  (
    'meta.messenger.is_enabled',
    'global', NULL,
    'false'::jsonb, 'boolean',
    'Master killswitch for the Messenger inbox module. When false, the /admission/inbox/messenger page renders a disabled state, the Send API route returns 503, and the webhook receiver still ACKs 200 but skips persistence. Director enables once Meta App scopes (pages_messaging + pages_manage_metadata) and Page subscription are configured.',
    'toggle',
    'Social — Messenger',
    false, true
  )
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
  DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7) Self-test
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_table_count int;
  v_policy_count int;
BEGIN
  SELECT count(*) INTO v_table_count
    FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name IN ('messenger_conversations', 'messenger_messages');

  IF v_table_count <> 2 THEN
    RAISE EXCEPTION 'messenger substrate: expected 2 tables, found %', v_table_count;
  END IF;

  SELECT count(*) INTO v_policy_count
    FROM public.platform_policies
   WHERE policy_key IN ('meta.messenger.verify_token', 'meta.messenger.is_enabled')
     AND scope_type = 'global';

  IF v_policy_count <> 2 THEN
    RAISE EXCEPTION 'messenger substrate: expected 2 platform_policies rows, found %', v_policy_count;
  END IF;

  RAISE NOTICE 'messenger substrate applied: tables=%, policies=%', v_table_count, v_policy_count;
END
$$;
