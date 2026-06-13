-- 20260612090000_universal_booking_substrate.sql
-- Universal Booking module — U1 substrate (SHIPS DARK; no UI reads these yet).
-- Spec: specs/universal-booking-module-2026-06-12.md (20 decisions, assumption-thrash).
--
-- Adds:
--   1. meeting_host_pages              — public booking-page config per host
--                                        (handle, opt-in flag; decisions D1/D5/D20)
--   2. meeting_host_google_connections — per-host Google Calendar link + encrypted
--                                        refresh token (D12/D19/D20)
--   3. vault RPC trio for the Google refresh token — pattern copied from the
--      cal-api-key vault (20260503000003) WITH the corrected
--      `search_path = public, extensions` (20260710000000); pgcrypto lives in
--      the extensions schema on Supabase. service_role-only EXECUTE.
--   4. meeting_types: location_mode/location_text (D4)
--   5. meeting_bookings: video_url, google_event_id, attendee_profile_id,
--      reschedule audit columns (D12/D16)
--   6. meetings.view grant to all staff-type roles (D15) — exclusion-list based
--
-- Patterns: 20260611190000 (table/RLS/trigger conventions), config-table-pattern,
-- cal vault fns. Master-secret env naming is a U2 (service-layer) concern — the
-- RPCs take the secret as a parameter, same as the cal trio.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ── 1. meeting_host_pages ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.meeting_host_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Public URL identity: jkkn.ai/meet/<handle>. Auto-proposed from the name,
  -- editable once at opt-in (D5). Lowercase kebab; reserved words blocked so
  -- /meet/<static-segment> routes can never be shadowed.
  handle text NOT NULL UNIQUE
    CHECK (
      handle ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      AND char_length(handle) BETWEEN 3 AND 50
      AND handle NOT IN (
        'admin','api','app','auth','book','cancel','directory','help','jkkn',
        'login','logout','mail','meet','meetings','new','privacy','reschedule',
        'settings','static','support','terms','www'
      )
    ),
  -- D1 opt-in: nothing is public until the host flips this AND has an active
  -- Google connection (D20 — enforced at the service layer, not here, so a
  -- broken connection can auto-hide without violating a constraint).
  is_public boolean NOT NULL DEFAULT false,
  -- D19: set by the system when the host's Google connection breaks. Kept
  -- separate from is_public so reconnecting can restore the host's own choice.
  auto_hidden boolean NOT NULL DEFAULT false,
  auto_hidden_reason text,
  -- Short blurb under the name on /meet/<handle> and the directory card.
  headline text CHECK (char_length(headline) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.meeting_host_pages IS
  'Universal Booking: per-host public page config (handle + opt-in). A host is publicly bookable iff is_public AND NOT auto_hidden AND google connection active (D20). Directory/public reads go through service-role routes only.';

CREATE INDEX IF NOT EXISTS idx_mhp_public
  ON public.meeting_host_pages(is_public) WHERE is_public = true;

DROP TRIGGER IF EXISTS tg_mhp_updated ON public.meeting_host_pages;
CREATE TRIGGER tg_mhp_updated BEFORE UPDATE ON public.meeting_host_pages
  FOR EACH ROW EXECUTE FUNCTION public.tg_native_scheduling_set_updated_at();

-- ── 2. meeting_host_google_connections ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.meeting_host_google_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  google_email text NOT NULL,
  -- pgp_sym_encrypt'd Google OAuth refresh token. Written/read ONLY through the
  -- vault RPCs below (service_role). Hosts can see their row's status/email via
  -- RLS but have no path that decrypts.
  refresh_token_encrypted bytea,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','broken','revoked')),
  last_ok_at timestamptz,
  broken_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.meeting_host_google_connections IS
  'Universal Booking: per-host Google Calendar link (D12 full depth: freebusy + events + Meet links). status=broken triggers D19 auto-hide; daily cron + slot-time failures maintain it.';

DROP TRIGGER IF EXISTS tg_mhgc_updated ON public.meeting_host_google_connections;
CREATE TRIGGER tg_mhgc_updated BEFORE UPDATE ON public.meeting_host_google_connections
  FOR EACH ROW EXECUTE FUNCTION public.tg_native_scheduling_set_updated_at();

-- ── 3. Google token vault RPCs (cal-vault pattern, corrected search_path) ────

CREATE OR REPLACE FUNCTION public.fn_set_google_cal_token(
  p_host_id       uuid,
  p_google_email  text,
  p_refresh_token text,
  p_master_secret text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_host_id IS NULL THEN
    RAISE EXCEPTION 'fn_set_google_cal_token: p_host_id must not be NULL';
  END IF;
  IF p_google_email IS NULL OR length(trim(p_google_email)) = 0 THEN
    RAISE EXCEPTION 'fn_set_google_cal_token: p_google_email must not be NULL or empty';
  END IF;
  IF p_refresh_token IS NULL OR length(trim(p_refresh_token)) = 0 THEN
    RAISE EXCEPTION 'fn_set_google_cal_token: p_refresh_token must not be NULL or empty';
  END IF;
  IF p_master_secret IS NULL OR length(trim(p_master_secret)) = 0 THEN
    RAISE EXCEPTION 'fn_set_google_cal_token: p_master_secret must not be NULL or empty';
  END IF;

  INSERT INTO public.meeting_host_google_connections AS c
    (host_profile_id, google_email, refresh_token_encrypted, status, last_ok_at, broken_at)
  VALUES
    (p_host_id, p_google_email, pgp_sym_encrypt(p_refresh_token, p_master_secret), 'active', now(), NULL)
  ON CONFLICT (host_profile_id) DO UPDATE SET
    google_email            = EXCLUDED.google_email,
    refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
    status                  = 'active',
    last_ok_at              = now(),
    broken_at               = NULL,
    updated_at              = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_get_google_cal_token(
  p_host_id       uuid,
  p_master_secret text
)
RETURNS TABLE(google_email text, refresh_token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_host_id IS NULL THEN
    RAISE EXCEPTION 'fn_get_google_cal_token: p_host_id must not be NULL';
  END IF;
  IF p_master_secret IS NULL OR length(trim(p_master_secret)) = 0 THEN
    RAISE EXCEPTION 'fn_get_google_cal_token: p_master_secret must not be NULL or empty';
  END IF;

  RETURN QUERY
  SELECT
    c.google_email,
    pgp_sym_decrypt(c.refresh_token_encrypted, p_master_secret)::text
  FROM public.meeting_host_google_connections c
  WHERE c.host_profile_id = p_host_id
    AND c.refresh_token_encrypted IS NOT NULL
    AND c.status <> 'revoked';
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_clear_google_cal_token(
  p_host_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_host_id IS NULL THEN
    RAISE EXCEPTION 'fn_clear_google_cal_token: p_host_id must not be NULL';
  END IF;

  UPDATE public.meeting_host_google_connections
  SET refresh_token_encrypted = NULL,
      status     = 'revoked',
      updated_at = now()
  WHERE host_profile_id = p_host_id;
END;
$$;

-- Vault posture (cal-vault pattern): master secret is server-only, so these are
-- service_role-only — clients (anon AND authenticated) have no execute path.
REVOKE ALL ON FUNCTION public.fn_set_google_cal_token(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_get_google_cal_token(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_clear_google_cal_token(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_set_google_cal_token(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_get_google_cal_token(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_clear_google_cal_token(uuid) TO service_role;

-- ── 4. meeting_types: where the meeting happens (D4) ────────────────────────

ALTER TABLE public.meeting_types
  ADD COLUMN IF NOT EXISTS location_mode text NOT NULL DEFAULT 'in_person'
    CHECK (location_mode IN ('in_person','phone','online')),
  ADD COLUMN IF NOT EXISTS location_text text;

COMMENT ON COLUMN public.meeting_types.location_mode IS
  'D4: in_person (location_text = office/room), phone (host calls attendee), online (Meet link auto-generated on the Google event, D12).';

-- Counselor admission calls are phone calls in practice: the funnel collects
-- the attendee's phone and the counselor dials out. Correct the 95 provisioned
-- types from the column default.
UPDATE public.meeting_types
SET location_mode = 'phone'
WHERE slug = 'admission-counseling';

-- ── 5. meeting_bookings: video/event/reschedule columns (D12/D16) ───────────

ALTER TABLE public.meeting_bookings
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS google_event_id text,
  ADD COLUMN IF NOT EXISTS attendee_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rescheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS reschedule_count smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS previous_start_time timestamptz;

COMMENT ON COLUMN public.meeting_bookings.previous_start_time IS
  'D16 true-reschedule: the start before the most recent reschedule. The UPDATE re-arbitrates against mb_no_double_booking (23P01 = new slot taken).';

-- ── 6. RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE public.meeting_host_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_host_google_connections ENABLE ROW LEVEL SECURITY;

-- Hosts manage their own page (D14: + super admin). Public directory/person
-- pages read through service-role routes, never directly.
DROP POLICY IF EXISTS "mhp_host_all" ON public.meeting_host_pages;
CREATE POLICY "mhp_host_all" ON public.meeting_host_pages
FOR ALL USING (
  is_super_admin() OR is_admin() OR host_profile_id = auth.uid()
) WITH CHECK (
  is_super_admin() OR is_admin() OR host_profile_id = auth.uid()
);

-- Hosts can SEE their connection row (status/email power the UI banner, D19);
-- all writes go through service-role server actions + the vault RPCs.
DROP POLICY IF EXISTS "mhgc_host_select" ON public.meeting_host_google_connections;
CREATE POLICY "mhgc_host_select" ON public.meeting_host_google_connections
FOR SELECT USING (
  is_super_admin() OR is_admin() OR host_profile_id = auth.uid()
);

-- Anon lockdown posture (2026-06-09 sweep convention): explicit, not implicit.
REVOKE ALL ON public.meeting_host_pages FROM anon;
REVOKE ALL ON public.meeting_host_google_connections FROM anon;

-- ── 7. meetings.view → all staff-type roles (D15) ───────────────────────────
-- Exclusion-list based: every active role EXCEPT learner-class (student, parent,
-- production_learner, cohort_member), external talent/vendor/client (builder,
-- client, maintenance_vendor, mess_caterer, external_auditor_timeboxed),
-- solutions-hub-scoped jicate_staff, and deprecated guest. Menu visibility only —
-- public exposure stays opt-in + Google-gated (D1/D20). One-shot UPDATE: roles
-- created later get the key via Role Management UI.
UPDATE public.custom_roles
SET permissions = COALESCE(permissions, '{}'::jsonb) || '{"meetings.view": true}'::jsonb,
    updated_at  = now()
WHERE is_active = true
  AND role_key NOT IN (
    'student','parent','guest','production_learner','cohort_member',
    'builder','client','maintenance_vendor','mess_caterer',
    'external_auditor_timeboxed','jicate_staff'
  );

NOTIFY pgrst, 'reload schema';
