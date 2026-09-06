-- ============================================================================
-- mess_categories.menu_tier_key — stable menu-linkage key (auto-follow)
-- ============================================================================
-- Date: 2026-06-12. Director decision (interview Q2): the menu system follows
-- the mess categories page automatically. Menu rows link to a plan via a
-- STABLE slug frozen at category creation — renaming a category's display
-- name never orphans its menus ("key on the row, not the name").
--
-- Reads everywhere use COALESCE(menu_tier_key, lower(name)) so pre-trigger
-- rows and any future null behave identically. Idempotent.
-- ============================================================================

ALTER TABLE public.mess_categories
  ADD COLUMN IF NOT EXISTS menu_tier_key text;

COMMENT ON COLUMN public.mess_categories.menu_tier_key IS
  'Stable slug linking this plan to mess_menus.tier_key. Frozen at creation (trigger); display name renames never break menu linkage.';

-- Backfill existing rows (Classic/Premium × boys/girls → classic/premium).
UPDATE public.mess_categories
SET menu_tier_key = lower(regexp_replace(trim(name), '\s+', '_', 'g'))
WHERE menu_tier_key IS NULL;

-- Freeze the key at creation for future categories.
CREATE OR REPLACE FUNCTION public.fn_mess_categories_freeze_menu_tier_key()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.menu_tier_key IS NULL THEN
    NEW.menu_tier_key := lower(regexp_replace(trim(NEW.name), '\s+', '_', 'g'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mess_categories_menu_tier_key ON public.mess_categories;
CREATE TRIGGER trg_mess_categories_menu_tier_key
  BEFORE INSERT ON public.mess_categories
  FOR EACH ROW EXECUTE FUNCTION public.fn_mess_categories_freeze_menu_tier_key();

NOTIFY pgrst, 'reload schema';
