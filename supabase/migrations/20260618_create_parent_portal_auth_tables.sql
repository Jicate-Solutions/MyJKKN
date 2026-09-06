-- Migration: Parent Portal — Phase A1 (Auth & Shell foundation)
-- Created: 2026-06-18
-- Spec: docs/spec-Myjkkn-Parent-Portal.md → "Implementation Phases → Phase A1"
--
-- Creates ONLY the four auth/device tables Phase A1 needs:
--   pp_parent_accounts, pp_parent_learner_links, pp_otp_verifications, pp_devices
-- Later phases (A2..A6) add their own pp_* tables in their own migrations
-- (homework, concerns, announcements, …) — see the spec's full schema section.
--
-- Conventions followed from existing migrations:
--   * gen_random_uuid() for PKs (pgcrypto, no extension toggle needed)
--   * public.update_updated_at_column() trigger fn already exists in this DB
--   * RLS enabled as defense-in-depth; the portal reaches these tables ONLY via
--     the service-role client (createServiceRoleClient), which bypasses RLS.
--     Parents never hit Supabase directly, so there is no public/anon policy.
--   * pp_* tables use PLURAL `institutions_id` (matches the BoS convention),
--     while learners_profiles.institution_id (read-only source) stays singular.

-- =====================================================
-- 1. pp_parent_accounts  — one row per parent contact (login identity)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.pp_parent_accounts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mobile           VARCHAR(15) NOT NULL UNIQUE,        -- primary login identifier
  email            VARCHAR(255),
  password_hash    TEXT NOT NULL,                      -- scrypt (salt:hash); see lib/auth/parent-password.ts
  parent_type      VARCHAR(20) NOT NULL CHECK (parent_type IN ('father','mother','guardian')),
  display_name     VARCHAR(255),
  is_active        BOOLEAN DEFAULT true,
  last_login_at    TIMESTAMPTZ,
  push_enabled     BOOLEAN DEFAULT true,
  preferred_locale VARCHAR(10) DEFAULT 'en',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- 2. pp_parent_learner_links  — parent ⇄ learner (sibling model)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.pp_parent_learner_links (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_account_id  UUID NOT NULL REFERENCES public.pp_parent_accounts(id) ON DELETE CASCADE,
  learner_profile_id UUID NOT NULL,                    -- references learners_profiles(id)
  institutions_id    UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  relationship       VARCHAR(20) NOT NULL CHECK (relationship IN ('father','mother','guardian')),
  is_verified        BOOLEAN DEFAULT false,
  verified_at        TIMESTAMPTZ,
  is_primary         BOOLEAN DEFAULT false,            -- the default child shown first
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(parent_account_id, learner_profile_id)
);

-- =====================================================
-- 3. pp_otp_verifications  — short-lived hashed OTPs
-- =====================================================
CREATE TABLE IF NOT EXISTS public.pp_otp_verifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mobile      VARCHAR(15) NOT NULL,
  otp_hash    TEXT NOT NULL,                           -- never store the raw OTP
  purpose     VARCHAR(20) NOT NULL CHECK (purpose IN ('register','login','reset','add_sibling')),
  channel     VARCHAR(10) CHECK (channel IN ('whatsapp','sms')),
  attempts    INTEGER DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL,                    -- now() + 5 min
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- 4. pp_devices  — Web Push subscriptions (PWA, phase A6 sender)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.pp_devices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_account_id UUID NOT NULL REFERENCES public.pp_parent_accounts(id) ON DELETE CASCADE,
  endpoint          TEXT NOT NULL,
  p256dh            TEXT NOT NULL,
  auth              TEXT NOT NULL,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(parent_account_id, endpoint)
);

-- =====================================================
-- Indexes
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_pp_links_parent  ON public.pp_parent_learner_links(parent_account_id);
CREATE INDEX IF NOT EXISTS idx_pp_links_learner ON public.pp_parent_learner_links(learner_profile_id);
CREATE INDEX IF NOT EXISTS idx_pp_otp_mobile    ON public.pp_otp_verifications(mobile, purpose);
CREATE INDEX IF NOT EXISTS idx_pp_devices_parent ON public.pp_devices(parent_account_id);

-- =====================================================
-- updated_at triggers (only on tables that carry updated_at)
-- =====================================================
DROP TRIGGER IF EXISTS trg_pp_parent_accounts_updated_at ON public.pp_parent_accounts;
CREATE TRIGGER trg_pp_parent_accounts_updated_at
  BEFORE UPDATE ON public.pp_parent_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- RLS (defense-in-depth — service-role bypasses; no anon policy by design)
-- =====================================================
ALTER TABLE public.pp_parent_accounts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pp_parent_learner_links  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pp_otp_verifications     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pp_devices               ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- Comments
-- =====================================================
COMMENT ON TABLE public.pp_parent_accounts      IS 'Parent Portal: credential login accounts (one per parent contact). Separate from staff Supabase auth.';
COMMENT ON TABLE public.pp_parent_learner_links IS 'Parent Portal: verified parent⇄learner links; powers the multi-child (sibling) switcher across institutions.';
COMMENT ON TABLE public.pp_otp_verifications    IS 'Parent Portal: short-lived hashed OTPs for register/login/reset/add_sibling.';
COMMENT ON TABLE public.pp_devices              IS 'Parent Portal: Web Push subscriptions per parent account (PWA notifications).';
