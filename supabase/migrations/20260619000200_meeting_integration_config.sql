-- 20260619000200_meeting_integration_config.sql
-- Universal Booking — Wave-3 integration config (SHIPS DARK; scaffold).
-- Spec: specs/universal-booking-module-2026-06-12.md (D4 location_mode 'online').
--
-- Adds ONE table: meeting_host_integration_prefs — which video provider a host
-- uses when a meeting type's location_mode = 'online'. Google is the existing
-- per-host OAuth provider (D12); Zoom and Teams are the new platform-level
-- providers (lib/services/integrations/zoom-service.ts, teams-service.ts). A
-- host with no row defaults to 'google' (back-compat with the U1 substrate).
--
-- DARK: no UI reads this yet; the book route's provider selection (see NEEDS.md)
-- is the consumer. The service modules are env-gated, so an unconfigured
-- provider simply produces no link and the route falls back — this row only
-- expresses preference, never forces an unconfigured provider.
--
-- Patterns: 20260612090000_universal_booking_substrate.sql (table/RLS/trigger
-- conventions, meeting_host_pages shape), config-table-pattern. Anon-locked per
-- the 2026-06-06 standing rule (REVOKE FROM anon, PUBLIC; GRANT TO authenticated).

-- ── table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.meeting_host_integration_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Which provider mints the join link for an 'online' meeting type. 'google'
  -- = the host's own Google Meet (per-host OAuth, D12); 'zoom'/'teams' = the
  -- platform-level Server-to-Server / Graph apps. Default 'google' so existing
  -- hosts keep their current behavior.
  video_provider text NOT NULL DEFAULT 'google'
    CHECK (video_provider IN ('google', 'zoom', 'teams')),
  -- Optional per-host host identity for the chosen provider:
  --   zoom  → the Zoom user email that hosts the meeting (createZoomMeeting.hostEmail)
  --   teams → informational only (Teams meetings use the platform organizer)
  --   google→ ignored (the OAuth connection already identifies the host)
  -- NULL = use the provider's default ('me'/service account).
  provider_host_identity text CHECK (char_length(provider_host_identity) <= 320),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.meeting_host_integration_prefs IS
  'Universal Booking Wave-3: per-host video provider preference for online meeting types (google/zoom/teams). Default google. Consumed by the book route''s provider selection; env-gated services no-op when their provider is unconfigured.';

COMMENT ON COLUMN public.meeting_host_integration_prefs.video_provider IS
  'google = per-host Google Meet (D12 OAuth); zoom = platform S2S OAuth app; teams = platform Graph app. Preference only — an unconfigured provider yields no link and the route falls back.';

-- updated_at trigger (reuses the native-scheduling trigger fn the U1 substrate uses)
DROP TRIGGER IF EXISTS tg_mhip_updated ON public.meeting_host_integration_prefs;
CREATE TRIGGER tg_mhip_updated BEFORE UPDATE ON public.meeting_host_integration_prefs
  FOR EACH ROW EXECUTE FUNCTION public.tg_native_scheduling_set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.meeting_host_integration_prefs ENABLE ROW LEVEL SECURITY;

-- Hosts manage their own prefs (+ super admin / admin, D14). No public read —
-- the public booking page resolves the provider through a service-role route.
DROP POLICY IF EXISTS "mhip_host_all" ON public.meeting_host_integration_prefs;
CREATE POLICY "mhip_host_all" ON public.meeting_host_integration_prefs
FOR ALL USING (
  is_super_admin() OR is_admin() OR host_profile_id = auth.uid()
) WITH CHECK (
  is_super_admin() OR is_admin() OR host_profile_id = auth.uid()
);

-- ── upsert RPC (anon-locked) ─────────────────────────────────────────────────
-- Small helper so a host can set their preference in one round trip. RLS still
-- applies (the function is SECURITY INVOKER), so a host can only write their own
-- row; the explicit auth.uid() guard makes the intent obvious and blocks a
-- caller from passing someone else's host id.

CREATE OR REPLACE FUNCTION public.fn_set_meeting_integration_pref(
  p_video_provider text,
  p_provider_host_identity text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'fn_set_meeting_integration_pref: no authenticated user';
  END IF;
  IF p_video_provider IS NULL OR p_video_provider NOT IN ('google', 'zoom', 'teams') THEN
    RAISE EXCEPTION 'fn_set_meeting_integration_pref: video_provider must be google|zoom|teams';
  END IF;

  INSERT INTO public.meeting_host_integration_prefs
    (host_profile_id, video_provider, provider_host_identity)
  VALUES
    (v_uid, p_video_provider, p_provider_host_identity)
  ON CONFLICT (host_profile_id) DO UPDATE SET
    video_provider         = EXCLUDED.video_provider,
    provider_host_identity = EXCLUDED.provider_host_identity,
    updated_at             = now();
END;
$$;

-- Anon-locked per the 2026-06-06 standing rule: Supabase's default
-- ALTER DEFAULT PRIVILEGES grants EXECUTE on every new function to anon, so an
-- explicit REVOKE FROM anon is required (REVOKE FROM PUBLIC alone is not enough).
REVOKE EXECUTE ON FUNCTION public.fn_set_meeting_integration_pref(text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_set_meeting_integration_pref(text, text) TO authenticated;

-- Make the new table + function visible to PostgREST immediately.
NOTIFY pgrst, 'reload schema';
