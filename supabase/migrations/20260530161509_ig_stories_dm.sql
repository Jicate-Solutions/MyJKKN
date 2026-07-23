-- =============================================================================
-- Instagram Stories + DM substrate — Phase 1B (Agent ι, 2026-05-30)
-- =============================================================================
-- Adds 4 tables (ig_stories, ig_story_insights, ig_dm_conversations,
-- ig_dm_messages) + 3 platform_policies seeds for runtime knobs.
--
-- All tables are RLS-on with institution_id scoping (directly on rows that
-- carry institution_id; via parent join on rows that don't).
-- Idempotent: CREATE TABLE IF NOT EXISTS + ON CONFLICT DO NOTHING for seeds.
-- =============================================================================

-- =============================================================================
-- 1. ig_stories — active + historical IG stories
-- =============================================================================
-- A story is captured the first time it appears in `/{ig-user-id}/stories`.
-- Stories live ~24h; `expires_at` is set at insert (posted_at + 24h) and is
-- the eviction trigger for the stories-poll cron's final-snapshot pass.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.ig_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id TEXT NOT NULL UNIQUE,
  ig_account_id UUID NOT NULL REFERENCES public.ig_accounts(id) ON DELETE CASCADE,
  media_type TEXT NULL CHECK (media_type IN ('IMAGE','VIDEO')),
  permalink TEXT NULL,
  media_url TEXT NULL,
  thumbnail_url TEXT NULL,
  posted_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_polled_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ig_stories_account ON public.ig_stories (ig_account_id);
-- NOTE: no partial-WHERE on now() — Postgres index predicates must be IMMUTABLE.
-- Callers filter `expires_at > now()` at query time; this composite covers it.
CREATE INDEX IF NOT EXISTS idx_ig_stories_active ON public.ig_stories (ig_account_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_ig_stories_posted ON public.ig_stories (posted_at DESC);

COMMENT ON TABLE public.ig_stories IS 'Snapshots of IG Stories per account. expires_at = posted_at + 24h drives final-snapshot cron eviction.';

-- =============================================================================
-- 2. ig_story_insights — metric snapshots per story
-- =============================================================================
-- Stories return only LIFETIME insights. We snapshot during life (impressions
-- climb until expiry) and keep the final snapshot for historical analysis.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.ig_story_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id TEXT NOT NULL REFERENCES public.ig_stories(story_id) ON DELETE CASCADE,
  metric TEXT NOT NULL CHECK (metric IN ('impressions','reach','exits','replies','taps_forward','taps_back')),
  value NUMERIC NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ig_story_insights_story ON public.ig_story_insights (story_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_ig_story_insights_metric ON public.ig_story_insights (story_id, metric, captured_at DESC);

COMMENT ON TABLE public.ig_story_insights IS 'Per-metric snapshots for an IG story. Multiple rows over the story''s 24h life; last row before expires_at is the canonical final snapshot.';

-- =============================================================================
-- 3. ig_dm_conversations — local mirror of IG DM threads
-- =============================================================================
-- One row per (ig_account_id, ig_user_id) pair. `last_inbound_at` is the
-- 24-hour messaging window enforcer — sendDM() in lib/instagram/dm-client.ts
-- consults this before any outbound call.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.ig_dm_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  ig_account_id UUID NOT NULL REFERENCES public.ig_accounts(id) ON DELETE CASCADE,
  ig_user_id TEXT NOT NULL,
  lead_id UUID NULL REFERENCES public.admission_leads(id) ON DELETE SET NULL,
  last_inbound_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ig_dm_conversations_unique_pair UNIQUE (ig_account_id, ig_user_id)
);

CREATE INDEX IF NOT EXISTS idx_ig_dm_conversations_institution ON public.ig_dm_conversations (institution_id);
CREATE INDEX IF NOT EXISTS idx_ig_dm_conversations_account ON public.ig_dm_conversations (ig_account_id);
CREATE INDEX IF NOT EXISTS idx_ig_dm_conversations_lead ON public.ig_dm_conversations (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ig_dm_conversations_window ON public.ig_dm_conversations (last_inbound_at DESC) WHERE last_inbound_at IS NOT NULL;

COMMENT ON TABLE public.ig_dm_conversations IS 'Local mirror of IG DM threads. last_inbound_at enforces 24h messaging window in lib/instagram/dm-client.ts canSendDm().';

-- =============================================================================
-- 4. ig_dm_messages — inbound + outbound DM messages
-- =============================================================================
-- `mid` is the Meta message id; we dedupe on it for webhook replay safety.
-- `media` is a JSONB blob mirroring Meta's attachments[] shape.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.ig_dm_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.ig_dm_conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  text TEXT NULL,
  media JSONB NULL,
  mid TEXT NOT NULL UNIQUE,
  sent_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ig_dm_messages_conversation ON public.ig_dm_messages (conversation_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_ig_dm_messages_direction ON public.ig_dm_messages (conversation_id, direction, sent_at DESC);

COMMENT ON TABLE public.ig_dm_messages IS 'Inbound + outbound DM messages. mid is Meta''s message id (unique → webhook-replay safe).';

-- =============================================================================
-- 5. RLS — institution_id scoping
-- =============================================================================
-- Stories + story_insights inherit scope via parent ig_accounts.institution_id.
-- Conversations carry institution_id directly. Messages inherit via conversation.
-- =============================================================================
ALTER TABLE public.ig_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_story_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_dm_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_dm_messages ENABLE ROW LEVEL SECURITY;

-- Stories: read = same institution as parent account; write = service role only.
DROP POLICY IF EXISTS ig_stories_read ON public.ig_stories;
CREATE POLICY ig_stories_read ON public.ig_stories FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ig_accounts a
      JOIN public.profiles p ON p.institution_id = a.institution_id
      WHERE a.id = ig_stories.ig_account_id AND p.id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS ig_story_insights_read ON public.ig_story_insights;
CREATE POLICY ig_story_insights_read ON public.ig_story_insights FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ig_stories s
      JOIN public.ig_accounts a ON a.id = s.ig_account_id
      JOIN public.profiles p ON p.institution_id = a.institution_id
      WHERE s.story_id = ig_story_insights.story_id AND p.id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

-- DM conversations: read = same institution; super_admin sees all.
DROP POLICY IF EXISTS ig_dm_conversations_read ON public.ig_dm_conversations;
CREATE POLICY ig_dm_conversations_read ON public.ig_dm_conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND (p.role = 'super_admin' OR p.institution_id = ig_dm_conversations.institution_id)
    )
  );

-- DM messages: read inherits via conversation.
DROP POLICY IF EXISTS ig_dm_messages_read ON public.ig_dm_messages;
CREATE POLICY ig_dm_messages_read ON public.ig_dm_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ig_dm_conversations c
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE c.id = ig_dm_messages.conversation_id
      AND (p.role = 'super_admin' OR p.institution_id = c.institution_id)
    )
  );

