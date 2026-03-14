-- Migration: Make expo module global (not institution-scoped)
-- Date: 2026-03-14
-- Reason: Expos are cross-institutional marketing activities shared across all JKKN institutions

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Make institution_id nullable on expo tables
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE expo_masters ALTER COLUMN institution_id DROP NOT NULL;
ALTER TABLE expo_masters DROP CONSTRAINT IF EXISTS expo_masters_institution_id_fkey;
ALTER TABLE expo_masters ADD CONSTRAINT expo_masters_institution_id_fkey
  FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE SET NULL;

ALTER TABLE expo_events ALTER COLUMN institution_id DROP NOT NULL;
ALTER TABLE expo_events DROP CONSTRAINT IF EXISTS expo_events_institution_id_fkey;
ALTER TABLE expo_events ADD CONSTRAINT expo_events_institution_id_fkey
  FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE SET NULL;

ALTER TABLE expo_daily_reports ALTER COLUMN institution_id DROP NOT NULL;
ALTER TABLE expo_daily_reports DROP CONSTRAINT IF EXISTS expo_daily_reports_institution_id_fkey;
ALTER TABLE expo_daily_reports ADD CONSTRAINT expo_daily_reports_institution_id_fkey
  FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Drop old institution-scoped RLS policies and create open ones
-- ═══════════════════════════════════════════════════════════════════════════

-- expo_masters
DROP POLICY IF EXISTS "expo_masters_select" ON expo_masters;
DROP POLICY IF EXISTS "expo_masters_insert" ON expo_masters;
DROP POLICY IF EXISTS "expo_masters_update" ON expo_masters;
DROP POLICY IF EXISTS "expo_masters_delete" ON expo_masters;

CREATE POLICY "expo_masters_select" ON expo_masters FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "expo_masters_insert" ON expo_masters FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "expo_masters_update" ON expo_masters FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "expo_masters_delete" ON expo_masters FOR DELETE USING (auth.uid() IS NOT NULL);

-- expo_events
DROP POLICY IF EXISTS "expo_events_select" ON expo_events;
DROP POLICY IF EXISTS "expo_events_insert" ON expo_events;
DROP POLICY IF EXISTS "expo_events_update" ON expo_events;
DROP POLICY IF EXISTS "expo_events_delete" ON expo_events;

CREATE POLICY "expo_events_select" ON expo_events FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "expo_events_insert" ON expo_events FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "expo_events_update" ON expo_events FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "expo_events_delete" ON expo_events FOR DELETE USING (auth.uid() IS NOT NULL);

-- expo_event_team_members
DROP POLICY IF EXISTS "expo_team_select" ON expo_event_team_members;
DROP POLICY IF EXISTS "expo_team_insert" ON expo_event_team_members;
DROP POLICY IF EXISTS "expo_team_update" ON expo_event_team_members;
DROP POLICY IF EXISTS "expo_team_delete" ON expo_event_team_members;

CREATE POLICY "expo_team_select" ON expo_event_team_members FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "expo_team_insert" ON expo_event_team_members FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "expo_team_update" ON expo_event_team_members FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "expo_team_delete" ON expo_event_team_members FOR DELETE USING (auth.uid() IS NOT NULL);

-- expo_daily_reports
DROP POLICY IF EXISTS "expo_reports_select" ON expo_daily_reports;
DROP POLICY IF EXISTS "expo_reports_insert" ON expo_daily_reports;
DROP POLICY IF EXISTS "expo_reports_update" ON expo_daily_reports;
DROP POLICY IF EXISTS "expo_reports_delete" ON expo_daily_reports;

CREATE POLICY "expo_reports_select" ON expo_daily_reports FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "expo_reports_insert" ON expo_daily_reports FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "expo_reports_update" ON expo_daily_reports FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "expo_reports_delete" ON expo_daily_reports FOR DELETE USING (auth.uid() IS NOT NULL);
