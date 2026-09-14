-- ============================================================================
-- Campus Living — the allocation audit stops flagging cross-placed residents
-- ============================================================================
-- 2026-11-28 · follows 20261128000000_hostel_category_room_sources.sql
--
-- fn_hostel_allocation_audit decides `in_band` by asking whether the SEATED
-- room's category is one of the room categories the learner's fee band entitles
-- them to (fn_hostel_effective_room_categories). It already grants one escape:
-- a room whose category is the room_source_category_id of an entitled category
-- counts as in-band, which is what keeps "Deluxe Plus" residents (seated in
-- Deluxe rooms) out of the exception list.
--
-- hostel_category_room_sources is the same idea with more than one source, so
-- the escape has to know about it too. Without this, every Premium learner
-- seated in a Deluxe room is reported as an out-of-band allocation — including
-- the four girls in Girls Hostel C who have been placed that way since August.
--
-- WHY A DO BLOCK RATHER THAN A FULL CREATE OR REPLACE
-- ---------------------------------------------------
-- The function body is ~14 KB of CTEs that this change does not touch. Pasting
-- it out and back in to alter four lines invites a transcription error in code
-- nothing here reviews. Instead the block asserts the exact text it expects to
-- find, refuses to run if the body has drifted, and rewrites only that one
-- predicate. The substitution is deterministic and printed below in full.
-- ============================================================================

DO $migration$
DECLARE
  v_oid  oid;
  v_def  text;
  v_old  text := 'AND x.room_source_category_id = e.room_cat_id)) AS in_band,';
  v_new  text := 'AND x.room_source_category_id = e.room_cat_id)
       OR EXISTS (SELECT 1 FROM hostel_category_room_sources s
                  WHERE s.category_id = ANY(COALESCE(e.room_cats, ''{}''::uuid[]))
                    AND s.source_category_id = e.room_cat_id
                    AND s.is_active)) AS in_band,';
BEGIN
  SELECT p.oid INTO v_oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_hostel_allocation_audit';
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'fn_hostel_allocation_audit not found';
  END IF;

  v_def := pg_get_functiondef(v_oid);

  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'fn_hostel_allocation_audit has drifted: expected in_band predicate not found. Re-derive this migration against the live body.';
  END IF;
  IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'fn_hostel_allocation_audit: in_band predicate is not unique; refusing to rewrite.';
  END IF;

  EXECUTE replace(v_def, v_old, v_new);
END
$migration$;
