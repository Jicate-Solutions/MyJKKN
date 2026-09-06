-- ============================================================================
-- An agreement between two JKKN colleges, recorded as a link between them
-- File: supabase/migrations/20260921040000_internal_college_agreements.sql
-- Date: 2026-09-21
--
-- 🛑 FILE ONLY / NOT APPLIED to any database — Director-gated apply.
--
-- WHY
--   The UGC readiness checklist on /accreditation/cac carries one row that is
--   not merely empty but UNRECORDABLE: 'a written agreement binding the
--   colleges to one another'. Its state is a hardcoded literal in
--   app/(routes)/accreditation/cac/_lib/ugc-readiness.ts because no record
--   anywhere can hold the fact. institution_collaborations carries ONE
--   institution_id plus a free-text partner_name, and sh_solution_mous carries
--   no institution at all. So Pharmacy can type "Dental" into a box and nothing
--   knows which two colleges were joined.
--
--   This adds the second side as an OPTIONAL foreign key. The row moves from
--   "no record can hold this" to "the platform holds a place for it and nobody
--   has used it yet" — the second kind of empty, which somebody typing fixes.
--
-- WHAT THE FREE TEXT WAS FOR, AND WHY IT STAYS
--   The free text was a DECISION, not an oversight (SQL_FILE_INDEX.md, the
--   2026-07-31 survey): public.institutions is JKKN's OWN colleges and its id
--   is the multi-tenant RLS key, so an outside university must never be written
--   into it. That reasoning is untouched here. It simply does not apply to a
--   partner that IS a JKKN college. partner_institution_id is NULLABLE and
--   partner_name keeps its meaning and its NOT NULL, so every existing
--   external-partner row stays valid and the external path behaves exactly as
--   before.
--
-- DIRECTOR'S RULING (2026-09-21): when Pharmacy files an agreement with Dental,
--   BOTH COLLEGES SEE IT. One agreement, one record, visible to both
--   signatories — that is what makes it a link rather than two disconnected
--   claims. Hence the SELECT and UPDATE policies gain a partner arm below.
--
-- 🔴 THE NULL TRAP THIS MIGRATION HAD TO AVOID, STATED PLAINLY.
--   role_has_institution_access(NULL) RETURNS TRUE by design — its first branch
--   is "NULL institution_id: always accessible (system-wide records)"
--   (20260521_role_has_institution_access_cas_aware.sql). A partner arm written
--   as the obvious `OR role_has_institution_access(partner_institution_id)`
--   would therefore evaluate TRUE for EVERY external-partner row, since those
--   carry NULL — handing every holder of accreditation.collaborations.view
--   every other college's external MoUs. That is a cross-tenant leak, and it is
--   precisely the external-partner behaviour this file promises to preserve.
--   Both new arms are therefore written
--       partner_institution_id IS NOT NULL AND role_has_institution_access(...)
--   and the IS NOT NULL is load-bearing, not defensive noise.
--
-- ic_delete IS DELIBERATELY NOT WIDENED. Seeing and maintaining a shared record
--   is what "both signatories" means; destroying the other college's record is
--   not, and was not asked for. Deletion stays with the filing college. The
--   register UI mirrors this — the delete action is hidden on a row the
--   viewer's college did not file, and the service now raises instead of
--   silently affecting zero rows.
--
-- OUT OF SCOPE, STATED SO IT IS NOT MISTAKEN FOR AN OVERSIGHT: the evidence
--   trigger emit_institution_collaboration_evidence (20260726100000) names
--   NEW.institution_id explicitly when it writes quality_evidence_mappings, so
--   a second institution column does NOT automatically reach accreditation
--   evidence. An internal agreement emits evidence for the FILING college only,
--   exactly as it does today. Whether a shared agreement should emit evidence
--   twice — once per signatory — is an accreditation question about
--   double-counting, not a schema question, and it is deliberately left alone
--   here. The trigger is not touched by this file.
--
-- WHAT THIS ADDS
--   1. institution_collaborations.partner_institution_id (nullable FK), a
--      not-self CHECK, a partial index, and a column comment.
--   2. ic_select / ic_update re-created with a partner arm. Their existing
--      is_super_admin() OR is_admin() OR (user_has_permission(...) AND
--      role_has_institution_access(...)) shape is preserved verbatim; the arm
--      is appended, nothing is removed.
--   3. fn_cac_internal_agreements_count() — SECURITY DEFINER, so the Council
--      page can read a cluster-wide figure that the viewer's own RLS would
--      otherwise narrow to their college. Same reason fn_cac_cluster_totals
--      exists: a council whose entire output is the cluster-wide reading must
--      not be shown a slice of it.
--
-- SECURITY
--   The RPC is locked per the mandatory template (CLAUDE.md, 2026-06-06):
--   REVOKE ... FROM anon, PUBLIC then GRANT ... TO authenticated. Revoking anon
--   alone is NOT enough — anon is a member of PUBLIC, so an ACL carrying both
--   items still grants anon after revoking anon. Supabase's ALTER DEFAULT
--   PRIVILEGES additionally hands anon a DIRECT execute grant on every new
--   function, separate from PUBLIC, so revoking PUBLIC alone is not enough
--   either. Both, always.
--   A grant to `authenticated` is only half the question, so the function
--   carries its own caller guard as well — the same predicate
--   fn_cac_cluster_totals uses, widened to accept the readiness key that gates
--   the section on screen. Both predicates are COALESCEd: a guard helper
--   returning NULL makes the whole condition NULL, NOT NULL is NULL, the IF
--   never fires and the function answers an unauthorised caller.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The second side of the agreement.
-- ----------------------------------------------------------------------------
ALTER TABLE public.institution_collaborations
  ADD COLUMN IF NOT EXISTS partner_institution_id uuid REFERENCES public.institutions(id);

