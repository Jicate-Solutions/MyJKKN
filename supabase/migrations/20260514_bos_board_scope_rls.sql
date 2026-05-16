-- ============================================================================
-- Migration: 20260514_bos_board_scope_rls.sql
-- Description: Defense-in-depth RLS for BOS module — adds board-level scoping
--              to the existing institution-level RLS. Mirrors the API-layer
--              guards (lib/utils/bos/bos-access.ts) so that:
--                • board members see only their composition's rows
--                • principals see all rows in their institution(s) (read-only
--                  on most writes, with carve-outs at the API layer)
--                • the board chairman is the only non-super-admin allowed to
--                  edit the composition record or manage members
--                • syllabus edits are restricted to the creator OR the
--                  chairman of any active composition on that board
--                • the user who CREATED a composition can still view/edit it
--                  before a chairman is appointed (bootstrap case)
-- Created:     2026-05-14
-- ============================================================================
-- Rollback: see the bottom of this file.

-- ── Prelude: bos_compositions.created_by column ────────────────────────────
-- The RLS policies below reference this column, so we add it FIRST inside the
-- same migration to avoid migration-order fragility. Idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bos_compositions' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE bos_compositions
      ADD COLUMN created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bos_compositions_created_by ON bos_compositions(created_by);

-- ── Helper functions ────────────────────────────────────────────────────────
-- SECURITY DEFINER is required so the function bypasses RLS on the staff,
-- bos_members, bos_compositions, profiles tables when evaluating predicates.
-- STABLE is required so PostgreSQL can cache results per row evaluation.
-- search_path is set explicitly to prevent function-resolution shadowing.

-- Is the current user a "principal" (governor) in the BoS sense?
CREATE OR REPLACE FUNCTION public.is_bos_principal_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role = 'principal' FROM profiles WHERE id = (SELECT auth.uid())),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_bos_principal_user() TO authenticated;

-- Is the current user an active member of the given composition?
-- Walks: staff.profile_id = auth.uid() → bos_members.staff_id → composition.
-- Both the member row and the composition must be active.
CREATE OR REPLACE FUNCTION public.is_bos_member_of(p_composition_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM bos_members m
    JOIN bos_compositions c ON c.id = m.composition_id
    JOIN staff s ON s.id = m.staff_id
    WHERE s.profile_id = (SELECT auth.uid())
      AND m.composition_id = p_composition_id
      AND m.is_active = true
      AND c.is_active = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_bos_member_of(UUID) TO authenticated;

-- Is the current user the chairman of the given composition?
CREATE OR REPLACE FUNCTION public.is_bos_chairman_of(p_composition_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM bos_members m
    JOIN bos_compositions c ON c.id = m.composition_id
    JOIN staff s ON s.id = m.staff_id
    WHERE s.profile_id = (SELECT auth.uid())
      AND m.composition_id = p_composition_id
      AND m.member_type = 'chairman'
      AND m.is_active = true
      AND c.is_active = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_bos_chairman_of(UUID) TO authenticated;

-- Is the current user the chairman of ANY active composition tied to a board?
-- Used for syllabus edit (syllabi carry board_id, not composition_id).
CREATE OR REPLACE FUNCTION public.is_bos_chairman_of_board(p_board_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM bos_members m
    JOIN bos_compositions c ON c.id = m.composition_id
    JOIN staff s ON s.id = m.staff_id
    WHERE s.profile_id = (SELECT auth.uid())
      AND c.board_id = p_board_id
      AND m.member_type = 'chairman'
      AND m.is_active = true
      AND c.is_active = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_bos_chairman_of_board(UUID) TO authenticated;

-- Is the current user any active member of ANY active composition on a board?
-- Used for syllabus read filtering.
CREATE OR REPLACE FUNCTION public.is_bos_member_of_board(p_board_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM bos_members m
    JOIN bos_compositions c ON c.id = m.composition_id
    JOIN staff s ON s.id = m.staff_id
    WHERE s.profile_id = (SELECT auth.uid())
      AND c.board_id = p_board_id
      AND m.is_active = true
      AND c.is_active = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_bos_member_of_board(UUID) TO authenticated;


-- ── bos_compositions: SELECT/INSERT/UPDATE/DELETE ──────────────────────────
-- created_by carve-out: the user who created the row (POST handler stamps
-- bos_compositions.created_by = auth.uid()) can view/edit/delete it even
-- before any bos_members rows exist. This is the bootstrap case — the HOD
-- needs to finish setup (add chairman + members) post-creation; without this
-- clause they'd be locked out of their own brand-new row.
DROP POLICY IF EXISTS "bos_compositions_select" ON bos_compositions;
CREATE POLICY "bos_compositions_select" ON bos_compositions FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('bos.compositions.view')
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
    user_has_permission('bos.compositions.create')
    AND role_has_institution_access(institutions_id)
    -- Principals cannot create compositions (read-only on board data)
    AND NOT is_bos_principal_user()
  )
);

DROP POLICY IF EXISTS "bos_compositions_update" ON bos_compositions;
CREATE POLICY "bos_compositions_update" ON bos_compositions FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('bos.compositions.edit')
    AND role_has_institution_access(institutions_id)
    -- Chairman of this comp OR the creator (until a chairman is appointed).
    AND (is_bos_chairman_of(id) OR created_by = (SELECT auth.uid()))
  )
);

