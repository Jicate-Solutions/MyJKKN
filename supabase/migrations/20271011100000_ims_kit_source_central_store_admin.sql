-- ============================================================================
-- Only store admins mark a kit item Central, or reset its source (Q-1010-395)
-- ============================================================================
-- WHY: Director ruling 11 Oct 2026 08:53 — "Only store admins" may mark an
-- item Central store; college staff mark only College store. #4336 made the
-- kits screen College-only in the app, but the ims_items UPDATE policy lets any
-- user with ims inventory edit rights write kit_source directly (PostgREST).
-- This trigger enforces the ruling in the database:
--   · anyone RLS already lets write the row may:
--       - INSERT an item with kit_source NULL or 'college'
--       - UPDATE kit_source NULL -> 'college'
--       - write kit_source unchanged (an edit form re-sending the same value)
--   · every other kit_source change needs profiles.role IN
--     ('store_admin','super_admin') (get_current_user_role()): any write of
--     'central', central -> college, college/central -> NULL (reset),
--     college -> central.
--   · writes with no JWT user (auth.uid() IS NULL — migrations, the service
--     role, cron) are allowed. A SECURITY DEFINER function called by a signed-
--     in college user still has auth.uid() set, so it is NOT exempt.
-- Refusal: ERRCODE 42501, "Only a store admin can mark an item Central or
-- reset its source."
--
-- The trigger function is SECURITY INVOKER (no elevated rights; it only reads
-- auth.uid() and get_current_user_role(), which RLS already calls).
--
-- DEPLOY ORDER: apply this migration, then deploy the app (the store-admin
-- Central option and the Reset source action rely on it; the app without the
-- migration still works, the database just does not enforce the rule yet).
-- Live state 11 Oct: all 1006 ims_items rows have kit_source NULL, so no
-- existing row is affected.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_ims_items_kit_source_guard ON public.ims_items;
--   DROP FUNCTION IF EXISTS public.fn_ims_items_kit_source_guard();
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_ims_items_kit_source_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Unchanged value: nothing to guard (UPDATE OF fires even when the value
  -- written equals the old one).
  IF TG_OP = 'UPDATE' AND NEW.kit_source IS NOT DISTINCT FROM OLD.kit_source THEN
    RETURN NEW;
  END IF;

  -- Allowed for every caller RLS lets write the row.
  IF TG_OP = 'INSERT' AND (NEW.kit_source IS NULL OR NEW.kit_source = 'college') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.kit_source IS NULL AND NEW.kit_source = 'college' THEN
    RETURN NEW;
  END IF;

  -- No signed-in user: migrations, service role, cron.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(public.get_current_user_role() IN ('store_admin', 'super_admin'), false) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only a store admin can mark an item Central or reset its source.'
    USING ERRCODE = '42501';
END;
$$;

COMMENT ON FUNCTION public.fn_ims_items_kit_source_guard() IS
  'Q-1010-395 (Director 11 Oct 2026): college staff may only set kit_source NULL -> college; Central, changes and resets need profiles.role store_admin/super_admin. No-JWT writes exempt.';

-- Trigger functions are never called directly; keep them off the API surface.
REVOKE EXECUTE ON FUNCTION public.fn_ims_items_kit_source_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_ims_items_kit_source_guard ON public.ims_items;
CREATE TRIGGER trg_ims_items_kit_source_guard
  BEFORE INSERT OR UPDATE OF kit_source ON public.ims_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_ims_items_kit_source_guard();
