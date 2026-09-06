-- ============================================================================
-- 20260630120100 — Schools Network HM Portal: magic-link tokens table
-- ============================================================================
-- HMs (headmasters / principals of external + internal schools) are NOT in
-- auth.users. They sign in via single-use magic links scoped to their school
-- (resolved through school_contacts.email at link-issue time).
--
-- This table stores the single-use, 15-min-TTL tokens. On verify we consume
-- the row (set consumed_at) and mint a separate session JWT (HttpOnly cookie).
-- The session cookie itself carries no replay risk because magic links are
-- consumed exactly once and the session JWT is short-lived (24h default).
--
-- We deliberately do NOT FK to schools(id) or school_contacts(id) — those
-- tables are part of the Schools Network module (Agent A's migration) which
-- may land in a different PR. The link payload (email, school_id) is stored
-- as plain values; verification re-resolves school_contact at consume time.
-- ============================================================================

-- Updated: 2026-06-30 - Schools Network HM Portal magic-link store
CREATE TABLE IF NOT EXISTS public.school_portal_magic_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Lowercased contact email the link was issued to. Matched against
  -- school_contacts.email at consume time (case-insensitive).
  email           TEXT NOT NULL,
  -- Resolved at issue time; re-verified at consume time. Stored as plain UUID
  -- (no FK) so this migration can land independently of Agent A's schools migration.
  school_id       UUID NOT NULL,
  -- Random opaque nonce stored as SHA-256 hex (server-side hash; the link
  -- itself carries the raw nonce). Prevents anyone with DB read access from
  -- reusing a stored link.
  token_hash      TEXT NOT NULL,
  -- 15-min default (configurable via env at issue time).
  expires_at      TIMESTAMPTZ NOT NULL,
  consumed_at     TIMESTAMPTZ,
  -- Issuer metadata (User-Agent + IP) for audit; not load-bearing.
  issued_ua       TEXT,
  issued_ip       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Prevents replay: a single token_hash can only be redeemed once.
  CONSTRAINT school_portal_magic_links_token_hash_unique UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS school_portal_magic_links_email_idx
  ON public.school_portal_magic_links (lower(email));

CREATE INDEX IF NOT EXISTS school_portal_magic_links_unconsumed_idx
  ON public.school_portal_magic_links (expires_at) WHERE consumed_at IS NULL;

ALTER TABLE public.school_portal_magic_links ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated access. Service-role-only writes/reads from the
-- /api/schools-portal/auth/* routes; HM sessions never query this table
-- directly. (RLS still ON for defense-in-depth.)
REVOKE ALL ON public.school_portal_magic_links FROM anon, authenticated;

-- Audit comment
COMMENT ON TABLE public.school_portal_magic_links IS
  'Single-use magic-link tokens for the Schools Network HM Portal (/schools-portal). Issued by /api/schools-portal/auth/request-link, consumed by /api/schools-portal/auth/verify. 15-min TTL; consumed_at marks redemption to prevent replay.';
