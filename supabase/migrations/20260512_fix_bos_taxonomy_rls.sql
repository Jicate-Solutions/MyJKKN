-- Migration: 20260512_fix_bos_taxonomy_rls.sql
--
-- PO / PSO write policies used is_board_chairman_for_programme() which requires
-- an explicit bos_members row with member_type='chairman'. HOD / Principal users
-- who act as institutional chairs without being listed as members were blocked.
--
-- bos_po_pso_mapping and bos_board_programmes write paths were super-admin only.
--
-- Fix: replace all with user_has_permission('academic.bos-taxonomy.edit') /
-- user_has_permission('academic.bos-compositions.edit') — the keys the app grants
-- to hod, principal, coordinator via DEFAULT_ROLE_PERMISSIONS.

-- ── bos_programme_outcomes ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "bos_po_insert" ON public.bos_programme_outcomes;
CREATE POLICY "bos_po_insert" ON public.bos_programme_outcomes
  FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('academic.bos-taxonomy.edit') AND role_has_institution_access(institutions_id))
    OR is_board_chairman_for_programme(institutions_id, programme_code)
  );

DROP POLICY IF EXISTS "bos_po_update" ON public.bos_programme_outcomes;
CREATE POLICY "bos_po_update" ON public.bos_programme_outcomes
  FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('academic.bos-taxonomy.edit') AND role_has_institution_access(institutions_id))
    OR is_board_chairman_for_programme(institutions_id, programme_code)
  );

DROP POLICY IF EXISTS "bos_po_delete" ON public.bos_programme_outcomes;
CREATE POLICY "bos_po_delete" ON public.bos_programme_outcomes
  FOR DELETE USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('academic.bos-taxonomy.edit') AND role_has_institution_access(institutions_id))
    OR is_board_chairman_for_programme(institutions_id, programme_code)
  );

-- ── bos_programme_specific_outcomes ──────────────────────────────────────────

DROP POLICY IF EXISTS "bos_pso_insert" ON public.bos_programme_specific_outcomes;
CREATE POLICY "bos_pso_insert" ON public.bos_programme_specific_outcomes
  FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('academic.bos-taxonomy.edit') AND role_has_institution_access(institutions_id))
    OR is_board_chairman_for_programme(institutions_id, programme_code)
  );

DROP POLICY IF EXISTS "bos_pso_update" ON public.bos_programme_specific_outcomes;
CREATE POLICY "bos_pso_update" ON public.bos_programme_specific_outcomes
  FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('academic.bos-taxonomy.edit') AND role_has_institution_access(institutions_id))
    OR is_board_chairman_for_programme(institutions_id, programme_code)
  );

DROP POLICY IF EXISTS "bos_pso_delete" ON public.bos_programme_specific_outcomes;
CREATE POLICY "bos_pso_delete" ON public.bos_programme_specific_outcomes
  FOR DELETE USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('academic.bos-taxonomy.edit') AND role_has_institution_access(institutions_id))
    OR is_board_chairman_for_programme(institutions_id, programme_code)
  );

-- ── bos_po_pso_mapping ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "bos_po_pso_mapping_write" ON public.bos_po_pso_mapping;
CREATE POLICY "bos_po_pso_mapping_insert" ON public.bos_po_pso_mapping
  FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('academic.bos-taxonomy.edit') AND role_has_institution_access(institutions_id))
    OR is_board_chairman_for_programme(institutions_id, programme_code)
  );
CREATE POLICY "bos_po_pso_mapping_delete" ON public.bos_po_pso_mapping
  FOR DELETE USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('academic.bos-taxonomy.edit') AND role_has_institution_access(institutions_id))
    OR is_board_chairman_for_programme(institutions_id, programme_code)
  );

-- ── bos_board_programmes (write was super-admin only) ─────────────────────────

DROP POLICY IF EXISTS "bos_board_programmes_insert" ON public.bos_board_programmes;
CREATE POLICY "bos_board_programmes_insert" ON public.bos_board_programmes
  FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR (
      user_has_permission('academic.bos-compositions.edit')
      AND role_has_institution_access(institutions_id)
    )
  );

DROP POLICY IF EXISTS "bos_board_programmes_update" ON public.bos_board_programmes;
CREATE POLICY "bos_board_programmes_update" ON public.bos_board_programmes
  FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR (
      user_has_permission('academic.bos-compositions.edit')
      AND role_has_institution_access(institutions_id)
    )
  );

DROP POLICY IF EXISTS "bos_board_programmes_delete" ON public.bos_board_programmes;
CREATE POLICY "bos_board_programmes_delete" ON public.bos_board_programmes
  FOR DELETE USING (
    is_super_admin() OR is_admin()
    OR (
      user_has_permission('academic.bos-compositions.edit')
      AND role_has_institution_access(institutions_id)
    )
  );
