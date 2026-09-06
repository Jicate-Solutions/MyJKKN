-- Updated: 2026-07-15 - Learners Council OD: event-scope chain matching, per-college
-- fallback chain, and per-request step freezing.
--
-- Context
-- -------
-- Three related gaps, all decided by the product owner on 2026-07-15:
--
-- 1. SCOPE MATCHING. lc_od_approval_chains carries an event_scope
--    (campus | inter_campus | institution_wide) that was written on create and then
--    never read -- createODRequest just grabbed the first active chain for the college.
--    The chains page even told users "the chain is matched by event scope", which was
--    untrue. Matching is implemented in the service layer (createODRequest reads
--    lc_events.scope for the request's linked event); this migration only adds the
--    columns/constraints the matching relies on.
--
-- 2. FALLBACK. "Several chains per scope, newest wins" was chosen, but a request can have
--    no event at all (event_id is nullable) or hit a scope with no chain. Each college
--    marks exactly ONE chain as its fallback ("use this when nothing else fits"), enforced
--    by a partial unique index. fn_lc_set_fallback_chain() flips it atomically so an
--    officer never trips the unique constraint.
--
-- 3. STEP FREEZE. approveODRequest / getMyPendingApprovals read chain.steps LIVE, so
--    editing a chain rewrote the rules under requests already mid-approval. Requests now
--    snapshot the chain's steps at submit time into lc_od_requests.steps_snapshot; the
--    approval path reads the snapshot. Edits only affect NEW requests.
--
-- Safe to ship: zero OD requests have ever existed (verified 2026-07-15), so there is no
-- in-flight data to migrate and nothing to break.

-- ============================================================================
-- 1. STEP FREEZE COLUMN
-- ============================================================================

ALTER TABLE lc_od_requests
  ADD COLUMN IF NOT EXISTS steps_snapshot jsonb;

COMMENT ON COLUMN lc_od_requests.steps_snapshot IS
  'The approval chain steps as they were at submit time. The approval path reads THIS, '
  'not the live chain, so editing a chain never changes the rules for a request already '
  'in the queue. Null only for a draft that has not been submitted yet.';

-- ============================================================================
-- 2. FALLBACK FLAG + ONE-PER-COLLEGE CONSTRAINT
-- ============================================================================

ALTER TABLE lc_od_approval_chains
  ADD COLUMN IF NOT EXISTS is_fallback boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN lc_od_approval_chains.is_fallback IS
  'The college''s default OD chain, used when a request has no event scope to match on or '
  'no chain matches that scope. At most one per college (partial unique index below).';

-- At most one fallback chain per college. Partial index = only fallback rows are unique;
-- non-fallback chains are unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS lc_od_chains_one_fallback_per_institution
  ON lc_od_approval_chains (institution_id)
  WHERE is_fallback;

-- Backfill: make each college's newest active chain its fallback, so scope-matching going
-- live never blocks a student whose college has only one chain (which is every college
-- today: each covers a single scope).
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY institution_id ORDER BY created_at DESC) AS rn
  FROM lc_od_approval_chains
  WHERE is_active
)
UPDATE lc_od_approval_chains c
   SET is_fallback = true
  FROM ranked r
 WHERE c.id = r.id
   AND r.rn = 1
   AND NOT EXISTS (  -- don't fight an existing fallback if this is re-run
     SELECT 1 FROM lc_od_approval_chains f
     WHERE f.institution_id = c.institution_id AND f.is_fallback AND f.id <> c.id
   );

-- ============================================================================
-- 3. ATOMIC FALLBACK SETTER (executives only)
-- ============================================================================

-- Flips the fallback flag for a college in one statement so the partial unique index is
-- never transiently violated. Gated to LC office bearers / super admins, matching the
-- lc_od_chains_update RLS policy.
CREATE OR REPLACE FUNCTION public.fn_lc_set_fallback_chain(p_chain_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_institution uuid;
BEGIN
  IF NOT (is_super_admin() OR fn_is_lc_executive()) THEN
    RAISE EXCEPTION 'Only Learners Council office bearers can set the fallback chain'
      USING ERRCODE = '42501';
  END IF;

  SELECT institution_id INTO v_institution
  FROM lc_od_approval_chains
  WHERE id = p_chain_id;

  IF v_institution IS NULL THEN
    RAISE EXCEPTION 'Approval chain % not found', p_chain_id USING ERRCODE = 'P0002';
  END IF;

  -- Clear then set, both within this function's single transaction.
  UPDATE lc_od_approval_chains
     SET is_fallback = false
   WHERE institution_id = v_institution AND is_fallback AND id <> p_chain_id;

  UPDATE lc_od_approval_chains
     SET is_fallback = true
   WHERE id = p_chain_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_lc_set_fallback_chain(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_lc_set_fallback_chain(uuid) TO authenticated;
