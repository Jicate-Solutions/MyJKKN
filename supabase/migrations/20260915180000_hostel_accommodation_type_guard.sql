-- Fix + guard: hostel_allocations vs learners_profiles.accommodation_type_id drift
--
-- Found live: 5 learners (Girls Hostel A) held an ACTIVE bed allocation while
-- flagged accommodation_type_id = 'dayscholar' — e.g. ISAI VANI M
-- (isaivanim26ahs@jkkn.ac.in), whose only allocation was inserted fresh by
-- 20260911210000_gha_classic_room_number_correction.sql straight from a
-- physical-occupancy sheet, without checking accommodation_type_id at all.
-- The other 4 were flipped to 'dayscholar' via the Residents module's
-- "Remove from Hostel" action (LearnerHosteliteService.removeFromHostel),
-- which by design only updates the flag and leaves the caller responsible
-- for vacating the bed separately — nothing enforced that.
--
-- Nothing in the schema linked these two facts: hostel_allocations carries no
-- FK/check against accommodation_type_id, so either path could (and did)
-- leave a learner "allocated" + "Day Scholar" at the same time.
--
-- This migration:
--   1. Reconciles the 5 live mismatches to 'hostel' (they physically hold a
--      bed today — the flag was wrong, not the allocation).
--   2. AFTER INSERT/UPDATE on hostel_allocations: self-heals
--      accommodation_type_id -> 'hostel' whenever a row lands in a live
--      status (active/pending_approval), mirroring the existing
--      trg_allocation_sync_learner_categories pattern. Covers future bulk
--      imports/fix scripts that insert allocations without touching the flag.
--   3. BEFORE UPDATE OF accommodation_type_id on learners_profiles: blocks
--      moving a learner OFF 'hostel' while they still hold a live allocation.
--      Covers "Remove from Hostel" (and any other future caller) at the DB
--      layer instead of trusting the UI's advisory warning text.
--
-- "Live" = ('active','pending_approval') — matches the codebase's existing
-- definition of an occupied bed (see fn_cl_admin_allocatable_rooms's free-bed
-- check and fn_auto_allocate_candidates's already-allocated exclusion).

-- ── 1. Data fix ─────────────────────────────────────────────────────────
UPDATE learners_profiles lp
SET accommodation_type_id = (SELECT id FROM accommodation_types WHERE code = 'hostel'),
    updated_at = now()
WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code <> 'hostel')
  AND EXISTS (
    SELECT 1 FROM hostel_allocations ha
    JOIN profiles p ON p.id = ha.learner_id
    WHERE p.learner_id = lp.id AND ha.status IN ('active', 'pending_approval')
  );

-- ── 2. Self-heal: an allocation landing live always implies 'hostel' ──────
CREATE OR REPLACE FUNCTION public._on_allocation_sync_accommodation_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lp uuid;
  v_hostel_acc_id uuid;
BEGIN
  IF NEW.status NOT IN ('active', 'pending_approval') THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT learner_id INTO v_lp FROM profiles WHERE id = NEW.learner_id;
    IF v_lp IS NULL THEN RETURN NEW; END IF;

    SELECT id INTO v_hostel_acc_id FROM accommodation_types WHERE code = 'hostel';
    IF v_hostel_acc_id IS NULL THEN RETURN NEW; END IF;

    UPDATE learners_profiles
       SET accommodation_type_id = v_hostel_acc_id,
           updated_at = now()
     WHERE id = v_lp
       AND accommodation_type_id IS DISTINCT FROM v_hostel_acc_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_on_allocation_sync_accommodation_type: %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_allocation_sync_accommodation_type ON hostel_allocations;
CREATE TRIGGER trg_allocation_sync_accommodation_type
  AFTER INSERT OR UPDATE ON hostel_allocations
  FOR EACH ROW
  EXECUTE FUNCTION public._on_allocation_sync_accommodation_type();

-- ── 3. Guard: can't flip off 'hostel' while a bed is still live ───────────
CREATE OR REPLACE FUNCTION public._guard_accommodation_type_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hostel_acc_id uuid;
  v_has_live_bed boolean;
BEGIN
  IF NEW.accommodation_type_id IS NOT DISTINCT FROM OLD.accommodation_type_id THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_hostel_acc_id FROM accommodation_types WHERE code = 'hostel';
  -- Moving INTO hostel, or no hostel type configured: nothing to guard.
  IF v_hostel_acc_id IS NULL OR NEW.accommodation_type_id = v_hostel_acc_id THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM hostel_allocations ha
    JOIN profiles p ON p.id = ha.learner_id
    WHERE p.learner_id = NEW.id AND ha.status IN ('active', 'pending_approval')
  ) INTO v_has_live_bed;

  IF v_has_live_bed THEN
    RAISE EXCEPTION 'Cannot change accommodation type off Hostel: learner still holds an active bed allocation. Vacate the allocation first.'
      USING ERRCODE = '23514',
            HINT = 'Vacate (or transfer out) the active hostel_allocations row before removing hostel status.';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_accommodation_type_change ON learners_profiles;
CREATE TRIGGER trg_guard_accommodation_type_change
  BEFORE UPDATE OF accommodation_type_id ON learners_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public._guard_accommodation_type_change();