COMMENT ON COLUMN public.institution_collaborations.partner_institution_id IS
  'The other signatory WHEN IT IS A JKKN COLLEGE. NULL for every external partner — an outside university or company is named in partner_name and must never be written into public.institutions, whose id is the multi-tenant RLS key. Set alongside partner_name (never instead of it): the register UI copies the chosen college''s name into partner_name so the NOT NULL column and every existing reader keep working unchanged. A row with this set is visible to, and maintainable by, BOTH colleges (ic_select / ic_update); it is deletable only by the filing college (ic_delete).';

-- A college cannot sign an agreement with itself.
DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.institution_collaborations'::regclass
      AND conname = 'ic_partner_is_not_self'
  ) THEN
    ALTER TABLE public.institution_collaborations
      ADD CONSTRAINT ic_partner_is_not_self
      CHECK (partner_institution_id IS NULL OR partner_institution_id <> institution_id);
  END IF;
END $constraint$;

-- Partial: the only reads that filter on this column want the rows that HAVE a
-- partner college — the partner arm of ic_select/ic_update, and the count RPC.
CREATE INDEX IF NOT EXISTS idx_ic_partner_institution
  ON public.institution_collaborations (partner_institution_id)
  WHERE partner_institution_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. RLS — both signatories see it, and both can maintain it.
--
--    Shape preserved from 20260726100000 exactly; only the final arm is new.
--    The permission gate is repeated inside the new arm on purpose: belonging
--    to the partner college is not on its own a right to read the register.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "ic_select" ON public.institution_collaborations;
CREATE POLICY "ic_select" ON public.institution_collaborations FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.collaborations.view')
      AND role_has_institution_access(institution_id))
  OR (user_has_permission('accreditation.collaborations.view')
      AND partner_institution_id IS NOT NULL
      AND role_has_institution_access(partner_institution_id))
);

DROP POLICY IF EXISTS "ic_update" ON public.institution_collaborations;
CREATE POLICY "ic_update" ON public.institution_collaborations FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.collaborations.manage')
      AND role_has_institution_access(institution_id))
  OR (user_has_permission('accreditation.collaborations.manage')
      AND partner_institution_id IS NOT NULL
      AND role_has_institution_access(partner_institution_id))
) WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.collaborations.manage')
      AND role_has_institution_access(institution_id))
  OR (user_has_permission('accreditation.collaborations.manage')
      AND partner_institution_id IS NOT NULL
      AND role_has_institution_access(partner_institution_id))
);

