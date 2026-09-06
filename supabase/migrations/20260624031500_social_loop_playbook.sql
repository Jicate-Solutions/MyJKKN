-- =====================================================================
-- Social Loop Engine — Playbook / Memory Table
-- Date: 2026-06-24
-- =====================================================================
-- One row per CLOSED cycle per Instagram account: the durable memory of
-- the department innovation loop (Read → Decide → Act → Learn). Each row
-- snapshots what the READ looked like at close time, the DECISION carried
-- into the next cycle, and the single human learning written down.
--
-- The Loop's "memory": when a department closes a weekly cycle, it writes
-- one playbook row keyed by (account_id, cycle_no). The next cycle reads
-- the previous row's `decide` (barToBeat / nextInstruction) to know what
-- to beat and what to try — turning a one-off review into a ratchet.
--
-- Columns:
--   read_summary JSONB — snapshot of the READ (metrics/top posts) at close
--   decide       JSONB — { formatInstruction, barToBeat, nextInstruction,
--                          domainHypothesis }
--   learning     TEXT  — the one human change written down for the cycle
--
-- SECURITY: dynamic-permission RLS (Role Management UI is source of truth).
--   * SELECT  → is_super_admin() OR is_admin() OR user_has_permission('social.view')
--   * INSERT  → is_super_admin() OR is_admin() OR user_has_permission('social.manage')
--   * UPDATE  → is_super_admin() OR is_admin() OR user_has_permission('social.manage')
-- Writes are gated to social.manage (or admins). anon is fully revoked
-- (Supabase default-grants anon EXECUTE/ALL on new objects — hardened here).
--
-- Idempotent + self-contained: CREATE TABLE IF NOT EXISTS + index + RLS +
-- DROP POLICY IF EXISTS before each CREATE POLICY + grants.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.social_loop_playbook (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.ig_accounts(id) ON DELETE CASCADE,
  cycle_no INT NOT NULL,
  week_start DATE NOT NULL DEFAULT (now()::date),
  -- snapshot of the READ at close time
  read_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- { formatInstruction, barToBeat, nextInstruction, domainHypothesis }
  decide JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- the one human change written down
  learning TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT social_loop_playbook_account_cycle_key UNIQUE (account_id, cycle_no)
);

CREATE INDEX IF NOT EXISTS idx_social_loop_playbook_account
  ON public.social_loop_playbook (account_id, cycle_no DESC);

ALTER TABLE public.social_loop_playbook ENABLE ROW LEVEL SECURITY;

-- SELECT: read for social.view (or admins).
DROP POLICY IF EXISTS social_loop_playbook_select ON public.social_loop_playbook;
CREATE POLICY social_loop_playbook_select ON public.social_loop_playbook
  FOR SELECT TO authenticated
  USING (is_super_admin() OR is_admin() OR user_has_permission('social.view'));

-- INSERT: write gated to social.manage (or admins).
DROP POLICY IF EXISTS social_loop_playbook_insert ON public.social_loop_playbook;
CREATE POLICY social_loop_playbook_insert ON public.social_loop_playbook
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR is_admin() OR user_has_permission('social.manage'));

-- UPDATE: write gated to social.manage (or admins).
DROP POLICY IF EXISTS social_loop_playbook_update ON public.social_loop_playbook;
CREATE POLICY social_loop_playbook_update ON public.social_loop_playbook
  FOR UPDATE TO authenticated
  USING (is_super_admin() OR is_admin() OR user_has_permission('social.manage'))
  WITH CHECK (is_super_admin() OR is_admin() OR user_has_permission('social.manage'));

-- anon hardening (Supabase default-grants anon ALL on new tables).
REVOKE ALL ON public.social_loop_playbook FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.social_loop_playbook TO authenticated;
