-- =====================================================================
-- Department Social Accounts Registry
-- Date: 2026-06-10
-- =====================================================================
-- One row per department-level social media handle (56 Instagram
-- department accounts across 6 colleges at import time). Brings the
-- "Department-Wise Logins" sheet into MyJKKN so handles, login emails,
-- credentials and tool-connection status live in ONE admin surface
-- (/admin/social/departments) instead of a floating spreadsheet.
--
-- Companion to ig_accounts (API-connected accounts): a registry row is
-- the *inventory* record; when the same handle later becomes
-- API-connected (discoverable via the JKKN Business Manager), wire it
-- via ig_account_id and the UI flips its "Monitored" chip.
--
-- SECURITY: login_password is stored for the admin credential vault use
-- case (Director-requested). The table is therefore locked far tighter
-- than sibling ig_* tables:
--   * SELECT only for is_super_admin() OR is_admin()  (matches the
--     SuperAdminOnly gate on /admin/social/* pages)
--   * NO INSERT/UPDATE/DELETE policies — writes are service_role only
--   * anon fully revoked (Supabase default-grant hardening)
-- Data import happens at runtime via service-role REST (never via a
-- committed seed file — keeps credentials out of git history).
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.social_dept_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL DEFAULT 'instagram'
    CHECK (platform IN ('instagram','facebook','youtube','linkedin','x')),
  -- College grouping label exactly as the source sheet names it
  -- (e.g. 'Dental College', 'Arts') — kept verbatim for traceability.
  college_label TEXT NOT NULL,
  institution_id UUID NULL REFERENCES public.institutions(id) ON DELETE SET NULL,
  -- Department name verbatim from the sheet; department_id is set only
  -- when the name confidently matches a departments row.
  department_name_raw TEXT NOT NULL,
  department_id UUID NULL REFERENCES public.departments(id) ON DELETE SET NULL,
  username TEXT NOT NULL,
  login_email TEXT NULL,
  login_password TEXT NULL,
  -- Tool-connection status from the sheet. NULL = unknown/blank.
  content_studio_connected BOOLEAN NULL,
  business_suite_connected BOOLEAN NULL,
  -- Set when this handle is discovered/connected through the Meta Graph
  -- pipeline; the directory then shows it as actively monitored.
  ig_account_id UUID NULL REFERENCES public.ig_accounts(id) ON DELETE SET NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT social_dept_accounts_platform_username_key UNIQUE (platform, username)
);

CREATE INDEX IF NOT EXISTS idx_social_dept_accounts_institution
  ON public.social_dept_accounts (institution_id);
CREATE INDEX IF NOT EXISTS idx_social_dept_accounts_department
  ON public.social_dept_accounts (department_id);

ALTER TABLE public.social_dept_accounts ENABLE ROW LEVEL SECURITY;

-- Credential vault: admins only. Deliberately NOT institution-scoped —
-- this is a cross-college directory for the central admin team.
DROP POLICY IF EXISTS social_dept_accounts_select ON public.social_dept_accounts;
CREATE POLICY social_dept_accounts_select ON public.social_dept_accounts
  FOR SELECT TO authenticated
  USING (is_super_admin() OR is_admin());

-- Writes: service_role only (no authenticated write policies).

REVOKE ALL ON public.social_dept_accounts FROM anon, PUBLIC;
GRANT SELECT ON public.social_dept_accounts TO authenticated;