-- ic_insert and ic_delete are NOT re-created here. Filing stays with the filing
-- college, and so does deleting. Left untouched rather than restated, so this
-- file cannot silently revert a later change to either.

-- ----------------------------------------------------------------------------
-- 3. The cluster-wide count, read as definer.
--
--    Deliberately NOT a client-side count of institution_collaborations. That
--    table is RLS-scoped, so counting it in the browser returns the viewer's
--    slice, and a council member scoped to one college would be shown their own
--    college's agreements as the cluster's. Two council members would read two
--    different figures from the same screen.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_cac_internal_agreements_count()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- COALESCE on EVERY predicate — see the SECURITY note in the header.
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR COALESCE(public.user_has_permission('accreditation.cac.view'), false)
    OR COALESCE(public.user_has_permission('accreditation.cac.readiness.view'), false)
  ) THEN
    RAISE EXCEPTION
      'Not authorised to read the Cluster Academic Council agreement count'
      USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*)::integer INTO v_count
  FROM public.institution_collaborations
  WHERE partner_institution_id IS NOT NULL;

  RETURN COALESCE(v_count, 0);
END;
$$;

COMMENT ON FUNCTION public.fn_cac_internal_agreements_count() IS
  'Cluster-wide count of institution_collaborations rows joining two JKKN colleges (partner_institution_id IS NOT NULL). Read as definer so the Cluster Academic Council''s UGC readiness checklist shows one figure to every council member rather than each member''s RLS slice. Guarded on accreditation.cac.view OR accreditation.cac.readiness.view; returns a bare integer and no row detail.';

-- MANDATORY LOCK. anon is a member of PUBLIC and additionally holds a direct
-- Supabase default grant, so revoking either one alone leaves anon executing.
REVOKE EXECUTE ON FUNCTION public.fn_cac_internal_agreements_count() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cac_internal_agreements_count() TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. Apply-time asserts — fail loudly here rather than leaving a leak or a
--    missing column to be discovered on a screen (same discipline as
--    20260726100000 and 20260808210100). Effective privilege is asserted, never
--    the ACL string: an ACL can carry both anon and PUBLIC items and still
--    grant anon after a bare anon revoke.
-- ----------------------------------------------------------------------------
DO $assert$
DECLARE
  v_fn  oid;
  v_pol text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'institution_collaborations'
      AND column_name = 'partner_institution_id'
  ) THEN
    RAISE EXCEPTION 'institution_collaborations.partner_institution_id was not added';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.institution_collaborations'::regclass
      AND conname = 'ic_partner_is_not_self'
  ) THEN
    RAISE EXCEPTION 'ic_partner_is_not_self CHECK is missing — a college could sign with itself';
  END IF;

  -- The NULL guard is the whole security of the partner arm. Assert it is
  -- actually in the shipped expression of BOTH policies, so a later edit that
  -- drops it fails here instead of leaking every external MoU cluster-wide.
  FOREACH v_pol IN ARRAY ARRAY['ic_select', 'ic_update'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'institution_collaborations'
        AND policyname = v_pol
        AND COALESCE(qual, '') LIKE '%partner_institution_id IS NOT NULL%'
    ) THEN
      RAISE EXCEPTION
        'policy % does not guard partner_institution_id IS NOT NULL — role_has_institution_access(NULL) is TRUE, so every external-partner row would be readable cluster-wide', v_pol;
    END IF;
  END LOOP;

  SELECT p.oid INTO v_fn
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_cac_internal_agreements_count';

  IF v_fn IS NULL THEN
    RAISE EXCEPTION 'public.fn_cac_internal_agreements_count was not created';
  END IF;

  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute fn_cac_internal_agreements_count';
  END IF;

  IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot execute fn_cac_internal_agreements_count';
  END IF;

  IF NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = v_fn) THEN
    RAISE EXCEPTION 'fn_cac_internal_agreements_count is not SECURITY DEFINER';
  END IF;
END $assert$;

-- Reload PostgREST's schema cache so the new column and function resolve
-- immediately after a raw Management-API apply (which does NOT auto-reload).
NOTIFY pgrst, 'reload schema';
