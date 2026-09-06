-- ============================================================================
-- Migration: 20260530104346_meta_capi_events
-- Phase: Meta Pixel + Conversions API substrate (Agent ε)
-- ============================================================================
-- WHAT IT DOES
-- ------------
-- 1. Creates `meta_capi_events` — append-only audit log of every CAPI event
--    posted to Meta's `/{pixel_id}/events` endpoint. Used by the
--    /admin/integrations/meta-pixel page to surface recent events + by
--    cron retry workers (future) to find failed events.
--
-- 2. Seeds 3 platform_policies rows that govern CAPI:
--      meta.capi.pixel_id           string  per-institution scope, default ""
--      meta.capi.access_token_ref   string  per-institution scope, default ""
--                                   (env-var NAME, NOT the token itself —
--                                    token stays in Vercel env, never DB)
--      meta.capi.is_enabled         boolean global default false
--
-- Tier-0 safe-additive. Idempotent — safe to re-apply.
-- Apply via Supabase Management API; then run probes:
--   SELECT table_name FROM information_schema.tables
--     WHERE table_name = 'meta_capi_events';
--   SELECT count(*) FROM meta_capi_events;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table: meta_capi_events
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meta_capi_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    uuid NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  event_name        text NOT NULL,
  -- Dedupe key — see pixel-client.ts header. Pair (event_name, event_id) must
  -- match the browser Pixel event for the same conversion or Meta will
  -- double-count.
  event_id          text NULL,
  -- Hashed user_data block as posted to Meta. Stored to support replays /
  -- audit trail / Director-facing "what got sent" inspection. Plaintext PII
  -- is NEVER stored here — only the SHA-256 hashes that left the box.
  user_data_hash    jsonb NULL,
  -- Optional event-payload metadata (value, currency, content_ids, …).
  custom_data       jsonb NULL,
  sent_at           timestamptz NOT NULL DEFAULT now(),
  -- HTTP status from Meta's response. NULL when the call was rejected
  -- pre-flight (empty pixel_id, missing token, kill-switch off).
  response_status   smallint NULL,
  response_body     jsonb NULL,
  error             text NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.meta_capi_events IS
  'Append-only audit log of every CAPI event posted to Meta. Stores only SHA-256 hashes of PII (never plaintext). Used by /admin/integrations/meta-pixel and future retry workers.';
COMMENT ON COLUMN public.meta_capi_events.event_id IS
  'Dedupe key sent to Meta. Pair (event_name, event_id) must match the browser-side Pixel event for the same user action — otherwise Meta double-counts.';
COMMENT ON COLUMN public.meta_capi_events.user_data_hash IS
  'The hashed user_data block that left the server (em, ph, fn, ln, country, etc. all SHA-256). Plaintext PII is never written.';
COMMENT ON COLUMN public.meta_capi_events.response_status IS
  'HTTP status from Meta. NULL = pre-flight rejection (empty pixel_id, missing token, kill-switch off).';

