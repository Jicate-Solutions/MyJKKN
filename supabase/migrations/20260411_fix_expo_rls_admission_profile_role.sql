-- Migration: Fix expo RLS policies to check profiles.role = 'admission'
-- Date: 2026-04-11
-- Reason: Admission officers with profiles.role = 'admission' but no user_roles entry
--         were blocked by RLS because policies only checked user_roles.role_key = 'admission'.
--         The app-layer (usePermissions.isAdmissionGlobalUser) checks BOTH paths, creating
--         a mismatch where the app sends unrestricted queries but RLS silently filters rows.
-- Fix: Add profiles.role IN ('super_admin', 'admission') to all expo table RLS policies.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. expo_masters — SELECT, UPDATE, DELETE
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "expo_masters_select" ON expo_masters;
CREATE POLICY "expo_masters_select" ON expo_masters FOR SELECT USING (
  (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()))
  OR (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admission')))
  OR (EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission'))
);

DROP POLICY IF EXISTS "expo_masters_update" ON expo_masters;
CREATE POLICY "expo_masters_update" ON expo_masters FOR UPDATE USING (
  (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()))
  OR (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admission')))
  OR (EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission'))
);

DROP POLICY IF EXISTS "expo_masters_delete" ON expo_masters;
CREATE POLICY "expo_masters_delete" ON expo_masters FOR DELETE USING (
  (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()))
  OR (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admission')))
  OR (EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission'))
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. expo_events — SELECT, UPDATE, DELETE (team member SELECT policy unchanged)
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "expo_events_select" ON expo_events;
CREATE POLICY "expo_events_select" ON expo_events FOR SELECT USING (
  (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()))
  OR (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admission')))
  OR (EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission'))
);

DROP POLICY IF EXISTS "expo_events_update" ON expo_events;
CREATE POLICY "expo_events_update" ON expo_events FOR UPDATE USING (
  (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()))
  OR (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admission')))
  OR (EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission'))
);

DROP POLICY IF EXISTS "expo_events_delete" ON expo_events;
CREATE POLICY "expo_events_delete" ON expo_events FOR DELETE USING (
  (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()))
  OR (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admission')))
  OR (EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission'))
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. expo_event_team_members — SELECT, UPDATE, DELETE
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "expo_team_select" ON expo_event_team_members;
CREATE POLICY "expo_team_select" ON expo_event_team_members FOR SELECT USING (
  is_super_admin()
  OR (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admission'))
  OR (EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission'))
  OR (expo_event_id IN (SELECT get_my_expo_team_event_ids()))
);

DROP POLICY IF EXISTS "expo_team_update" ON expo_event_team_members;
CREATE POLICY "expo_team_update" ON expo_event_team_members FOR UPDATE USING (
  is_super_admin()
  OR (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admission'))
  OR (EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission'))
  OR (expo_event_id IN (SELECT get_my_expo_team_event_ids()))
);

DROP POLICY IF EXISTS "expo_team_delete" ON expo_event_team_members;
CREATE POLICY "expo_team_delete" ON expo_event_team_members FOR DELETE USING (
  is_super_admin()
  OR (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admission'))
  OR (EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission'))
  OR (expo_event_id IN (SELECT get_my_expo_team_event_ids()))
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. expo_daily_reports — SELECT, UPDATE, DELETE
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "expo_reports_select" ON expo_daily_reports;
CREATE POLICY "expo_reports_select" ON expo_daily_reports FOR SELECT USING (
  (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()))
  OR (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admission')))
  OR (EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission'))
);

DROP POLICY IF EXISTS "expo_reports_update" ON expo_daily_reports;
CREATE POLICY "expo_reports_update" ON expo_daily_reports FOR UPDATE USING (
  (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()))
  OR (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admission')))
  OR (EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission'))
);

DROP POLICY IF EXISTS "expo_reports_delete" ON expo_daily_reports;
CREATE POLICY "expo_reports_delete" ON expo_daily_reports FOR DELETE USING (
  (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()))
  OR (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admission')))
  OR (EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission'))
);
