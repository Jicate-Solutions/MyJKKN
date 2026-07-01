-- Migration: cross-college mentor-pairing visibility (BUG-004291)
-- Date: 2026-07-01
--
-- USER-APPROVED PRODUCT DECISION: CDC staff VIEW mentor pairings across ALL
-- colleges (cross-college visibility), but EDIT only their own college's pairs.
-- The cross-college VIEW is intentional and signed off by the user — it is NOT
-- an accidental scope leak.
--
-- Before this migration cdc_mentor_pairings had:
--   * SELECT  policy  cdc_mentor_pairings_read  = (auth.uid() IS NOT NULL)
--   * FOR ALL policy  cdc_mentor_pairings_write = is_cdc_staff()
-- i.e. reads were open to every authenticated user, and ANY CDC staff could
-- write ANY college's pair (no institution scoping on writes at all).
--
-- After this migration:
--   * SELECT              -> is_cdc_staff(): any CDC staff (cdc_head /
--     cdc_coordinator / super admin) can VIEW every college's pairs. This is the
--     intentional, user-approved cross-college view.
--   * INSERT/UPDATE/DELETE -> is_cdc_staff() AND access to the pairing's OWNING
--     college (the MENTEE learner's institution). A cdc_coordinator
--     (institution_scope='own') can therefore EDIT only their own college's
--     pairs; a cdc_head (institution_scope='all') and super admins can edit any
--     college's pairs. This is what enforces "EDIT own-college only".
--
-- WHY a SECURITY DEFINER helper for the write check:
--   cdc_mentor_pairings has no institution_id column — a pairing's owning
--   college is the MENTEE learner's institution. learners_profiles SELECT is
--   itself institution-scoped, so an INLINE sub-select inside the policy would
--   return NULL for an other-college mentee (the row is hidden from the caller
--   by learners_profiles RLS), and role_has_institution_access(NULL) returns
--   TRUE — which would WRONGLY let a coordinator edit another college's pair.
--   The helper is SECURITY DEFINER so the institution lookup bypasses
--   learners_profiles RLS and returns the real institution_id, closing that
--   hole. role_has_institution_access() still evaluates against the CALLING
--   user's roles/institution (it reads auth.uid()), so scoping stays correct.

-- ── write-eligibility helper (own-college edit gate) ─────────────────────────
CREATE OR REPLACE FUNCTION public.fn_cdc_mentor_pairing_write_allowed(p_mentee_learner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_cdc_staff()
     AND public.role_has_institution_access(
           (SELECT lp.institution_id
              FROM public.learners_profiles lp
             WHERE lp.id = p_mentee_learner_id)
         );
$$;

-- Lock down: Supabase's default ALTER DEFAULT PRIVILEGES grants EXECUTE on every
-- new function to anon; revoke it so only authenticated sessions can call this.
REVOKE EXECUTE ON FUNCTION public.fn_cdc_mentor_pairing_write_allowed(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cdc_mentor_pairing_write_allowed(uuid) TO authenticated;

-- ── read policy: cross-college view for CDC staff (user-approved) ────────────
DROP POLICY IF EXISTS cdc_mentor_pairings_read ON public.cdc_mentor_pairings;
CREATE POLICY cdc_mentor_pairings_read ON public.cdc_mentor_pairings
  FOR SELECT
  USING ( public.is_cdc_staff() );

-- ── write policies: own-college only (scoped INSERT / UPDATE / DELETE) ───────
DROP POLICY IF EXISTS cdc_mentor_pairings_write  ON public.cdc_mentor_pairings;
DROP POLICY IF EXISTS cdc_mentor_pairings_insert ON public.cdc_mentor_pairings;
DROP POLICY IF EXISTS cdc_mentor_pairings_update ON public.cdc_mentor_pairings;
DROP POLICY IF EXISTS cdc_mentor_pairings_delete ON public.cdc_mentor_pairings;

CREATE POLICY cdc_mentor_pairings_insert ON public.cdc_mentor_pairings
  FOR INSERT
  WITH CHECK ( public.fn_cdc_mentor_pairing_write_allowed(mentee_learner_id) );

CREATE POLICY cdc_mentor_pairings_update ON public.cdc_mentor_pairings
  FOR UPDATE
  USING      ( public.fn_cdc_mentor_pairing_write_allowed(mentee_learner_id) )
  WITH CHECK ( public.fn_cdc_mentor_pairing_write_allowed(mentee_learner_id) );

CREATE POLICY cdc_mentor_pairings_delete ON public.cdc_mentor_pairings
  FOR DELETE
  USING ( public.fn_cdc_mentor_pairing_write_allowed(mentee_learner_id) );
