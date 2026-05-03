-- =====================================================================
-- Migration: exophone_institution_map (M-1 — DB-driven ExoPhone → institution)
-- Created:   2026-05-03
-- Purpose:   Replace the 5-entry hardcoded EXOPHONE_MAP at
--            lib/services/telephony/telephony-service.ts:1311 with a
--            super_admin-editable DB table. Per probe-capture-2026-05-03.md
--            (PROBE-A finding D1), 22 of 27 active inbound DIDs are NOT in
--            the hardcoded map and silently default to JKKN Pharmacy →
--            8+ institutions are mis-attributed in dashboards.
--
-- Director's standing rule (2026-04-29, feedback_policy_decisions_must_be_config_rows.md):
--   Per-row data → its own table. (NOT a platform_policies row — this is
--   per-DID lookup data, not a tunable threshold/flag.)
--
-- This is a SUBSTRATE migration:
--   - Creates the table + RLS + helper RPC
--   - Seeds the 5 currently-hardcoded entries (idempotent)
--   - Director will fill in the remaining 22 DIDs via the
--     /admin/exophone-mapping UI once Exotel provides canonical mapping.
--
-- Service-layer cutover:
--   lib/services/admin/exophone-institution-map-service.ts (new)
--   reads from this table with a 60s in-memory cache and falls back to
--   the hardcoded EXOPHONE_MAP if DB read fails — zero regression risk.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exophone_institution_map (
  exophone        text PRIMARY KEY,
  institution_id  uuid NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,
  description     text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid REFERENCES auth.users
);

COMMENT ON TABLE public.exophone_institution_map IS
  'DB-driven ExoPhone → institution_id mapping. Replaces the hardcoded EXOPHONE_MAP at lib/services/telephony/telephony-service.ts:1311. Edit via /admin/exophone-mapping (super_admin only). 22 of 27 active inbound DIDs were silently defaulting to Pharmacy before this — per probe-capture-2026-05-03.md.';

COMMENT ON COLUMN public.exophone_institution_map.exophone IS
  'DID/ExoPhone number as Exotel reports it on inbound webhooks. Store the canonical leading-zero form (e.g. ''04446313503''). Lookup is exact-match plus a +91/91-stripped fallback at the service layer.';

-- ---------------------------------------------------------------------
-- Index for is_active filtering
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_exophone_institution_map_active
  ON public.exophone_institution_map (is_active)
  WHERE is_active = true;

-- ---------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_exophone_institution_map_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS exophone_institution_map_touch ON public.exophone_institution_map;
CREATE TRIGGER exophone_institution_map_touch
BEFORE UPDATE ON public.exophone_institution_map
FOR EACH ROW EXECUTE FUNCTION public.fn_exophone_institution_map_touch();

-- ---------------------------------------------------------------------
-- RLS: super_admin/admin write; everyone authenticated reads (resolution
-- happens in webhook hot-path, must not be RLS-blocked).
-- ---------------------------------------------------------------------
ALTER TABLE public.exophone_institution_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exophone_institution_map_read" ON public.exophone_institution_map;
CREATE POLICY "exophone_institution_map_read" ON public.exophone_institution_map
FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "exophone_institution_map_write" ON public.exophone_institution_map;
CREATE POLICY "exophone_institution_map_write" ON public.exophone_institution_map
FOR ALL
USING (is_super_admin() OR is_admin())
WITH CHECK (is_super_admin() OR is_admin());

-- ---------------------------------------------------------------------
-- Helper RPC: get_institution_for_exophone(text)
-- SECURITY DEFINER so server-side webhook can call without RLS interference.
-- Tries exact match first, then strips +91/91 prefix, then prepends 0 to
-- last-10 digits — mirrors the service-layer normalization.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_institution_for_exophone(p_exophone text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_institution_id uuid;
  v_clean text;
  v_last10 text;
BEGIN
  IF p_exophone IS NULL OR length(trim(p_exophone)) = 0 THEN
    RETURN NULL;
  END IF;

  -- Direct match
  SELECT institution_id INTO v_institution_id
  FROM public.exophone_institution_map
  WHERE exophone = p_exophone AND is_active = true
  LIMIT 1;
  IF v_institution_id IS NOT NULL THEN
    RETURN v_institution_id;
  END IF;

  -- Strip +91 / 91 prefix
  v_clean := regexp_replace(p_exophone, '^\+?91', '');
  IF v_clean <> p_exophone THEN
    SELECT institution_id INTO v_institution_id
    FROM public.exophone_institution_map
    WHERE exophone = v_clean AND is_active = true
    LIMIT 1;
    IF v_institution_id IS NOT NULL THEN
      RETURN v_institution_id;
    END IF;
  END IF;

  -- Try with leading zero on last-10
  IF length(v_clean) >= 10 THEN
    v_last10 := '0' || right(v_clean, 10);
    SELECT institution_id INTO v_institution_id
    FROM public.exophone_institution_map
    WHERE exophone = v_last10 AND is_active = true
    LIMIT 1;
  END IF;

  RETURN v_institution_id;
END;
$$;

COMMENT ON FUNCTION public.get_institution_for_exophone(text) IS
  'Resolve ExoPhone DID to institution_id with +91/91/0-prefix fallbacks. Returns NULL if no active row matches — caller must fall back to a default. SECURITY DEFINER so webhook handler bypasses RLS in hot path.';

GRANT EXECUTE ON FUNCTION public.get_institution_for_exophone(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- Seed: the 5 hardcoded entries from telephony-service.ts:1311
-- All currently default to JKKN College of Pharmacy in production. We
-- seed them to that institution to preserve current behavior — Director
-- will reassign the 4 non-Pharmacy DIDs via the admin UI when the
-- canonical Exotel mapping is available.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_pharmacy_id uuid;
BEGIN
  -- Look up JKKN College of Pharmacy by hardcoded UUID (matches
  -- EXOTEL_DEFAULT_INSTITUTION_ID in telephony-service.ts:1308-1309).
  -- If the institution row doesn't exist (e.g., fresh local DB), skip
  -- seeding silently — service layer falls back to in-code map anyway.
  SELECT id INTO v_pharmacy_id
  FROM public.institutions
  WHERE id = '5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334'::uuid
  LIMIT 1;

  IF v_pharmacy_id IS NULL THEN
    RAISE NOTICE 'JKKN Pharmacy institution not found — skipping exophone seed (service layer fallback engages)';
    RETURN;
  END IF;

  INSERT INTO public.exophone_institution_map (exophone, institution_id, description, is_active)
  VALUES
    ('04446313503', v_pharmacy_id, '1-JKKN-COLLEGES (main IVR) — DEFAULT seed; Director to reassign per-college if needed', true),
    ('04446313545', v_pharmacy_id, '1-JKKN-SCHOOLS — DEFAULT seed; should map to school institution if separate row exists', true),
    ('04446313596', v_pharmacy_id, '1-JKKN-AMBULANCE — DEFAULT seed; ambulance/emergency line', true),
    ('04448134434', v_pharmacy_id, '1-JKKN-DENTAL — DEFAULT seed; should map to JKKN Dental College institution', true),
    ('04446310202', v_pharmacy_id, 'Dharmapuri-2025 — DEFAULT seed; Dharmapuri campus', true)
  ON CONFLICT (exophone) DO NOTHING;
END;
$$;
