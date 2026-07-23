-- ============================================================================
-- Migration: 20260514a_bos_board_scope_rls_fix_perm_keys.sql
-- Description: Corrects 20260514_bos_board_scope_rls.sql which used the wrong
--              permission key format. The canonical keys (used by the role-
--              seeding code and by 20260512_fix_bos_members_rls.sql) are
--              `academic.bos-<module>.<action>`, NOT `bos.<module>.<action>`.
--
-- Symptom this fixes: RLS denial on bos_members INSERT for any non-admin user,
-- even one who is the creator/chairman of the parent composition, because
-- `user_has_permission('bos.members.create')` always returns false (that key
-- was never seeded in custom_roles.permissions).
--
-- Mapping (matches 20260512's design — members are managed via the parent
-- composition's permission, not a separate members permission):
--   bos.compositions.{view,create,edit,delete}
--     → academic.bos-compositions.{view,create,edit,delete}
--   bos.members.{view,create,edit,delete}
--     → academic.bos-compositions.{view,edit,edit,edit}
--   bos.meetings.{view,create,edit,delete}
--     → academic.bos-meetings.{view,create,edit,delete}
--   bos.ta_da.{view,create,edit}
--     → academic.bos-ta-da.{view,create,edit}
--   bos.syllabus.{view,create,edit,delete}
--     → academic.bos-syllabus.{view,create,edit,delete}
-- Created: 2026-05-14
-- ============================================================================

-- ── bos_compositions ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "bos_compositions_select" ON bos_compositions;
CREATE POLICY "bos_compositions_select" ON bos_compositions FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('academic.bos-compositions.view')
    AND role_has_institution_access(institutions_id)
    AND (
      is_bos_principal_user()
      OR is_bos_member_of(id)
      OR created_by = (SELECT auth.uid())
    )
  )
);

DROP POLICY IF EXISTS "bos_compositions_insert" ON bos_compositions;
CREATE POLICY "bos_compositions_insert" ON bos_compositions FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('academic.bos-compositions.create')
    AND role_has_institution_access(institutions_id)
    AND NOT is_bos_principal_user()
  )
);

DROP POLICY IF EXISTS "bos_compositions_update" ON bos_compositions;
CREATE POLICY "bos_compositions_update" ON bos_compositions FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('academic.bos-compositions.edit')
    AND role_has_institution_access(institutions_id)
    AND (is_bos_chairman_of(id) OR created_by = (SELECT auth.uid()))
  )
);

DROP POLICY IF EXISTS "bos_compositions_delete" ON bos_compositions;
CREATE POLICY "bos_compositions_delete" ON bos_compositions FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('academic.bos-compositions.delete')
    AND role_has_institution_access(institutions_id)
    AND (is_bos_chairman_of(id) OR created_by = (SELECT auth.uid()))
  )
);


-- ── bos_members ─────────────────────────────────────────────────────────────
-- Members are managed via the parent composition's permission (per 20260512).
-- The own-row bootstrap clause stays so users can read their own member rows
-- for scope resolution even without academic.bos-compositions.view.
DROP POLICY IF EXISTS "bos_members_select" ON bos_members;
CREATE POLICY "bos_members_select" ON bos_members FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR EXISTS (
    SELECT 1 FROM staff s
    WHERE s.id = bos_members.staff_id
      AND s.profile_id = (SELECT auth.uid())
  )
  OR (
    user_has_permission('academic.bos-compositions.view')
    AND role_has_institution_access(institutions_id)
    AND (is_bos_principal_user() OR is_bos_member_of(composition_id))
  )
);

DROP POLICY IF EXISTS "bos_members_insert" ON bos_members;
CREATE POLICY "bos_members_insert" ON bos_members FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('academic.bos-compositions.edit')
    AND role_has_institution_access(institutions_id)
    AND (
      is_bos_chairman_of(composition_id)
      OR EXISTS (
        SELECT 1 FROM bos_compositions c
        WHERE c.id = bos_members.composition_id
          AND c.created_by = (SELECT auth.uid())
      )
    )
  )
);

