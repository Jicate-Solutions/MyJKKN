-- =====================================================================
-- Migration: Auto-provision LC tier_1 rep positions for new institutions
-- Date:      2026-04-22
-- Purpose:   When a new row is inserted into public.institutions with
--            entity_type='institution' and is_active=true, automatically
--            create 3 LC representative positions bound to it. Supports
--            JKKN's convention that every college/school gets exactly 3
--            LC reps without the admin having to go to the LC Positions
--            page and create them manually.
--
-- WHY
-- ---
-- Two new JKKN schools (Nattraja Vidhayalya + JKKN Matriculation School)
-- are expected to be added to the institutions table via the
-- /organizations/institutions UI. Today the LC Positions table would
-- still be missing 3 rep slots for each new school — someone has to
-- remember to add them. This trigger removes that manual step.
--
-- WHAT IS SKIPPED
-- ---------------
-- * entity_type='admin_office'  (e.g. JKKN Main Office — administrative
--   entity, not a college/school; we just disabled its LC reps)
-- * entity_type='company'       (e.g. Jicate Solutions — vendor/partner)
-- * is_active=false             (explicitly inactive institutions)
-- * Any institution that already has tier_1 representative positions
--   (idempotent — safe to re-run the migration)
--
-- DELETE / DEACTIVATION
-- ---------------------
-- This trigger fires only on INSERT. It does NOT:
--   * retroactively run for existing institutions (all 11 are already
--     seeded from prior work)
--   * remove positions when an institution is soft-deleted, deleted, or
--     its entity_type changes
--   * create YUVA chapter positions (YUVA is college-specific; schools
--     use Thalir — separate concept, handled later)
--
-- IDEMPOTENCY
-- -----------
-- CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS + CREATE TRIGGER
-- means this migration can be re-applied without error.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.auto_provision_lc_positions_for_institution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_sort_order INTEGER;
BEGIN
  -- Skip non-institution entities (admin_office, company, etc.)
  IF NEW.entity_type IS DISTINCT FROM 'institution' THEN
    RETURN NEW;
  END IF;

  -- Skip explicitly inactive institutions
  IF NEW.is_active IS FALSE THEN
    RETURN NEW;
  END IF;

  -- Idempotency: skip if positions already exist for this institution
  IF EXISTS (
    SELECT 1 FROM public.lc_positions
    WHERE institution_id = NEW.id
      AND tier = 'tier_1'
      AND category = 'representative'
  ) THEN
    RETURN NEW;
  END IF;

  -- Compute a sort_order slot that lands after existing reps so new
  -- institutions' reps appear at the bottom of the Positions list
  SELECT COALESCE(MAX(sort_order), 0) + 100
    INTO v_base_sort_order
  FROM public.lc_positions
  WHERE tier = 'tier_1' AND category = 'representative';

  -- Create 3 LC representative positions bound to the new institution
  INSERT INTO public.lc_positions (
    title, category, tier, institution_id, max_holders, is_active,
    sort_order, description
  )
  VALUES
    (
      'Representative 1 - ' || NEW.name,
      'representative', 'tier_1', NEW.id, 1, true,
      v_base_sort_order + 1,
      'Auto-provisioned by trigger when institution was added on '
        || to_char(NOW(), 'YYYY-MM-DD')
    ),
    (
      'Representative 2 - ' || NEW.name,
      'representative', 'tier_1', NEW.id, 1, true,
      v_base_sort_order + 2,
      'Auto-provisioned by trigger when institution was added on '
        || to_char(NOW(), 'YYYY-MM-DD')
    ),
    (
      'Representative 3 - ' || NEW.name,
      'representative', 'tier_1', NEW.id, 1, true,
      v_base_sort_order + 3,
      'Auto-provisioned by trigger when institution was added on '
        || to_char(NOW(), 'YYYY-MM-DD')
    );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.auto_provision_lc_positions_for_institution() IS
  'Creates 3 LC tier_1 representative positions when a new row is inserted into institutions (entity_type=institution AND is_active=true). Skips admin_office, company, inactive, or already-provisioned rows.';

DROP TRIGGER IF EXISTS auto_provision_lc_positions
  ON public.institutions;

CREATE TRIGGER auto_provision_lc_positions
AFTER INSERT ON public.institutions
FOR EACH ROW
EXECUTE FUNCTION public.auto_provision_lc_positions_for_institution();

-- =====================================================================
-- POST-APPLY VERIFICATION (run after applying)
-- =====================================================================
-- 1. Trigger is registered:
--    SELECT tgname, tgrelid::regclass FROM pg_trigger
--    WHERE tgname = 'auto_provision_lc_positions';
--
-- 2. Function SECURITY DEFINER + search_path:
--    \df+ public.auto_provision_lc_positions_for_institution
--
-- 3. End-to-end: add a test institution via UI, then:
--    SELECT title, tier, category, is_active FROM lc_positions
--    WHERE institution_id = '<new-uuid>';
--    Expected: 3 "Representative N - <name>" rows, tier_1/representative/active.
-- =====================================================================
