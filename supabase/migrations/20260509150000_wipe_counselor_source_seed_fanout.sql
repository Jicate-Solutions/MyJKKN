-- ============================================================================
-- Phase 8: Wipe the 528 seed-fan-out junction rows in admission_counselor_sources
-- ============================================================================
-- Context:
--   Earlier seed migrations populated admission_counselor_sources with a full
--   cross-product (every active counselor × every system source) — 528 rows
--   today (44 counselors × 12 system sources). This made the source-scoping
--   RLS we shipped in Phase 5 effectively a no-op: counselors are "mapped" to
--   every source, so the RLS predicate `source IN <user's mappings>` matched
--   everything.
--
--   The user has confirmed admin will explicitly assign counselors to sources
--   via the new Phase 3 UI. After this wipe:
--     - Existing counselors keep visibility ONLY on directly-assigned leads
--       (via assigned_counselor_id = auth.uid())
--     - All source-based visibility flows through admin's explicit mappings
--     - The auto-assignment trigger v3 also relies on this junction; with the
--       wipe its `institution_and_source` tier returns no candidates and
--       routing falls through to `institution_only` tier (still functional)
--
-- Safety:
--   - The 528 rows are seed-default with no business meaning (verified Phase 0).
--   - This is destructive but reversible: `SELECT id, user_id FROM
--     admission_counselors WHERE is_active=true` × the 12 active sources will
--     reproduce the original cross-product on demand.
--   - We DO NOT delete the master rows or the counselor rows — just the junction.
-- ============================================================================

BEGIN;

-- Capture pre-wipe counts for the audit log
DO $$
DECLARE
  v_before_count int;
BEGIN
  SELECT COUNT(*) INTO v_before_count FROM admission_counselor_sources;
  RAISE NOTICE 'Phase 8 wipe: admission_counselor_sources had % rows before delete', v_before_count;
END $$;

DELETE FROM admission_counselor_sources;

DO $$
DECLARE
  v_after_count int;
BEGIN
  SELECT COUNT(*) INTO v_after_count FROM admission_counselor_sources;
  RAISE NOTICE 'Phase 8 wipe: admission_counselor_sources has % rows after delete', v_after_count;
  IF v_after_count <> 0 THEN
    RAISE EXCEPTION 'Phase 8 wipe failed — junction still has % rows', v_after_count;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Helper: enum values currently mapped to a user (active, in-window, not paused)
-- Used by the API routes (leads + call_logs) to build a PostgREST .in() filter.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._user_assigned_source_enums(p_uid uuid)
RETURNS SETOF lead_source
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT m.enum_value
  FROM admission_counselors ac
  JOIN admission_counselor_sources cs ON cs.counselor_id = ac.id
  JOIN admission_lead_sources_master m ON m.id = cs.source_id
  WHERE ac.user_id = p_uid
    AND ac.is_active = true
    AND m.is_active = true
    AND cs.is_paused = false
    AND (cs.effective_from IS NULL OR cs.effective_from <= now())
    AND (cs.effective_to   IS NULL OR cs.effective_to   >  now());
$$;

GRANT EXECUTE ON FUNCTION public._user_assigned_source_enums(uuid) TO authenticated;

COMMENT ON FUNCTION public._user_assigned_source_enums(uuid) IS
  'Returns the lead_source enum values currently assigned to the given user via admission_counselor_sources (active, in-window, not paused). Used by the leads + call_logs service-role API routes to mirror RLS behaviour.';

COMMIT;
