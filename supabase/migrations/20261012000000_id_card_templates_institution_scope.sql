-- ============================================================================
-- id_card_templates — scope the four RLS policies per institution
-- ============================================================================
-- ⚠️  NOT YET APPLIED — FILE ONLY. Do NOT run this against production.
--     The Director applies it after reading the who-loses-what table in the PR.
--
-- THE DEFECT (measured on production 2026-08-25 via pg_policy)
-- -----------------------------------------------------------
-- public.id_card_templates HAS an institution_id column, but not one of its
-- four authenticated policies mentions it. Every predicate is permission-only:
--
--   id_card_templates_view   (SELECT) : is_super_admin() OR is_admin() OR user_has_permission('id_cards.templates.view')
--   id_card_templates_create (INSERT) : ...                                  ('id_cards.templates.create')
--   id_card_templates_edit   (UPDATE) : ...                                  ('id_cards.templates.edit')
--   id_card_templates_delete (DELETE) : ...                                  ('id_cards.templates.delete')
--
-- So whoever holds the permission holds it over EVERY college's card design.
-- lib/services/id-cards/template-design-client.ts#fetchTemplatesWithLayout()
-- selects the table with no institution filter whatsoever — RLS is the entire
-- control surface, and pg_proc shows no SECURITY DEFINER function reads this
-- table, so there is no second path to keep in step.
--
-- THE FIX
-- -------
-- The canonical MyJKKN pattern (CLAUDE.md, "Standardized RLS Policy Pattern";
-- see billing_receipts_* for the same shape already in production):
--
--   is_super_admin() OR is_admin()
--   OR (user_has_permission('<key>') AND role_has_institution_access(institution_id))
--
-- No parallel mechanism is invented here. role_has_institution_access() already
-- resolves 'all' vs 'own' role scope, own-institution, CAS sibling colleges and
-- per-user user_institution_access grants — so a role that legitimately needs
-- cross-college reach keeps it through its declared scope rather than through a
-- missing predicate.
--
-- The (SELECT fn()) initplan wrapping below is deliberate and must be kept: it
-- is what migrations rls_initplan_wrap_hot_tables.sql / rls_initplan_wrap_sweep.sql
-- applied estate-wide so the permission functions evaluate once per statement
-- instead of once per row. role_has_institution_access(institution_id) is NOT
-- wrapped — it takes a per-row column and therefore cannot be hoisted.
--
-- HONEST SCOPE OF THIS CHANGE — READ BEFORE APPLYING
-- --------------------------------------------------
-- All three roles that hold these permissions (admission, registrar,
-- id_card_manager) currently carry institution_scope = 'all'. Every one of the
-- nine people holding them therefore satisfies role_has_institution_access()
-- for every institution, so this migration changes NOTHING for NOBODY today —
-- 36 of 36 before/after evaluations were identical when measured on production.
-- It closes the structural hole (any future 'own'-scoped holder is now
-- contained, and the predicate is where a reviewer expects to find it) but it
-- does not by itself take reach away from anyone. Narrowing those three roles
-- to 'own' is the change that bites, and that is a Director decision, not this
-- migration's.
--
-- KNOWN REMAINING HOLE (deliberately not closed here)
-- ---------------------------------------------------
-- role_has_institution_access(NULL) returns TRUE by design ("system-wide
-- records"), and id_card_templates.institution_id is nullable. A template with
-- a NULL institution_id therefore stays globally readable and writable even
-- after this migration — one such row exists today ("DO NOT USE — E2E Test
-- Template"). Making institution_id NOT NULL is the follow-up, and is left out
-- on purpose: a sibling lane is seeding templates for seven more colleges in
-- this same run and a NOT NULL constraint landing mid-seed would break it.
--
-- No SECURITY DEFINER function is created or replaced by this migration, so
-- there is no EXECUTE grant to revoke here. Table-level grants are untouched.
--
-- There is deliberately NO BEGIN/COMMIT in this file, so a reviewer wrapping it
-- in BEGIN … ROLLBACK against production actually rolls back.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SELECT — scoped on purpose, not only the write paths.
--
-- Argued rather than assumed: the editor's list query applies no filter of its
-- own, so an unscoped SELECT is what puts another college's design on screen in
-- the first place, and the Edit button next to it is then a single click. A
-- card design is the artwork, seal placement and field layout that make a card
-- recognisable at a gate — reading a rival institution's is reconnaissance, and
-- the QR on the card cannot prove identity by itself. Scoping SELECT costs a
-- legitimate group-level reader nothing, because "legitimately needs to see all
-- colleges" is exactly what institution_scope='all' and user_institution_access
-- already express; the predicate reads those rather than overriding them. The
-- same predicate on SELECT is also what billing_receipts_select_permission does
-- today, so scoping reads is the house rule, and leaving SELECT open would be
-- the deviation.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "id_card_templates_view" ON public.id_card_templates;
CREATE POLICY "id_card_templates_view"
  ON public.id_card_templates FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR (
      (SELECT public.user_has_permission('id_cards.templates.view'))
      AND public.role_has_institution_access(institution_id)
    )
  );

-- ----------------------------------------------------------------------------
-- INSERT — a new design must be created inside a college you can reach.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "id_card_templates_create" ON public.id_card_templates;
CREATE POLICY "id_card_templates_create"
  ON public.id_card_templates FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR (
      (SELECT public.user_has_permission('id_cards.templates.create'))
      AND public.role_has_institution_access(institution_id)
    )
  );

