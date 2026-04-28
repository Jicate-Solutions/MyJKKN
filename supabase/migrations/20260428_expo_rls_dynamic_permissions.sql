-- =============================================================================
-- Expo Module RLS Refactor -> Dynamic Permission Pattern
-- Date: 2026-04-28
-- =============================================================================
-- Replaces hardcoded role_key='admission' checks with user_has_permission() +
-- role_has_institution_access() so any custom role granted
-- 'admission.marketing.expos.*' via Role Management gains access.
--
-- Bug: admission_staff role had full expo permissions but RLS only whitelisted
-- 'admission' role_key, so SELECT returned 0 rows (page loaded empty).
--
-- Pattern follows CLAUDE.md "Standardized RLS Policy Pattern" and matches
-- expo_event_stalls (already migrated 2026-04-21 in BUG-003146).
--
-- Tables affected:
--   - expo_masters             (institution_id direct)
--   - expo_events              (institution_id direct)
--   - expo_event_team_members  (institution_id via parent expo_events)
--   - expo_daily_reports       (institution_id direct)
--   - expo_wa_message_queue    (institution_id via parent expo_events)
--
-- Policies preserved (NOT modified):
--   - expo_events_select_team_member
--   - expo_reports_select_team_member
--   - expo_reports_insert_team_member
--   - expo_event_stalls_*  (already on dynamic pattern)
-- =============================================================================

-- expo_masters --------------------------------------------------------------
DROP POLICY IF EXISTS "expo_masters_select" ON expo_masters;
CREATE POLICY "expo_masters_select" ON expo_masters FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.marketing.expos.view')
      AND role_has_institution_access(institution_id))
);

DROP POLICY IF EXISTS "expo_masters_insert" ON expo_masters;
CREATE POLICY "expo_masters_insert" ON expo_masters FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.marketing.expos.create')
      AND role_has_institution_access(institution_id))
);

DROP POLICY IF EXISTS "expo_masters_update" ON expo_masters;
CREATE POLICY "expo_masters_update" ON expo_masters FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.marketing.expos.edit')
      AND role_has_institution_access(institution_id))
);

DROP POLICY IF EXISTS "expo_masters_delete" ON expo_masters;
CREATE POLICY "expo_masters_delete" ON expo_masters FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.marketing.expos.delete')
      AND role_has_institution_access(institution_id))
);

-- expo_events ---------------------------------------------------------------
DROP POLICY IF EXISTS "expo_events_select" ON expo_events;
CREATE POLICY "expo_events_select" ON expo_events FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.marketing.expos.view')
      AND role_has_institution_access(institution_id))
);

DROP POLICY IF EXISTS "expo_events_insert" ON expo_events;
CREATE POLICY "expo_events_insert" ON expo_events FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.marketing.expos.create')
      AND role_has_institution_access(institution_id))
);

DROP POLICY IF EXISTS "expo_events_update" ON expo_events;
CREATE POLICY "expo_events_update" ON expo_events FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.marketing.expos.edit')
      AND role_has_institution_access(institution_id))
);

DROP POLICY IF EXISTS "expo_events_delete" ON expo_events;
CREATE POLICY "expo_events_delete" ON expo_events FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.marketing.expos.delete')
      AND role_has_institution_access(institution_id))
);

-- expo_event_team_members (no direct institution_id; scope via parent event)
DROP POLICY IF EXISTS "expo_team_select" ON expo_event_team_members;
CREATE POLICY "expo_team_select" ON expo_event_team_members FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.marketing.expos.view')
      AND EXISTS (
        SELECT 1 FROM expo_events e
        WHERE e.id = expo_event_team_members.expo_event_id
          AND role_has_institution_access(e.institution_id)
      ))
  OR expo_event_id IN (SELECT get_my_expo_team_event_ids())
);

DROP POLICY IF EXISTS "expo_team_insert" ON expo_event_team_members;
CREATE POLICY "expo_team_insert" ON expo_event_team_members FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.marketing.expos.create')
      AND EXISTS (
        SELECT 1 FROM expo_events e
        WHERE e.id = expo_event_team_members.expo_event_id
          AND role_has_institution_access(e.institution_id)
      ))
  OR expo_event_id IN (SELECT get_my_expo_team_event_ids())
);

DROP POLICY IF EXISTS "expo_team_update" ON expo_event_team_members;
CREATE POLICY "expo_team_update" ON expo_event_team_members FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.marketing.expos.edit')
      AND EXISTS (
        SELECT 1 FROM expo_events e
        WHERE e.id = expo_event_team_members.expo_event_id
          AND role_has_institution_access(e.institution_id)
      ))
  OR expo_event_id IN (SELECT get_my_expo_team_event_ids())
);

DROP POLICY IF EXISTS "expo_team_delete" ON expo_event_team_members;
CREATE POLICY "expo_team_delete" ON expo_event_team_members FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.marketing.expos.delete')
      AND EXISTS (
        SELECT 1 FROM expo_events e
        WHERE e.id = expo_event_team_members.expo_event_id
          AND role_has_institution_access(e.institution_id)
      ))
  OR expo_event_id IN (SELECT get_my_expo_team_event_ids())
);

-- expo_daily_reports --------------------------------------------------------
DROP POLICY IF EXISTS "expo_reports_select" ON expo_daily_reports;
CREATE POLICY "expo_reports_select" ON expo_daily_reports FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.marketing.expos.view')
      AND role_has_institution_access(institution_id))
);

DROP POLICY IF EXISTS "expo_reports_insert" ON expo_daily_reports;
CREATE POLICY "expo_reports_insert" ON expo_daily_reports FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.marketing.expos.create')
      AND role_has_institution_access(institution_id))
);

DROP POLICY IF EXISTS "expo_reports_update" ON expo_daily_reports;
CREATE POLICY "expo_reports_update" ON expo_daily_reports FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.marketing.expos.edit')
      AND role_has_institution_access(institution_id))
);

DROP POLICY IF EXISTS "expo_reports_delete" ON expo_daily_reports;
CREATE POLICY "expo_reports_delete" ON expo_daily_reports FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.marketing.expos.delete')
      AND role_has_institution_access(institution_id))
);

-- expo_wa_message_queue (no direct institution_id; scope via parent event) --
DROP POLICY IF EXISTS "expo_wa_queue_select" ON expo_wa_message_queue;
CREATE POLICY "expo_wa_queue_select" ON expo_wa_message_queue FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.marketing.expos.view')
      AND EXISTS (
        SELECT 1 FROM expo_events e
        WHERE e.id = expo_wa_message_queue.expo_event_id
          AND role_has_institution_access(e.institution_id)
      ))
  OR expo_event_id = ANY(get_my_expo_event_ids())
);
