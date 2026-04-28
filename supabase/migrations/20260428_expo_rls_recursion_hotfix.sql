-- =============================================================================
-- Expo RLS Recursion Hotfix
-- Date: 2026-04-28 (follow-up to 20260428_expo_rls_dynamic_permissions)
-- =============================================================================
-- Bug: previous migration introduced inline EXISTS (SELECT 1 FROM expo_events ...)
-- inside expo_team_* and expo_wa_queue_select policies. Because expo_events also
-- has its own RLS (including expo_events_select_team_member which queries
-- expo_event_team_members), this created a recursion loop:
--   expo_events SELECT  -> expo_events_select_team_member subquery on team_members
--                       -> expo_team_select EXISTS subquery on expo_events
--                       -> ... 42P17 infinite recursion
--
-- Fix: introduce a tiny SECURITY DEFINER helper that returns the parent event's
-- institution_id without triggering RLS, then call it from the child-table
-- policies. CLAUDE.md "NEVER ... query the same table" rule extends transitively
-- across mutually-referencing tables; SECURITY DEFINER short-circuits the loop.
-- =============================================================================

CREATE OR REPLACE FUNCTION _expo_event_institution_id(p_expo_event_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT institution_id FROM expo_events WHERE id = p_expo_event_id LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION _expo_event_institution_id(uuid) TO authenticated;

-- Rewrite expo_event_team_members policies (no inline cross-table SELECT) ----
DROP POLICY IF EXISTS "expo_team_select" ON expo_event_team_members;
CREATE POLICY "expo_team_select" ON expo_event_team_members FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.marketing.expos.view')
      AND role_has_institution_access(_expo_event_institution_id(expo_event_id)))
  OR expo_event_id IN (SELECT get_my_expo_team_event_ids())
);

DROP POLICY IF EXISTS "expo_team_insert" ON expo_event_team_members;
CREATE POLICY "expo_team_insert" ON expo_event_team_members FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.marketing.expos.create')
      AND role_has_institution_access(_expo_event_institution_id(expo_event_id)))
  OR expo_event_id IN (SELECT get_my_expo_team_event_ids())
);

DROP POLICY IF EXISTS "expo_team_update" ON expo_event_team_members;
CREATE POLICY "expo_team_update" ON expo_event_team_members FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.marketing.expos.edit')
      AND role_has_institution_access(_expo_event_institution_id(expo_event_id)))
  OR expo_event_id IN (SELECT get_my_expo_team_event_ids())
);

DROP POLICY IF EXISTS "expo_team_delete" ON expo_event_team_members;
CREATE POLICY "expo_team_delete" ON expo_event_team_members FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.marketing.expos.delete')
      AND role_has_institution_access(_expo_event_institution_id(expo_event_id)))
  OR expo_event_id IN (SELECT get_my_expo_team_event_ids())
);

-- Rewrite expo_wa_message_queue policy ---------------------------------------
DROP POLICY IF EXISTS "expo_wa_queue_select" ON expo_wa_message_queue;
CREATE POLICY "expo_wa_queue_select" ON expo_wa_message_queue FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.marketing.expos.view')
      AND role_has_institution_access(_expo_event_institution_id(expo_event_id)))
  OR expo_event_id = ANY(get_my_expo_event_ids())
);