DROP POLICY IF EXISTS "bos_members_update" ON bos_members;
CREATE POLICY "bos_members_update" ON bos_members FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('academic.bos-compositions.edit')
    AND role_has_institution_access(institutions_id)
    AND (
      is_bos_chairman_of(composition_id)
      OR EXISTS (
        SELECT 1 FROM bos_compositions c
        WHERE c.id = bos_members.composition_id
          AND c.created_by = (SELECT auth.uid())
      )
    )
  )
);

DROP POLICY IF EXISTS "bos_members_delete" ON bos_members;
CREATE POLICY "bos_members_delete" ON bos_members FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('academic.bos-compositions.edit')
    AND role_has_institution_access(institutions_id)
    AND (
      is_bos_chairman_of(composition_id)
      OR EXISTS (
        SELECT 1 FROM bos_compositions c
        WHERE c.id = bos_members.composition_id
          AND c.created_by = (SELECT auth.uid())
      )
    )
  )
);


-- ── bos_meetings ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "bos_meetings_select" ON bos_meetings;
CREATE POLICY "bos_meetings_select" ON bos_meetings FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('academic.bos-meetings.view')
    AND role_has_institution_access(institutions_id)
    AND (is_bos_principal_user() OR is_bos_member_of(composition_id))
  )
);

DROP POLICY IF EXISTS "bos_meetings_insert" ON bos_meetings;
CREATE POLICY "bos_meetings_insert" ON bos_meetings FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('academic.bos-meetings.create')
    AND role_has_institution_access(institutions_id)
    AND is_bos_member_of(composition_id)
  )
);

DROP POLICY IF EXISTS "bos_meetings_update" ON bos_meetings;
CREATE POLICY "bos_meetings_update" ON bos_meetings FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('academic.bos-meetings.edit')
    AND role_has_institution_access(institutions_id)
    AND (is_bos_principal_user() OR is_bos_member_of(composition_id))
  )
);

DROP POLICY IF EXISTS "bos_meetings_delete" ON bos_meetings;
CREATE POLICY "bos_meetings_delete" ON bos_meetings FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('academic.bos-meetings.delete')
    AND role_has_institution_access(institutions_id)
    AND is_bos_chairman_of(composition_id)
  )
);


-- ── bos_meeting_attendees ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "bos_attendees_select" ON bos_meeting_attendees;
CREATE POLICY "bos_attendees_select" ON bos_meeting_attendees FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('academic.bos-meetings.view')
    AND role_has_institution_access(institutions_id)
    AND (
      is_bos_principal_user()
      OR EXISTS (
        SELECT 1 FROM bos_meetings m
        WHERE m.id = bos_meeting_attendees.meeting_id
          AND is_bos_member_of(m.composition_id)
      )
    )
  )
);

DROP POLICY IF EXISTS "bos_attendees_insert" ON bos_meeting_attendees;
CREATE POLICY "bos_attendees_insert" ON bos_meeting_attendees FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('academic.bos-meetings.edit')
    AND role_has_institution_access(institutions_id)
    AND EXISTS (
      SELECT 1 FROM bos_meetings m
      WHERE m.id = bos_meeting_attendees.meeting_id
        AND is_bos_member_of(m.composition_id)
    )
  )
);

DROP POLICY IF EXISTS "bos_attendees_update" ON bos_meeting_attendees;
CREATE POLICY "bos_attendees_update" ON bos_meeting_attendees FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('academic.bos-meetings.edit')
    AND role_has_institution_access(institutions_id)
    AND EXISTS (
      SELECT 1 FROM bos_meetings m
      WHERE m.id = bos_meeting_attendees.meeting_id
        AND is_bos_member_of(m.composition_id)
    )
  )
);

