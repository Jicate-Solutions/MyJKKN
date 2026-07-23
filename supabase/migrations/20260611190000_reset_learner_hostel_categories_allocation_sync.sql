-- =============================================================================
-- Learner room/mess categories: allocation-derived only
--
-- learners_profiles.hostel_category_id / mess_category_id were stamped by the
-- admission form (write-whitelisted pickers) long before any room existed —
-- wrong for effectively all 890 value-carrying hostellers (user decision:
-- reset WITHOUT backup, the values are known-bad).
--
-- New model:
--   * Both columns start NULL. They are set when a room allocation becomes
--     ACTIVE: room category = the allocated room's category; mess category =
--     first eligible mess category from the program-eligibility rules
--     (fn_hostel_learner_mess_categories — the same source
--     fn_auto_allocate_classic uses), and only when still NULL.
--   * trg_allocation_sync_learner_categories on hostel_allocations is the
--     single enforcement point — covers warden manual allocation, batch
--     approval (pending_approval -> active), auto-allocate (which also syncs
--     inline at insert; idempotent) and upgrade moves.
--   * Categories are KEPT on vacate (billing history) — next allocation
--     overwrites them.
--   * Admission form writes stop in the same change set
--     (student-form-write-whitelist.ts + the two pickers).
--
-- Hostel bill generation reads these columns, so unallocated hostellers are
-- excluded from billing until they receive a room — intended behavior.
-- =============================================================================

-- 1) Sync trigger ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._on_allocation_sync_learner_categories()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lp uuid; v_mess uuid;
BEGIN
  -- Never block an allocation write over category syncing.
  BEGIN
    SELECT learner_id INTO v_lp FROM profiles WHERE id = NEW.learner_id;
    IF v_lp IS NULL THEN RETURN NEW; END IF;
    SELECT mc.category_id INTO v_mess
    FROM fn_hostel_learner_mess_categories(v_lp) mc
    LIMIT 1;
    UPDATE learners_profiles
       SET hostel_category_id = (SELECT category_id FROM hostel_rooms WHERE id = NEW.room_id),
           mess_category_id   = COALESCE(mess_category_id, v_mess),
           updated_at = now()
     WHERE id = v_lp;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_on_allocation_sync_learner_categories: %', SQLERRM;
  END;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_allocation_sync_learner_categories ON public.hostel_allocations;
CREATE TRIGGER trg_allocation_sync_learner_categories
AFTER INSERT OR UPDATE OF status ON public.hostel_allocations
FOR EACH ROW WHEN (NEW.status = 'active')
EXECUTE FUNCTION public._on_allocation_sync_learner_categories();

-- 2) Reset: clear every admission-stamped value ---------------------------------
-- Hostel-flagged learners (890 with values) plus 3 stray non-hostel learners
-- that carried values; the columns are meaningless without an allocation.
UPDATE learners_profiles
   SET hostel_category_id = NULL, mess_category_id = NULL, updated_at = now()
 WHERE hostel_category_id IS NOT NULL OR mess_category_id IS NOT NULL;

-- 3) Re-derive for learners that ALREADY hold an active allocation ---------------
UPDATE learners_profiles lp
   SET hostel_category_id = r.category_id,
       mess_category_id = COALESCE(
         lp.mess_category_id,
         (SELECT mc.category_id FROM fn_hostel_learner_mess_categories(lp.id) mc LIMIT 1)),
       updated_at = now()
  FROM hostel_allocations a
  JOIN profiles p ON p.id = a.learner_id
  JOIN hostel_rooms r ON r.id = a.room_id
 WHERE a.status = 'active' AND lp.id = p.learner_id;