-- Indexes for the admin page (recent events per institution) + dedupe lookup.
CREATE INDEX IF NOT EXISTS idx_meta_capi_events_institution_sent_at
  ON public.meta_capi_events (institution_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_meta_capi_events_event_name_sent_at
  ON public.meta_capi_events (event_name, sent_at DESC);

-- Partial unique — prevent the same (institution, event_name, event_id) from
-- being logged twice. event_id is nullable; the partial index only enforces
-- uniqueness for rows where event_id is set (i.e. dedupe-aware events).
CREATE UNIQUE INDEX IF NOT EXISTS uq_meta_capi_events_dedupe_per_institution
  ON public.meta_capi_events (
    COALESCE(institution_id, '00000000-0000-0000-0000-000000000000'::uuid),
    event_name,
    event_id
  )
  WHERE event_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. RLS — mirror platform_policies pattern
-- ----------------------------------------------------------------------------
--   SELECT: super_admin OR admin (Director-facing audit).
--   INSERT: super_admin OR admin OR service_role (server-side trackers).
--           PostgREST writes from logged-in users go through admin gate;
--           service-role server clients bypass RLS entirely as designed.
--   UPDATE / DELETE: super_admin only (append-only intent; retention policy
--           future).
-- ----------------------------------------------------------------------------
ALTER TABLE public.meta_capi_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meta_capi_events_select ON public.meta_capi_events;
CREATE POLICY meta_capi_events_select ON public.meta_capi_events
  FOR SELECT USING (is_super_admin() OR is_admin());

DROP POLICY IF EXISTS meta_capi_events_insert ON public.meta_capi_events;
CREATE POLICY meta_capi_events_insert ON public.meta_capi_events
  FOR INSERT WITH CHECK (is_super_admin() OR is_admin());

DROP POLICY IF EXISTS meta_capi_events_update ON public.meta_capi_events;
CREATE POLICY meta_capi_events_update ON public.meta_capi_events
  FOR UPDATE USING (is_super_admin())
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS meta_capi_events_delete ON public.meta_capi_events;
CREATE POLICY meta_capi_events_delete ON public.meta_capi_events
  FOR DELETE USING (is_super_admin());

-- ----------------------------------------------------------------------------
-- 3. platform_policies seeds
-- ----------------------------------------------------------------------------
-- All three rows are GLOBAL defaults with empty / safe values. Per-institution
-- override rows are inserted by Director from the admin UI — not seeded here.
--
-- IMPORTANT: meta.capi.access_token_ref stores the NAME of the env var
-- (e.g. `META_CAPI_ACCESS_TOKEN_JKKN_DENTAL`) that holds the actual token.
-- The token itself NEVER lives in the DB — it stays in Vercel's encrypted
-- env-var store. The runtime resolver does `process.env[token_ref]`.
-- ----------------------------------------------------------------------------

-- 3a. meta.capi.pixel_id — global default empty string
INSERT INTO public.platform_policies (
  policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active
)
SELECT
  'meta.capi.pixel_id',
  'global',
  NULL::uuid,
  '""'::jsonb,
  'Meta Pixel id (numeric string) used by CAPI to attribute events. Empty string = CAPI disabled. Override per institution from /admin/integrations/meta-pixel. NEVER hardcode a pixel id in app code — read via fn_get_policy.',
  'string',
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
  WHERE policy_key = 'meta.capi.pixel_id'
    AND scope_type = 'global'
    AND scope_id IS NULL
);

-- 3b. meta.capi.access_token_ref — global default empty string
INSERT INTO public.platform_policies (
  policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active
)
SELECT
  'meta.capi.access_token_ref',
  'global',
  NULL::uuid,
  '""'::jsonb,
  'NAME of the env var (NOT the token itself) holding the Meta CAPI access token. Example: META_CAPI_ACCESS_TOKEN_JKKN_DENTAL. Runtime resolver does process.env[ref]. Token stays in Vercel env, never in DB. Required Meta scope: ads_management (or ads_read if Pixel is in own Business Manager).',
  'string',
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
  WHERE policy_key = 'meta.capi.access_token_ref'
    AND scope_type = 'global'
    AND scope_id IS NULL
);

-- 3c. meta.capi.is_enabled — global default false (kill switch)
INSERT INTO public.platform_policies (
  policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active
)
SELECT
  'meta.capi.is_enabled',
  'global',
  NULL::uuid,
  'false'::jsonb,
  'Master kill switch for Meta CAPI. When false, all server-side CAPI calls short-circuit and DO NOT post to Meta — only the local audit row is written with response_status NULL and error="kill-switch off". Flip true from /admin/integrations/meta-pixel after Pixel + token are configured.',
  'boolean',
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
  WHERE policy_key = 'meta.capi.is_enabled'
    AND scope_type = 'global'
    AND scope_id IS NULL
);
