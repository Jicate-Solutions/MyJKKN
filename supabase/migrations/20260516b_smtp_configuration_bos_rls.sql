-- ─────────────────────────────────────────────────────────────────────────────
-- smtp_configuration — table + RLS policies for BoS access
-- ─────────────────────────────────────────────────────────────────────────────
-- This migration is self-contained:
--   1. Creates smtp_configuration if it doesn't already exist (matches the
--      schema the practical-allotment module assumes — both modules read the
--      same row by institution_code so they stay in sync).
--   2. Ensures RLS is enabled.
--   3. Adds SELECT for any authenticated user (read is harmless — passwords
--      are masked at the API layer regardless).
--   4. Adds INSERT/UPDATE/DELETE for super_admin / principal / hod roles,
--      matching the same gate the BoS template editor and SMTP form use
--      client-side (chairman, principal, super-admin).
--
-- Idempotent: every CREATE/DROP uses IF [NOT] EXISTS so it can be re-run.

-- ── Table ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.smtp_configuration (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_code         VARCHAR(50),
  smtp_host                VARCHAR(255) NOT NULL,
  smtp_port                INTEGER DEFAULT 587,
  smtp_secure              BOOLEAN DEFAULT true,
  smtp_user                VARCHAR(255) NOT NULL,
  smtp_password_encrypted  TEXT NOT NULL,
  sender_email             VARCHAR(255) NOT NULL,
  sender_name              VARCHAR(255) DEFAULT 'Controller of Examinations',
  default_cc_emails        TEXT[],
  is_active                BOOLEAN DEFAULT true,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

-- One active row per institution_code (matches BoS UI assumption that
-- looking up SMTP by code returns at most one row).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_smtp_active_per_institution
  ON public.smtp_configuration (institution_code)
  WHERE is_active = true;

-- updated_at trigger — keeps the column fresh on every UPDATE.
CREATE OR REPLACE FUNCTION public.update_smtp_configuration_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_smtp_configuration_updated_at ON public.smtp_configuration;
CREATE TRIGGER trigger_smtp_configuration_updated_at
  BEFORE UPDATE ON public.smtp_configuration
  FOR EACH ROW EXECUTE FUNCTION public.update_smtp_configuration_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.smtp_configuration ENABLE ROW LEVEL SECURITY;

-- ── SELECT: any authenticated user ───────────────────────────────────────────
-- The API masks the password before returning it, so reading the row carries
-- no secret. Keeping SELECT open avoids permission-loop traps where the UI
-- can't even see whether a config exists.
DROP POLICY IF EXISTS smtp_configuration_select ON smtp_configuration;
CREATE POLICY smtp_configuration_select ON smtp_configuration
  FOR SELECT TO authenticated
  USING (true);

-- ── INSERT: super_admin / principal / hod ────────────────────────────────────
DROP POLICY IF EXISTS smtp_configuration_insert ON smtp_configuration;
CREATE POLICY smtp_configuration_insert ON smtp_configuration
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (
          p.is_super_admin = true
          OR p.role IN ('super_admin', 'principal', 'hod')
        )
    )
  );

-- ── UPDATE: super_admin / principal / hod ────────────────────────────────────
DROP POLICY IF EXISTS smtp_configuration_update ON smtp_configuration;
CREATE POLICY smtp_configuration_update ON smtp_configuration
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (
          p.is_super_admin = true
          OR p.role IN ('super_admin', 'principal', 'hod')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (
          p.is_super_admin = true
          OR p.role IN ('super_admin', 'principal', 'hod')
        )
    )
  );

-- ── DELETE: super_admin only ─────────────────────────────────────────────────
-- More restrictive — deleting an SMTP row affects every module that reads it.
DROP POLICY IF EXISTS smtp_configuration_delete ON smtp_configuration;
CREATE POLICY smtp_configuration_delete ON smtp_configuration
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (p.is_super_admin = true OR p.role = 'super_admin')
    )
  );