-- =============================================================================
-- 6. platform_policies seeds — 3 runtime knobs (+ 1 secret)
-- =============================================================================
-- All resolved at runtime via fn_get_policy. Director-editable via the
-- /admin policy UI per the canonical platform_policies pattern.
--
-- meta.instagram_messaging.verify_token — random hex 32, secret for Meta
-- webhook verify handshake. Generated here once; rotated by editing the row.
-- =============================================================================
INSERT INTO public.platform_policies (
  policy_key, scope_type, scope_id, value, data_type, description,
  classification, publication_state, is_system, is_active,
  ui_widget, ui_category, ui_consequence
) VALUES
  (
    'meta.instagram_messaging.verify_token', 'global', NULL,
    to_jsonb(encode(gen_random_bytes(16), 'hex')), 'string',
    'Verify-token used by Meta when subscribing the Instagram messaging webhook. Must match the value entered in Meta App > Webhooks > Instagram > Verify Token. Treat as a secret — rotating it requires re-subscribing the webhook in Meta App config.',
    'operational', 'published', false, true,
    'secret', 'Instagram',
    'Rotating this value will INVALIDATE the existing Meta webhook subscription. After rotation, paste the new value into Meta App > Webhooks > Instagram > Verify Token and click Subscribe; until then, no inbound DMs will reach the inbox.'
  ),
  (
    'ig.stories.poll_interval_minutes', 'global', NULL,
    to_jsonb(120), 'number',
    'Minutes between consecutive Stories polls (per account). The cron at /api/cron/ig-stories-poll runs every 2h by default and skips accounts polled within this interval.',
    'operational', 'published', false, true,
    'number', 'Instagram',
    'Lower this to capture story insights more often (closer to real-time, but higher Meta API quota usage); raise it to reduce quota burn at the cost of missing the final-snapshot window on short-lived stories.'
  ),
  (
    'ig.dm.is_enabled', 'global', NULL,
    to_jsonb(false), 'boolean',
    'Master kill-switch for the Instagram DM inbox. When OFF, /admission/inbox/instagram renders a disabled-state placeholder and the webhook handler 200s without writing.',
    'operational', 'published', false, true,
    'toggle', 'Instagram',
    'Turn ON only after Meta App > Webhooks > Instagram > messages is subscribed and the verify-token is configured. Turning OFF stops inbound DM ingestion immediately and disables the reply UI.'
  ),
  (
    'ig.stories.is_enabled', 'global', NULL,
    to_jsonb(false), 'boolean',
    'Master kill-switch for Instagram Stories monitoring. When OFF, the /api/cron/ig-stories-poll cron exits early without calling Meta.',
    'operational', 'published', false, true,
    'toggle', 'Instagram',
    'Turn ON to begin capturing story snapshots + insights every poll_interval_minutes. Turning OFF stops new captures but does not delete existing rows in ig_stories / ig_story_insights.'
  )
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

-- =============================================================================
-- Verification probes (paste output into PR body):
--   SELECT table_name FROM information_schema.tables
--     WHERE table_name LIKE 'ig_stor%' OR table_name LIKE 'ig_dm%';
--   SELECT count(*) FROM ig_dm_conversations;  -- expect 0
--   SELECT policy_key FROM platform_policies
--     WHERE policy_key LIKE 'meta.instagram_messaging.%' OR policy_key LIKE 'ig.stories.%' OR policy_key = 'ig.dm.is_enabled';
-- =============================================================================