DROP POLICY IF EXISTS "bos_compositions_delete" ON bos_compositions;
CREATE POLICY "bos_compositions_delete" ON bos_compositions FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('bos.compositions.delete')
    AND role_has_institution_access(institutions_id)
    AND (is_bos_chairman_of(id) OR created_by = (SELECT auth.uid()))
  )
);


-- ── bos_members: SELECT/INSERT/UPDATE/DELETE ───────────────────────────────
-- SELECT must remain permissive enough for the API-layer scope resolution
-- to read the user's OWN member rows even if bos.members.view permission is
-- missing — otherwise resolveBosBoardScope returns empty sets and the entire
-- API hangs at "no access". The "own staff row" clause covers this.
DROP POLICY IF EXISTS "bos_members_select" ON bos_members;
CREATE POLICY "bos_members_select" ON bos_members FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR EXISTS (
    -- Always allow reading your own member rows (scope-resolution bootstrap).
    SELECT 1 FROM staff s
    WHERE s.id = bos_members.staff_id
      AND s.profile_id = (SELECT auth.uid())
  )
  OR (
    user_has_permission('bos.members.view')
    AND role_has_institution_access(institutions_id)
    AND (is_bos_principal_user() OR is_bos_member_of(composition_id))
  )
);

-- Members INSERT/UPDATE/DELETE: chairman OR creator of the parent composition.
-- The creator carve-out is essential because the HOD who just made the comp
-- needs to add the chairman row before is_bos_chairman_of() can ever return
-- true for them — without this clause it's a chicken-and-egg lockout.
DROP POLICY IF EXISTS "bos_members_insert" ON bos_members;
CREATE POLICY "bos_members_insert" ON bos_members FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('bos.members.create')
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
    user_has_permission('bos.members.edit')
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
    user_has_permission('bos.members.delete')
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


-- ── bos_meetings: SELECT/INSERT/UPDATE/DELETE ──────────────────────────────
DROP POLICY IF EXISTS "bos_meetings_select" ON bos_meetings;
CREATE POLICY "bos_meetings_select" ON bos_meetings FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('bos.meetings.view')
    AND role_has_institution_access(institutions_id)
    AND (is_bos_principal_user() OR is_bos_member_of(composition_id))
  )
);

DROP POLICY IF EXISTS "bos_meetings_insert" ON bos_meetings;
CREATE POLICY "bos_meetings_insert" ON bos_meetings FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('bos.meetings.create')
    AND role_has_institution_access(institutions_id)
    AND is_bos_member_of(composition_id)
  )
);

-- UPDATE: principal carve-out — they may transition statuses on any meeting
-- in their institution. Field-level restriction (no content edits) is enforced
-- at the API layer; RLS only gates row-level write access.
DROP POLICY IF EXISTS "bos_meetings_update" ON bos_meetings;
CREATE POLICY "bos_meetings_update" ON bos_meetings FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('bos.meetings.edit')
    AND role_has_institution_access(institutions_id)
    AND (is_bos_principal_user() OR is_bos_member_of(composition_id))
  )
);

DROP POLICY IF EXISTS "bos_meetings_delete" ON bos_meetings;
CREATE POLICY "bos_meetings_delete" ON bos_meetings FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('bos.meetings.delete')
    AND role_has_institution_access(institutions_id)
    AND is_bos_chairman_of(composition_id)
  )
);


-- ── bos_meeting_attendees ──────────────────────────────────────────────────
-- Inherits composition scope through the parent meeting.
DROP POLICY IF EXISTS "bos_attendees_select" ON bos_meeting_attendees;
CREATE POLICY "bos_attendees_select" ON bos_meeting_attendees FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('bos.meetings.view')
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
    user_has_permission('bos.meetings.edit')
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
    user_has_permission('bos.meetings.edit')
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
    user_has_permission('bos.meetings.edit')
    AND role_has_institution_access(institutions_id)
    AND EXISTS (
      SELECT 1 FROM bos_meetings m
      WHERE m.id = bos_meeting_attendees.meeting_id
        AND is_bos_member_of(m.composition_id)
    )
  )
);