-- ----------------------------------------------------------------------------
-- UPDATE — USING gates which row you may touch, WITH CHECK gates where you may
-- leave it. Both are scoped, or a reachable row could be re-parented to a
-- college you cannot reach (or, worse, dragged out of one you can).
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "id_card_templates_edit" ON public.id_card_templates;
CREATE POLICY "id_card_templates_edit"
  ON public.id_card_templates FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR (
      (SELECT public.user_has_permission('id_cards.templates.edit'))
      AND public.role_has_institution_access(institution_id)
    )
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR (
      (SELECT public.user_has_permission('id_cards.templates.edit'))
      AND public.role_has_institution_access(institution_id)
    )
  );

-- ----------------------------------------------------------------------------
-- DELETE — the irreversible one. Deleting another college's live design is the
-- single worst outcome the unscoped predicate allowed.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "id_card_templates_delete" ON public.id_card_templates;
CREATE POLICY "id_card_templates_delete"
  ON public.id_card_templates FOR DELETE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR (
      (SELECT public.user_has_permission('id_cards.templates.delete'))
      AND public.role_has_institution_access(institution_id)
    )
  );

COMMENT ON COLUMN public.id_card_templates.institution_id IS
  'Owning institution. Load-bearing since 20261012000000: all four authenticated '
  'RLS policies gate on role_has_institution_access(institution_id). A NULL here '
  'means the row is reachable by every permission holder — see that migration.';

-- ----------------------------------------------------------------------------
-- Guard. RAISE EXCEPTION, never NOTICE: a policy that silently failed to pick
-- up the scope would leave the hole open while every other statement reported
-- success. Asserts on the stored expression, which is what PostgreSQL will
-- actually evaluate — not on the text of this file.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(polname, ', ' ORDER BY polname) INTO missing
  FROM pg_policy
  WHERE polrelid = 'public.id_card_templates'::regclass
    AND polname IN ('id_card_templates_view','id_card_templates_create',
                    'id_card_templates_edit','id_card_templates_delete')
    AND COALESCE(pg_get_expr(polqual, polrelid), '')
      || COALESCE(pg_get_expr(polwithcheck, polrelid), '')
        NOT LIKE '%role_has_institution_access%';

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION
      'id_card_templates policies still unscoped after migration: %', missing;
  END IF;

  IF (SELECT count(*) FROM pg_policy
      WHERE polrelid = 'public.id_card_templates'::regclass
        AND polname IN ('id_card_templates_view','id_card_templates_create',
                        'id_card_templates_edit','id_card_templates_delete')) <> 4 THEN
    RAISE EXCEPTION 'expected 4 authenticated id_card_templates policies';
  END IF;
END $$;