DROP POLICY IF EXISTS "bos_attendees_delete" ON bos_meeting_attendees;
CREATE POLICY "bos_attendees_delete" ON bos_meeting_attendees FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('academic.bos-meetings.edit')
    AND role_has_institution_access(institutions_id)
    AND EXISTS (
      SELECT 1 FROM bos_meetings m
      WHERE m.id = bos_meeting_attendees.meeting_id
        AND is_bos_member_of(m.composition_id)
    )
  )
);


-- ── bos_agenda_items ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "bos_agenda_select" ON bos_agenda_items;
CREATE POLICY "bos_agenda_select" ON bos_agenda_items FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('academic.bos-meetings.view')
    AND role_has_institution_access(institutions_id)
    AND (
      is_bos_principal_user()
      OR EXISTS (
        SELECT 1 FROM bos_meetings m
        WHERE m.id = bos_agenda_items.meeting_id
          AND is_bos_member_of(m.composition_id)
      )
    )
  )
);

DROP POLICY IF EXISTS "bos_agenda_insert" ON bos_agenda_items;
CREATE POLICY "bos_agenda_insert" ON bos_agenda_items FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('academic.bos-meetings.edit')
    AND role_has_institution_access(institutions_id)
    AND EXISTS (
      SELECT 1 FROM bos_meetings m
      WHERE m.id = bos_agenda_items.meeting_id
        AND is_bos_member_of(m.composition_id)
    )
  )
);

DROP POLICY IF EXISTS "bos_agenda_update" ON bos_agenda_items;
CREATE POLICY "bos_agenda_update" ON bos_agenda_items FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('academic.bos-meetings.edit')
    AND role_has_institution_access(institutions_id)
    AND (
      is_bos_principal_user()
      OR EXISTS (
        SELECT 1 FROM bos_meetings m
        WHERE m.id = bos_agenda_items.meeting_id
          AND is_bos_member_of(m.composition_id)
      )
    )
  )
);

DROP POLICY IF EXISTS "bos_agenda_delete" ON bos_agenda_items;
CREATE POLICY "bos_agenda_delete" ON bos_agenda_items FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('academic.bos-meetings.edit')
    AND role_has_institution_access(institutions_id)
    AND EXISTS (
      SELECT 1 FROM bos_meetings m
      WHERE m.id = bos_agenda_items.meeting_id
        AND is_bos_member_of(m.composition_id)
    )
  )
);


-- ── bos_resolution_actions ────────────────────────────────────────────────
DROP POLICY IF EXISTS "bos_actions_select" ON bos_resolution_actions;
CREATE POLICY "bos_actions_select" ON bos_resolution_actions FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('academic.bos-meetings.view')
    AND role_has_institution_access(institutions_id)
    AND (
      is_bos_principal_user()
      OR EXISTS (
        SELECT 1
        FROM bos_agenda_items a
        JOIN bos_meetings m ON m.id = a.meeting_id
        WHERE a.id = bos_resolution_actions.agenda_item_id
          AND is_bos_member_of(m.composition_id)
      )
    )
  )
);

DROP POLICY IF EXISTS "bos_actions_insert" ON bos_resolution_actions;
CREATE POLICY "bos_actions_insert" ON bos_resolution_actions FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('academic.bos-meetings.edit')
    AND role_has_institution_access(institutions_id)
    AND (
      is_bos_principal_user()
      OR EXISTS (
        SELECT 1
        FROM bos_agenda_items a
        JOIN bos_meetings m ON m.id = a.meeting_id
        WHERE a.id = bos_resolution_actions.agenda_item_id
          AND is_bos_member_of(m.composition_id)
      )
    )
  )
);