-- ── bos_agenda_items ───────────────────────────────────────────────────────
-- Same pattern as attendees — composition scope via parent meeting.
DROP POLICY IF EXISTS "bos_agenda_select" ON bos_agenda_items;
CREATE POLICY "bos_agenda_select" ON bos_agenda_items FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('bos.meetings.view')
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
    user_has_permission('bos.meetings.edit')
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
    user_has_permission('bos.meetings.edit')
    AND role_has_institution_access(institutions_id)
    AND (
      -- Principal carve-out for resolution / approval flow
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
    user_has_permission('bos.meetings.edit')
    AND role_has_institution_access(institutions_id)
    AND EXISTS (
      SELECT 1 FROM bos_meetings m
      WHERE m.id = bos_agenda_items.meeting_id
        AND is_bos_member_of(m.composition_id)
    )
  )
);


-- ── bos_resolution_actions ─────────────────────────────────────────────────
-- Reaches composition via agenda_item → meeting. Principal carve-out for
-- INSERT/UPDATE because principals approve action items (per Phase 3 spec).
DROP POLICY IF EXISTS "bos_actions_select" ON bos_resolution_actions;
CREATE POLICY "bos_actions_select" ON bos_resolution_actions FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('bos.meetings.view')
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
    user_has_permission('bos.meetings.edit')
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
    user_has_permission('bos.meetings.edit')
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
    user_has_permission('bos.meetings.edit')
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
    user_has_permission('bos.ta_da.view')
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
    user_has_permission('bos.ta_da.create')
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
    user_has_permission('bos.ta_da.edit')
    AND role_has_institution_access(institutions_id)
    AND EXISTS (
      SELECT 1 FROM bos_meetings m
      WHERE m.id = bos_ta_da_claims.meeting_id
        AND is_bos_member_of(m.composition_id)
    )
  )
);

-- DELETE policy keeps the original super-admin-only restriction (financial
-- records should not be deleted by non-admins).
-- (No change to the existing "bos_tada_delete" policy; left as-is.)


-- ── bos_course_syllabi ─────────────────────────────────────────────────────
-- Syllabi carry board_id (NOT composition_id) and created_by references
-- auth.users.id directly. Read = any member of any active comp on board, OR
-- principal in same institution. Edit = creator OR chairman of board.
DROP POLICY IF EXISTS "bos_syllabi_read_own_institution" ON bos_course_syllabi;
DROP POLICY IF EXISTS "bos_course_syllabi_select" ON bos_course_syllabi;
CREATE POLICY "bos_course_syllabi_select" ON bos_course_syllabi FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('bos.syllabus.view')
    AND role_has_institution_access(institutions_id)
    AND (is_bos_principal_user() OR is_bos_member_of_board(board_id))
  )
);

DROP POLICY IF EXISTS "bos_course_syllabi_insert" ON bos_course_syllabi;
CREATE POLICY "bos_course_syllabi_insert" ON bos_course_syllabi FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('bos.syllabus.create')
    AND role_has_institution_access(institutions_id)
    AND is_bos_member_of_board(board_id)
  )
);

DROP POLICY IF EXISTS "bos_course_syllabi_update" ON bos_course_syllabi;
CREATE POLICY "bos_course_syllabi_update" ON bos_course_syllabi FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('bos.syllabus.edit')
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
    user_has_permission('bos.syllabus.delete')
    AND role_has_institution_access(institutions_id)
    AND (
      created_by = (SELECT auth.uid())
      OR is_bos_chairman_of_board(board_id)
    )
  )
);


-- ── Rollback ────────────────────────────────────────────────────────────────
-- To revert this migration:
--   1. Re-create the prior policies from:
--      - supabase/migrations/20260306_create_bos_tables.sql
--      - supabase/migrations/20260506_create_bos_course_syllabi_table.sql
--   2. Drop the helper functions:
--      DROP FUNCTION IF EXISTS public.is_bos_member_of_board(UUID);
--      DROP FUNCTION IF EXISTS public.is_bos_chairman_of_board(UUID);
--      DROP FUNCTION IF EXISTS public.is_bos_chairman_of(UUID);
--      DROP FUNCTION IF EXISTS public.is_bos_member_of(UUID);
--      DROP FUNCTION IF EXISTS public.is_bos_principal_user();
