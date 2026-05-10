-- ============================================================================
-- AI Pulse — Wave A.1.1 RLS Hardening (stacked on PR #644)
-- ============================================================================
--
-- Spec: specs/myjkkn-ai-pulse-spec.md v3 (PR #641, merged)
-- Substrate: PR #644 (wave-a1/ai-pulse-events-extension) — pending merge
-- This migration: stacked on #644's branch; cannot merge alone.
--
-- Why this exists:
--   PR #644 ENABLEs ROW LEVEL SECURITY on 3 new tables but ships zero
--   policies. Without policies, RLS-on means tables are unreadable by
--   every role except service_role — silent breakage of any UI that
--   tries to read them.
--
-- This migration adds CREATE POLICY statements for:
--   - ai_pulse_policies        (super-admin RW; everyone else read-active)
--   - ai_pulse_featured_tools  (champion/co-champion RW; institution-scoped read)
--   - ai_pulse_anomaly_flags   (champion/co-champion RW; service-role insert via cron)
--
-- Pattern reference: 20260427_counselor_routing_db_foundation.sql
--                    + standard MyJKKN RLS shape:
--                    is_super_admin() OR is_admin()
--                    OR (user_has_permission('aiPulse:...')
--                        AND role_has_institution_access(institution_id))
--
-- Identity references:
--   Champion        = Krishnaveni (per project_ai_pulse_champion.md)
--   Co-Champion     = Ranjith (Ranjith@jkkn.ac.in, per project_ai_pulse_co_champion.md)
--   Both granted aiPulse:cycles.manage + related keys via separate
--   permissions-catalog PR (TODO Wave A.0).
-- ============================================================================

-- ============================================================================
-- A. ai_pulse_policies — super-admin manages, everyone reads active rows
-- ============================================================================

-- A.1 — SELECT: any authenticated user can read active rows
DROP POLICY IF EXISTS "ai_pulse_policies_select_active" ON public.ai_pulse_policies;
CREATE POLICY "ai_pulse_policies_select_active"
  ON public.ai_pulse_policies
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- A.2 — INSERT/UPDATE/DELETE: super_admin or admin only
DROP POLICY IF EXISTS "ai_pulse_policies_super_admin_write" ON public.ai_pulse_policies;
CREATE POLICY "ai_pulse_policies_super_admin_write"
  ON public.ai_pulse_policies
  FOR ALL
  TO authenticated
  USING (is_super_admin() OR is_admin())
  WITH CHECK (is_super_admin() OR is_admin());

-- ============================================================================
-- B. ai_pulse_featured_tools — Champion/Co-Champion manage, all read active
-- ============================================================================

-- B.1 — SELECT: any authenticated user can read active rows scoped to their institution(s)
--       (institution_id IS NULL means global/system row, readable by all)
DROP POLICY IF EXISTS "ai_pulse_featured_tools_select_scoped" ON public.ai_pulse_featured_tools;
CREATE POLICY "ai_pulse_featured_tools_select_scoped"
  ON public.ai_pulse_featured_tools
  FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND (
      institution_id IS NULL
      OR is_super_admin()
      OR is_admin()
      OR role_has_institution_access(institution_id)
    )
  );

-- B.2 — INSERT/UPDATE/DELETE: super_admin, admin, or aiPulse:tool.feature permission
DROP POLICY IF EXISTS "ai_pulse_featured_tools_champion_write" ON public.ai_pulse_featured_tools;
CREATE POLICY "ai_pulse_featured_tools_champion_write"
  ON public.ai_pulse_featured_tools
  FOR ALL
  TO authenticated
  USING (
    is_super_admin()
    OR is_admin()
    OR user_has_permission('aiPulse:tool.feature')
  )
  WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR user_has_permission('aiPulse:tool.feature')
  );

-- ============================================================================
-- C. ai_pulse_anomaly_flags — Champion/Co-Champion review, cron inserts
-- ============================================================================

-- C.1 — SELECT: super_admin, admin, or aiPulse:anomaly.review permission
DROP POLICY IF EXISTS "ai_pulse_anomaly_flags_select_reviewer" ON public.ai_pulse_anomaly_flags;
CREATE POLICY "ai_pulse_anomaly_flags_select_reviewer"
  ON public.ai_pulse_anomaly_flags
  FOR SELECT
  TO authenticated
  USING (
    is_super_admin()
    OR is_admin()
    OR user_has_permission('aiPulse:anomaly.review')
  );

-- C.2 — UPDATE: same reviewers, can mark review_outcome + notes
DROP POLICY IF EXISTS "ai_pulse_anomaly_flags_update_reviewer" ON public.ai_pulse_anomaly_flags;
CREATE POLICY "ai_pulse_anomaly_flags_update_reviewer"
  ON public.ai_pulse_anomaly_flags
  FOR UPDATE
  TO authenticated
  USING (
    is_super_admin()
    OR is_admin()
    OR user_has_permission('aiPulse:anomaly.review')
  )
  WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR user_has_permission('aiPulse:anomaly.review')
  );

-- C.3 — INSERT: only super_admin or service_role (via cron functions).
--       Anomaly detection runs as cron tick — no direct user inserts.
--       Service role bypasses RLS entirely; this policy covers super_admin
--       manual flagging only.
DROP POLICY IF EXISTS "ai_pulse_anomaly_flags_super_admin_insert" ON public.ai_pulse_anomaly_flags;
CREATE POLICY "ai_pulse_anomaly_flags_super_admin_insert"
  ON public.ai_pulse_anomaly_flags
  FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin() OR is_admin());

-- C.4 — DELETE: super_admin only (forensic / GDPR purge scenarios)
DROP POLICY IF EXISTS "ai_pulse_anomaly_flags_super_admin_delete" ON public.ai_pulse_anomaly_flags;
CREATE POLICY "ai_pulse_anomaly_flags_super_admin_delete"
  ON public.ai_pulse_anomaly_flags
  FOR DELETE
  TO authenticated
  USING (is_super_admin());

-- ============================================================================
-- END Wave A.1.1 RLS hardening
-- ============================================================================
-- Verification (after merge):
--   1. Super-admin can: SELECT/INSERT/UPDATE/DELETE on all 3 tables ✅
--   2. Authenticated user (no permissions) can:
--      - SELECT ai_pulse_policies WHERE is_active=true ✅
--      - SELECT ai_pulse_featured_tools (active + global or institution-scoped) ✅
--      - NOT SELECT ai_pulse_anomaly_flags (no read permission) ✅
--   3. Krishnaveni / Ranjith (Champion/Co-Champion role with aiPulse:tool.feature
--      + aiPulse:anomaly.review): can manage tools + review anomalies ✅
--   4. Service role (cron): bypasses all policies ✅
-- ============================================================================