DROP POLICY IF EXISTS "bos_actions_update" ON bos_resolution_actions;
CREATE POLICY "bos_actions_update" ON bos_resolution_actions FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('academic.bos-meetings.edit')
    AND role_has_institution_access(institutions_id)
    AND (
      is_bos_principal_user()
      OR EXISTS (
        SELECT 1
        FROM bos_agenda_items a
        JOIN bos_meetings m ON m.id = a.meeting_id
        WHERE a.id = bos_resolution_actions.agenda_item_id
          AND is_bos_member_of(m.composition_id)
      )
    )
  )
);

DROP POLICY IF EXISTS "bos_actions_delete" ON bos_resolution_actions;
CREATE POLICY "bos_actions_delete" ON bos_resolution_actions FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('academic.bos-meetings.edit')
    AND role_has_institution_access(institutions_id)
    AND EXISTS (
      SELECT 1
      FROM bos_agenda_items a
      JOIN bos_meetings m ON m.id = a.meeting_id
      WHERE a.id = bos_resolution_actions.agenda_item_id
        AND is_bos_member_of(m.composition_id)
    )
  )
);


-- ── bos_ta_da_claims ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "bos_tada_select" ON bos_ta_da_claims;
CREATE POLICY "bos_tada_select" ON bos_ta_da_claims FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('academic.bos-ta-da.view')
    AND role_has_institution_access(institutions_id)
    AND (
      is_bos_principal_user()
      OR EXISTS (
        SELECT 1 FROM bos_meetings m
        WHERE m.id = bos_ta_da_claims.meeting_id
          AND is_bos_member_of(m.composition_id)
      )
    )
  )
);

DROP POLICY IF EXISTS "bos_tada_insert" ON bos_ta_da_claims;
CREATE POLICY "bos_tada_insert" ON bos_ta_da_claims FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('academic.bos-ta-da.create')
    AND role_has_institution_access(institutions_id)
    AND EXISTS (
      SELECT 1 FROM bos_meetings m
      WHERE m.id = bos_ta_da_claims.meeting_id
        AND is_bos_member_of(m.composition_id)
    )
  )
);

DROP POLICY IF EXISTS "bos_tada_update" ON bos_ta_da_claims;
CREATE POLICY "bos_tada_update" ON bos_ta_da_claims FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('academic.bos-ta-da.edit')
    AND role_has_institution_access(institutions_id)
    AND EXISTS (
      SELECT 1 FROM bos_meetings m
      WHERE m.id = bos_ta_da_claims.meeting_id
        AND is_bos_member_of(m.composition_id)
    )
  )
);


-- ── bos_course_syllabi ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "bos_course_syllabi_select" ON bos_course_syllabi;
CREATE POLICY "bos_course_syllabi_select" ON bos_course_syllabi FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('academic.bos-syllabus.view')
    AND role_has_institution_access(institutions_id)
    AND (is_bos_principal_user() OR is_bos_member_of_board(board_id))
  )
);

DROP POLICY IF EXISTS "bos_course_syllabi_insert" ON bos_course_syllabi;
CREATE POLICY "bos_course_syllabi_insert" ON bos_course_syllabi FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('academic.bos-syllabus.create')
    AND role_has_institution_access(institutions_id)
    AND is_bos_member_of_board(board_id)
  )
);

DROP POLICY IF EXISTS "bos_course_syllabi_update" ON bos_course_syllabi;
CREATE POLICY "bos_course_syllabi_update" ON bos_course_syllabi FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('academic.bos-syllabus.edit')
    AND role_has_institution_access(institutions_id)
    AND (
      created_by = (SELECT auth.uid())
      OR is_bos_chairman_of_board(board_id)
    )
  )
);

DROP POLICY IF EXISTS "bos_course_syllabi_delete" ON bos_course_syllabi;
CREATE POLICY "bos_course_syllabi_delete" ON bos_course_syllabi FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('academic.bos-syllabus.delete')
    AND role_has_institution_access(institutions_id)
    AND (
      created_by = (SELECT auth.uid())
      OR is_bos_chairman_of_board(board_id)
    )
  )
);

NOTIFY pgrst, 'reload schema';
