-- ============================================================================
-- Mess Menu Item Library — ~300-item reference catalogue
-- ============================================================================
-- Created: 2026-05-26
-- Spec: Director interview locked 2026-05-26 (parallel to Mess Menu PR1 #1087).
--
-- WHY:
--   The 56-cell weekly seed (Mess Menu PR2) is photo-sourced — evidence-grade
--   defaults for one institution's typical week. The library is a SEPARATE
--   catalogue admins use as an autocomplete/picker source when editing weekly
--   menus. ~300 common South Indian hostel mess items across 8 categories.
--
-- CONTENT POLICY (per CLAUDE.md rule 24 — non-Latin character corruption):
--   - name_english is REQUIRED; transliteration is acceptable.
--   - name_tamil is OPTIONAL. Provided only where confidence is high
--     (canonical, frequently-photographed items). Left NULL where AI-
--     generated Tamil rendering carries token-corruption risk.
--   - All rows ship with needs_native_review=true. Director (or any native
--     Tamil reader) flips to false via the /admin/mess/library admin UI
--     after eyeball audit.
--
-- COMPANION:
--   - 1 platform_policies row: mess.menu.library_auto_promote_enabled
--     (Director enables later to allow new items added during menu editing
--      to auto-promote into this library).
--
-- Idempotent. Safe to re-apply. INSERTs use ON CONFLICT DO NOTHING via the
-- UNIQUE(name_english, category) constraint.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mess_menu_item_library (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_tamil     text NULL,
  name_english   text NOT NULL,
  category       text NOT NULL,
  dietary_tags   text[] NOT NULL DEFAULT '{}',
  region_typical text NULL,
  usage_count    integer NOT NULL DEFAULT 0,
  is_active      boolean NOT NULL DEFAULT true,
  needs_native_review boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid NULL,
  CONSTRAINT mess_menu_item_library_category_check
    CHECK (category IN ('breakfast','lunch','tea','dinner','sweet','condiment','beverage','side')),
  CONSTRAINT mess_menu_item_library_name_english_category_uniq
    UNIQUE (name_english, category)
);

COMMENT ON TABLE public.mess_menu_item_library IS
  'Reference catalogue of common South Indian mess items. Used as autocomplete/picker source when editing weekly menus (mess_menus). Independent of the photo-sourced weekly seed.';
COMMENT ON COLUMN public.mess_menu_item_library.name_tamil IS
  'Tamil name. NULL when AI confidence low or rendering token-corruption risk. Director audits via admin UI.';
COMMENT ON COLUMN public.mess_menu_item_library.dietary_tags IS
  'Free-form tags: veg, egg, non_veg, jain, gluten_free, dairy_free, etc.';
COMMENT ON COLUMN public.mess_menu_item_library.usage_count IS
  'Incremented when an admin picks this item from the library while editing a weekly menu. Used to sort the picker by popularity.';
COMMENT ON COLUMN public.mess_menu_item_library.needs_native_review IS
  'true until a native Tamil reader confirms the Tamil rendering (or absence of it) is correct. Director clears via admin UI.';

-- ---------------------------------------------------------------------------
-- 2) Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_mess_menu_item_library_category
  ON public.mess_menu_item_library (category)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_mess_menu_item_library_search
  ON public.mess_menu_item_library
  USING gin (to_tsvector('simple', coalesce(name_english, '') || ' ' || coalesce(name_tamil, '')));

-- ---------------------------------------------------------------------------
-- 3) RLS — super_admin + admin write; authenticated read
-- ---------------------------------------------------------------------------
ALTER TABLE public.mess_menu_item_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mess_menu_item_library_read ON public.mess_menu_item_library;
CREATE POLICY mess_menu_item_library_read
  ON public.mess_menu_item_library
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS mess_menu_item_library_write ON public.mess_menu_item_library;
CREATE POLICY mess_menu_item_library_write
  ON public.mess_menu_item_library
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'administrator')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'administrator')
    )
  );

-- ---------------------------------------------------------------------------
-- 4) updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mess_menu_item_library_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mess_menu_item_library_updated_at ON public.mess_menu_item_library;
CREATE TRIGGER trg_mess_menu_item_library_updated_at
  BEFORE UPDATE ON public.mess_menu_item_library
  FOR EACH ROW
  EXECUTE FUNCTION public.mess_menu_item_library_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 5) Seed — ~300 common South Indian hostel mess items
-- ---------------------------------------------------------------------------
-- Region default: 'tamil_nadu' for items strongly TN-tied;
-- 'south_indian' for pan-South-Indian; 'pan_indian' for nationwide items.
-- Dietary defaults: '{veg}' unless otherwise noted (egg / non_veg).

-- Chunk A — BREAKFAST (50 items)
INSERT INTO public.mess_menu_item_library (name_english, name_tamil, category, dietary_tags, region_typical) VALUES
  ('Idli', E'இட்லி', 'breakfast', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Mini Idli', NULL, 'breakfast', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Rava Idli', NULL, 'breakfast', ARRAY['veg']::text[], 'south_indian'),
  ('Kanchipuram Idli', NULL, 'breakfast', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Podi Idli', NULL, 'breakfast', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Idli Upma', NULL, 'breakfast', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Plain Dosa', E'தோசை', 'breakfast', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Masala Dosa', NULL, 'breakfast', ARRAY['veg']::text[], 'south_indian'),
  ('Ghee Roast Dosa', NULL, 'breakfast', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Set Dosa', NULL, 'breakfast', ARRAY['veg']::text[], 'south_indian'),
  ('Rava Dosa', NULL, 'breakfast', ARRAY['veg']::text[], 'south_indian'),
  ('Onion Rava Dosa', NULL, 'breakfast', ARRAY['veg']::text[], 'south_indian'),
  ('Onion Dosa', NULL, 'breakfast', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Paper Dosa', NULL, 'breakfast', ARRAY['veg']::text[], 'south_indian'),
  ('Podi Dosa', NULL, 'breakfast', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Mysore Masala Dosa', NULL, 'breakfast', ARRAY['veg']::text[], 'south_indian'),
  ('Kal Dosa', NULL, 'breakfast', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Wheat Dosa', NULL, 'breakfast', ARRAY['veg']::text[], 'south_indian'),
  ('Pongal', E'பொங்கல்', 'breakfast', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Ven Pongal', NULL, 'breakfast', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Sakkarai Pongal', NULL, 'breakfast', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Khara Pongal', NULL, 'breakfast', ARRAY['veg']::text[], 'south_indian'),
  ('Upma', E'உப்புமா', 'breakfast', ARRAY['veg']::text[], 'south_indian'),
  ('Rava Upma', NULL, 'breakfast', ARRAY['veg']::text[], 'south_indian'),
  ('Semiya Upma', NULL, 'breakfast', ARRAY['veg']::text[], 'south_indian'),
  ('Arisi Upma', NULL, 'breakfast', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Kichdi', NULL, 'breakfast', ARRAY['veg']::text[], 'pan_indian'),
  ('Pesarattu', NULL, 'breakfast', ARRAY['veg']::text[], 'south_indian'),
  ('Puttu', NULL, 'breakfast', ARRAY['veg']::text[], 'south_indian'),
  ('Idiyappam', NULL, 'breakfast', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Appam', NULL, 'breakfast', ARRAY['veg']::text[], 'south_indian'),
  ('Egg Appam', NULL, 'breakfast', ARRAY['egg']::text[], 'south_indian'),
  ('Paniyaram', NULL, 'breakfast', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Kuzhi Paniyaram', NULL, 'breakfast', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Sweet Paniyaram', NULL, 'breakfast', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Vada', E'வடை', 'breakfast', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Medu Vada', NULL, 'breakfast', ARRAY['veg']::text[], 'south_indian'),
  ('Sambar Vada', NULL, 'breakfast', ARRAY['veg']::text[], 'south_indian'),
  ('Masala Vada', NULL, 'breakfast', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Ulundhu Vada', NULL, 'breakfast', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Thayir Vada', NULL, 'breakfast', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Parotta with Curry', NULL, 'breakfast', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Ceylon Parotta', NULL, 'breakfast', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Egg Parotta', NULL, 'breakfast', ARRAY['egg']::text[], 'tamil_nadu'),
  ('Chapati with Kurma', NULL, 'breakfast', ARRAY['veg']::text[], 'pan_indian'),
  ('Poori with Potato Masala', NULL, 'breakfast', ARRAY['veg']::text[], 'south_indian'),
  ('Bread Omelette', NULL, 'breakfast', ARRAY['egg']::text[], 'pan_indian'),
  ('Bread Toast', NULL, 'breakfast', ARRAY['veg']::text[], 'pan_indian'),
  ('Bread Butter Jam', NULL, 'breakfast', ARRAY['veg']::text[], 'pan_indian'),
  ('Bread Upma', NULL, 'breakfast', ARRAY['veg']::text[], 'south_indian')
ON CONFLICT (name_english, category) DO NOTHING;

-- Chunk B — LUNCH (80 items)
INSERT INTO public.mess_menu_item_library (name_english, name_tamil, category, dietary_tags, region_typical) VALUES
  ('Plain Rice', E'சாதம்', 'lunch', ARRAY['veg']::text[], 'south_indian'),
  ('White Rice', NULL, 'lunch', ARRAY['veg']::text[], 'south_indian'),
  ('Brown Rice', NULL, 'lunch', ARRAY['veg']::text[], 'south_indian'),
  ('Boiled Rice', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Jeera Rice', NULL, 'lunch', ARRAY['veg']::text[], 'pan_indian'),
  ('Ghee Rice', NULL, 'lunch', ARRAY['veg']::text[], 'south_indian'),
  ('Curry Leaves Rice', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Lemon Rice', NULL, 'lunch', ARRAY['veg']::text[], 'south_indian'),
  ('Tamarind Rice', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Puliyodharai', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Coconut Rice', NULL, 'lunch', ARRAY['veg']::text[], 'south_indian'),
  ('Curd Rice', E'தயிர் சாதம்', 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Sambar Rice', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Rasam Rice', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Bisi Bele Bath', NULL, 'lunch', ARRAY['veg']::text[], 'south_indian'),
  ('Vegetable Biriyani', NULL, 'lunch', ARRAY['veg']::text[], 'pan_indian'),
  ('Vegetable Pulao', NULL, 'lunch', ARRAY['veg']::text[], 'pan_indian'),
  ('Tomato Rice', NULL, 'lunch', ARRAY['veg']::text[], 'south_indian'),
  ('Mint Rice', NULL, 'lunch', ARRAY['veg']::text[], 'south_indian'),
  ('Variety Rice', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Egg Biriyani', NULL, 'lunch', ARRAY['egg']::text[], 'pan_indian'),
  ('Chicken Biriyani', NULL, 'lunch', ARRAY['non_veg']::text[], 'pan_indian'),
  ('Mutton Biriyani', NULL, 'lunch', ARRAY['non_veg']::text[], 'pan_indian'),
  ('Sambar', E'சாம்பார்', 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Arachuvitta Sambar', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Vendhaya Sambar', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Paruppu Sambar', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Drumstick Sambar', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Kathirikai Sambar', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Vazhakkai Sambar', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Mixed Vegetable Sambar', NULL, 'lunch', ARRAY['veg']::text[], 'south_indian'),
  ('Rasam', E'ரசம்', 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Pepper Rasam', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Lemon Rasam', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Tomato Rasam', NULL, 'lunch', ARRAY['veg']::text[], 'south_indian'),
  ('Garlic Rasam', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Jeera Rasam', NULL, 'lunch', ARRAY['veg']::text[], 'south_indian'),
  ('Pineapple Rasam', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Paruppu Rasam', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Carrot Poriyal', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Beans Poriyal', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Cabbage Poriyal', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Beetroot Poriyal', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Drumstick Poriyal', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Cluster Beans Poriyal', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Snake Gourd Poriyal', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Ridge Gourd Poriyal', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Plantain Poriyal', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Potato Poriyal', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Chow Chow Kootu', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Kathirikai Kootu', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Peerkangai Kootu', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Cabbage Kootu', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Pumpkin Kootu', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Vatha Kuzhambu', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Ennai Kathirikai Kuzhambu', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Mor Kuzhambu', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Milagu Kuzhambu', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Kara Kuzhambu', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Puli Kuzhambu', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Poondu Kuzhambu', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Mor (Buttermilk)', NULL, 'lunch', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Vegetable Kurma', NULL, 'lunch', ARRAY['veg']::text[], 'south_indian'),
  ('Paneer Butter Masala', NULL, 'lunch', ARRAY['veg']::text[], 'pan_indian'),
  ('Mushroom Kurma', NULL, 'lunch', ARRAY['veg']::text[], 'south_indian'),
  ('Channa Masala', NULL, 'lunch', ARRAY['veg']::text[], 'pan_indian'),
  ('Rajma', NULL, 'lunch', ARRAY['veg']::text[], 'pan_indian'),
  ('Dal Tadka', NULL, 'lunch', ARRAY['veg']::text[], 'pan_indian'),
  ('Dal Fry', NULL, 'lunch', ARRAY['veg']::text[], 'pan_indian'),
  ('Dal Makhani', NULL, 'lunch', ARRAY['veg']::text[], 'pan_indian'),
  ('Aloo Gobi', NULL, 'lunch', ARRAY['veg']::text[], 'pan_indian'),
  ('Bhindi Masala', NULL, 'lunch', ARRAY['veg']::text[], 'pan_indian'),
  ('Mixed Vegetable Curry', NULL, 'lunch', ARRAY['veg']::text[], 'pan_indian'),
  ('Avial', NULL, 'lunch', ARRAY['veg']::text[], 'south_indian'),
  ('Egg Curry', NULL, 'lunch', ARRAY['egg']::text[], 'pan_indian'),
  ('Egg Masala', NULL, 'lunch', ARRAY['egg']::text[], 'pan_indian'),
  ('Boiled Egg', NULL, 'lunch', ARRAY['egg']::text[], 'pan_indian'),
  ('Chicken Curry', NULL, 'lunch', ARRAY['non_veg']::text[], 'tamil_nadu'),
  ('Chicken Chettinad', NULL, 'lunch', ARRAY['non_veg']::text[], 'tamil_nadu'),
  ('Chicken Gravy', NULL, 'lunch', ARRAY['non_veg']::text[], 'tamil_nadu'),
  ('Fish Curry', NULL, 'lunch', ARRAY['non_veg']::text[], 'tamil_nadu'),
  ('Mutton Curry', NULL, 'lunch', ARRAY['non_veg']::text[], 'tamil_nadu')
ON CONFLICT (name_english, category) DO NOTHING;

-- Chunk C — TEA (40 items, snacks-with-tea slot)
INSERT INTO public.mess_menu_item_library (name_english, name_tamil, category, dietary_tags, region_typical) VALUES
  ('Tea', E'தேனீர்', 'tea', ARRAY['veg']::text[], 'pan_indian'),
  ('Milk Tea', NULL, 'tea', ARRAY['veg']::text[], 'pan_indian'),
  ('Masala Tea', NULL, 'tea', ARRAY['veg']::text[], 'pan_indian'),
  ('Ginger Tea', NULL, 'tea', ARRAY['veg']::text[], 'pan_indian'),
  ('Lemon Tea', NULL, 'tea', ARRAY['veg']::text[], 'pan_indian'),
  ('Filter Coffee', NULL, 'tea', ARRAY['veg']::text[], 'south_indian'),
  ('Coffee', E'காபி', 'tea', ARRAY['veg']::text[], 'pan_indian'),
  ('Milk', E'பால்', 'tea', ARRAY['veg']::text[], 'pan_indian'),
  ('Badam Milk', NULL, 'tea', ARRAY['veg']::text[], 'pan_indian'),
  ('Horlicks', NULL, 'tea', ARRAY['veg']::text[], 'pan_indian'),
  ('Bournvita', NULL, 'tea', ARRAY['veg']::text[], 'pan_indian'),
  ('Marie Biscuit', NULL, 'tea', ARRAY['veg']::text[], 'pan_indian'),
  ('Glucose Biscuit', NULL, 'tea', ARRAY['veg']::text[], 'pan_indian'),
  ('Cream Biscuit', NULL, 'tea', ARRAY['veg']::text[], 'pan_indian'),
  ('Rusk', NULL, 'tea', ARRAY['veg']::text[], 'pan_indian'),
  ('Mixture', NULL, 'tea', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Murukku', NULL, 'tea', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Thattai', NULL, 'tea', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Kara Sev', NULL, 'tea', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Ribbon Pakoda', NULL, 'tea', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Omapodi', NULL, 'tea', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Banana Chips', NULL, 'tea', ARRAY['veg']::text[], 'south_indian'),
  ('Tapioca Chips', NULL, 'tea', ARRAY['veg']::text[], 'south_indian'),
  ('Pakoda', NULL, 'tea', ARRAY['veg']::text[], 'pan_indian'),
  ('Onion Pakoda', NULL, 'tea', ARRAY['veg']::text[], 'south_indian'),
  ('Bonda', NULL, 'tea', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Potato Bonda', NULL, 'tea', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Bajji', NULL, 'tea', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Onion Bajji', NULL, 'tea', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Plantain Bajji', NULL, 'tea', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Mysore Pak', NULL, 'tea', ARRAY['veg']::text[], 'south_indian'),
  ('Carrot Halwa', NULL, 'tea', ARRAY['veg']::text[], 'pan_indian'),
  ('Wheat Halwa', NULL, 'tea', ARRAY['veg']::text[], 'pan_indian'),
  ('Cake', NULL, 'tea', ARRAY['veg']::text[], 'pan_indian'),
  ('Samosa', NULL, 'tea', ARRAY['veg']::text[], 'pan_indian'),
  ('Sandwich', NULL, 'tea', ARRAY['veg']::text[], 'pan_indian'),
  ('Vegetable Puff', NULL, 'tea', ARRAY['veg']::text[], 'pan_indian'),
  ('Egg Puff', NULL, 'tea', ARRAY['egg']::text[], 'pan_indian'),
  ('Cutlet', NULL, 'tea', ARRAY['veg']::text[], 'pan_indian'),
  ('Sundal', NULL, 'tea', ARRAY['veg']::text[], 'tamil_nadu')
ON CONFLICT (name_english, category) DO NOTHING;

-- Chunk D — DINNER (60 items)
INSERT INTO public.mess_menu_item_library (name_english, name_tamil, category, dietary_tags, region_typical) VALUES
  ('Chapati', E'சபாத்தி', 'dinner', ARRAY['veg']::text[], 'pan_indian'),
  ('Phulka', NULL, 'dinner', ARRAY['veg']::text[], 'pan_indian'),
  ('Roti', NULL, 'dinner', ARRAY['veg']::text[], 'pan_indian'),
  ('Plain Parotta', NULL, 'dinner', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Ceylon Parotta Dinner', NULL, 'dinner', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Kothu Parotta', NULL, 'dinner', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Egg Kothu Parotta', NULL, 'dinner', ARRAY['egg']::text[], 'tamil_nadu'),
  ('Chicken Kothu Parotta', NULL, 'dinner', ARRAY['non_veg']::text[], 'tamil_nadu'),
  ('Kal Dosa Dinner', NULL, 'dinner', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Idiyappam Dinner', NULL, 'dinner', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Appam Dinner', NULL, 'dinner', ARRAY['veg']::text[], 'south_indian'),
  ('Sambar Idli', NULL, 'dinner', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Set Dosa Dinner', NULL, 'dinner', ARRAY['veg']::text[], 'south_indian'),
  ('Dinner Rice', NULL, 'dinner', ARRAY['veg']::text[], 'south_indian'),
  ('Tomato Rice Dinner', NULL, 'dinner', ARRAY['veg']::text[], 'south_indian'),
  ('Pulao Dinner', NULL, 'dinner', ARRAY['veg']::text[], 'pan_indian'),
  ('Vegetable Kurma Dinner', NULL, 'dinner', ARRAY['veg']::text[], 'south_indian'),
  ('Channa Kurma', NULL, 'dinner', ARRAY['veg']::text[], 'south_indian'),
  ('Paneer Tikka Masala', NULL, 'dinner', ARRAY['veg']::text[], 'pan_indian'),
  ('Paneer Butter Masala Dinner', NULL, 'dinner', ARRAY['veg']::text[], 'pan_indian'),
  ('Mushroom Masala', NULL, 'dinner', ARRAY['veg']::text[], 'pan_indian'),
  ('Gobi Manchurian', NULL, 'dinner', ARRAY['veg']::text[], 'pan_indian'),
  ('Gobi 65', NULL, 'dinner', ARRAY['veg']::text[], 'south_indian'),
  ('Paneer 65', NULL, 'dinner', ARRAY['veg']::text[], 'south_indian'),
  ('Chilli Paneer', NULL, 'dinner', ARRAY['veg']::text[], 'pan_indian'),
  ('Veg Manchurian', NULL, 'dinner', ARRAY['veg']::text[], 'pan_indian'),
  ('Aloo Mutter', NULL, 'dinner', ARRAY['veg']::text[], 'pan_indian'),
  ('Aloo Methi', NULL, 'dinner', ARRAY['veg']::text[], 'pan_indian'),
  ('Palak Paneer', NULL, 'dinner', ARRAY['veg']::text[], 'pan_indian'),
  ('Methi Paneer', NULL, 'dinner', ARRAY['veg']::text[], 'pan_indian'),
  ('Kadai Vegetable', NULL, 'dinner', ARRAY['veg']::text[], 'pan_indian'),
  ('Veg Jalfrezi', NULL, 'dinner', ARRAY['veg']::text[], 'pan_indian'),
  ('Channa Masala Dinner', NULL, 'dinner', ARRAY['veg']::text[], 'pan_indian'),
  ('Rajma Masala', NULL, 'dinner', ARRAY['veg']::text[], 'pan_indian'),
  ('Dal Tadka Dinner', NULL, 'dinner', ARRAY['veg']::text[], 'pan_indian'),
  ('Dal Fry Dinner', NULL, 'dinner', ARRAY['veg']::text[], 'pan_indian'),
  ('Sambar Dinner', NULL, 'dinner', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Rasam Dinner', NULL, 'dinner', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Mor Dinner', NULL, 'dinner', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Plain Curd Dinner', NULL, 'dinner', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Egg Curry Dinner', NULL, 'dinner', ARRAY['egg']::text[], 'pan_indian'),
  ('Egg Masala Dinner', NULL, 'dinner', ARRAY['egg']::text[], 'pan_indian'),
  ('Scrambled Egg', NULL, 'dinner', ARRAY['egg']::text[], 'pan_indian'),
  ('Omelette', NULL, 'dinner', ARRAY['egg']::text[], 'pan_indian'),
  ('Masala Omelette', NULL, 'dinner', ARRAY['egg']::text[], 'pan_indian'),
  ('Boiled Egg Dinner', NULL, 'dinner', ARRAY['egg']::text[], 'pan_indian'),
  ('Egg Bhurji', NULL, 'dinner', ARRAY['egg']::text[], 'pan_indian'),
  ('Chicken Curry Dinner', NULL, 'dinner', ARRAY['non_veg']::text[], 'tamil_nadu'),
  ('Chicken 65', NULL, 'dinner', ARRAY['non_veg']::text[], 'tamil_nadu'),
  ('Chicken Fry', NULL, 'dinner', ARRAY['non_veg']::text[], 'tamil_nadu'),
  ('Chicken Gravy Dinner', NULL, 'dinner', ARRAY['non_veg']::text[], 'tamil_nadu'),
  ('Pepper Chicken', NULL, 'dinner', ARRAY['non_veg']::text[], 'tamil_nadu'),
  ('Chicken Chettinad Dinner', NULL, 'dinner', ARRAY['non_veg']::text[], 'tamil_nadu'),
  ('Mutton Curry Dinner', NULL, 'dinner', ARRAY['non_veg']::text[], 'tamil_nadu'),
  ('Fish Curry Dinner', NULL, 'dinner', ARRAY['non_veg']::text[], 'tamil_nadu'),
  ('Fish Fry', NULL, 'dinner', ARRAY['non_veg']::text[], 'tamil_nadu'),
  ('Prawn Fry', NULL, 'dinner', ARRAY['non_veg']::text[], 'tamil_nadu'),
  ('Prawn Curry', NULL, 'dinner', ARRAY['non_veg']::text[], 'tamil_nadu'),
  ('Curd Rice Dinner', NULL, 'dinner', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Plain Rice Dinner', NULL, 'dinner', ARRAY['veg']::text[], 'south_indian')
ON CONFLICT (name_english, category) DO NOTHING;

-- Chunk E — CONDIMENT (30 items)
INSERT INTO public.mess_menu_item_library (name_english, name_tamil, category, dietary_tags, region_typical) VALUES
  ('Coconut Chutney', E'தென்னை சட்னி', 'condiment', ARRAY['veg']::text[], 'south_indian'),
  ('Mint Chutney', NULL, 'condiment', ARRAY['veg']::text[], 'pan_indian'),
  ('Tomato Chutney', NULL, 'condiment', ARRAY['veg']::text[], 'south_indian'),
  ('Onion Chutney', NULL, 'condiment', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Onion Tomato Chutney', NULL, 'condiment', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Garlic Chutney', NULL, 'condiment', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Peanut Chutney', NULL, 'condiment', ARRAY['veg']::text[], 'south_indian'),
  ('Coriander Chutney', NULL, 'condiment', ARRAY['veg']::text[], 'pan_indian'),
  ('Curry Leaves Chutney', NULL, 'condiment', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Coconut Mint Chutney', NULL, 'condiment', ARRAY['veg']::text[], 'south_indian'),
  ('Idli Podi', NULL, 'condiment', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Milagai Podi', NULL, 'condiment', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Curry Leaves Podi', NULL, 'condiment', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Paruppu Podi', NULL, 'condiment', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Ghee', E'நெய்', 'condiment', ARRAY['veg']::text[], 'pan_indian'),
  ('Butter', NULL, 'condiment', ARRAY['veg']::text[], 'pan_indian'),
  ('Jam', NULL, 'condiment', ARRAY['veg']::text[], 'pan_indian'),
  ('Honey', NULL, 'condiment', ARRAY['veg']::text[], 'pan_indian'),
  ('Lemon Pickle', NULL, 'condiment', ARRAY['veg']::text[], 'pan_indian'),
  ('Mango Pickle', NULL, 'condiment', ARRAY['veg']::text[], 'pan_indian'),
  ('Mixed Pickle', NULL, 'condiment', ARRAY['veg']::text[], 'pan_indian'),
  ('Chilli Pickle', NULL, 'condiment', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Garlic Pickle', NULL, 'condiment', ARRAY['veg']::text[], 'pan_indian'),
  ('Curd', E'தயிர்', 'condiment', ARRAY['veg']::text[], 'pan_indian'),
  ('Plain Yogurt', NULL, 'condiment', ARRAY['veg']::text[], 'pan_indian'),
  ('Cucumber Raita', NULL, 'condiment', ARRAY['veg']::text[], 'pan_indian'),
  ('Onion Raita', NULL, 'condiment', ARRAY['veg']::text[], 'pan_indian'),
  ('Boondi Raita', NULL, 'condiment', ARRAY['veg']::text[], 'pan_indian'),
  ('Sambar Powder', NULL, 'condiment', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Rasam Powder', NULL, 'condiment', ARRAY['veg']::text[], 'tamil_nadu')
ON CONFLICT (name_english, category) DO NOTHING;

-- Chunk F — SWEET (40 items)
INSERT INTO public.mess_menu_item_library (name_english, name_tamil, category, dietary_tags, region_typical) VALUES
  ('Mysore Pak Sweet', NULL, 'sweet', ARRAY['veg']::text[], 'south_indian'),
  ('Jangiri', NULL, 'sweet', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Jilebi', NULL, 'sweet', ARRAY['veg']::text[], 'pan_indian'),
  ('Badusha', NULL, 'sweet', ARRAY['veg']::text[], 'south_indian'),
  ('Kesari', NULL, 'sweet', ARRAY['veg']::text[], 'south_indian'),
  ('Rava Kesari', NULL, 'sweet', ARRAY['veg']::text[], 'south_indian'),
  ('Pineapple Kesari', NULL, 'sweet', ARRAY['veg']::text[], 'south_indian'),
  ('Semiya Payasam', NULL, 'sweet', ARRAY['veg']::text[], 'south_indian'),
  ('Paruppu Payasam', NULL, 'sweet', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Javvarisi Payasam', NULL, 'sweet', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Aval Payasam', NULL, 'sweet', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Pal Payasam', NULL, 'sweet', ARRAY['veg']::text[], 'south_indian'),
  ('Gulab Jamun', NULL, 'sweet', ARRAY['veg']::text[], 'pan_indian'),
  ('Rasagulla', NULL, 'sweet', ARRAY['veg']::text[], 'pan_indian'),
  ('Rasmalai', NULL, 'sweet', ARRAY['veg']::text[], 'pan_indian'),
  ('Kalakand', NULL, 'sweet', ARRAY['veg']::text[], 'pan_indian'),
  ('Palkova', NULL, 'sweet', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Therattipal', NULL, 'sweet', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Besan Ladoo', NULL, 'sweet', ARRAY['veg']::text[], 'pan_indian'),
  ('Atta Ladoo', NULL, 'sweet', ARRAY['veg']::text[], 'pan_indian'),
  ('Motichoor Ladoo', NULL, 'sweet', ARRAY['veg']::text[], 'pan_indian'),
  ('Rava Ladoo', NULL, 'sweet', ARRAY['veg']::text[], 'south_indian'),
  ('Coconut Ladoo', NULL, 'sweet', ARRAY['veg']::text[], 'pan_indian'),
  ('Boondi Ladoo', NULL, 'sweet', ARRAY['veg']::text[], 'pan_indian'),
  ('Carrot Halwa Sweet', NULL, 'sweet', ARRAY['veg']::text[], 'pan_indian'),
  ('Beetroot Halwa', NULL, 'sweet', ARRAY['veg']::text[], 'pan_indian'),
  ('Wheat Halwa Sweet', NULL, 'sweet', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Badam Halwa', NULL, 'sweet', ARRAY['veg']::text[], 'pan_indian'),
  ('Tirunelveli Halwa', NULL, 'sweet', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Bombay Halwa', NULL, 'sweet', ARRAY['veg']::text[], 'pan_indian'),
  ('Kheer', NULL, 'sweet', ARRAY['veg']::text[], 'pan_indian'),
  ('Basundi', NULL, 'sweet', ARRAY['veg']::text[], 'pan_indian'),
  ('Rabdi', NULL, 'sweet', ARRAY['veg']::text[], 'pan_indian'),
  ('Kaju Katli', NULL, 'sweet', ARRAY['veg']::text[], 'pan_indian'),
  ('Soan Papdi', NULL, 'sweet', ARRAY['veg']::text[], 'pan_indian'),
  ('Sweet Bonda', NULL, 'sweet', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Suzhiyam', NULL, 'sweet', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Adhirasam', NULL, 'sweet', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Manoharam', NULL, 'sweet', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Coconut Burfi', NULL, 'sweet', ARRAY['veg']::text[], 'south_indian')
ON CONFLICT (name_english, category) DO NOTHING;

-- Chunk G — BEVERAGE (12 items)
INSERT INTO public.mess_menu_item_library (name_english, name_tamil, category, dietary_tags, region_typical) VALUES
  ('Buttermilk', E'மோர்', 'beverage', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Lemon Juice', NULL, 'beverage', ARRAY['veg']::text[], 'pan_indian'),
  ('Lemon Soda', NULL, 'beverage', ARRAY['veg']::text[], 'pan_indian'),
  ('Orange Juice', NULL, 'beverage', ARRAY['veg']::text[], 'pan_indian'),
  ('Watermelon Juice', NULL, 'beverage', ARRAY['veg']::text[], 'pan_indian'),
  ('Mango Juice', NULL, 'beverage', ARRAY['veg']::text[], 'pan_indian'),
  ('Mango Lassi', NULL, 'beverage', ARRAY['veg']::text[], 'pan_indian'),
  ('Plain Lassi', NULL, 'beverage', ARRAY['veg']::text[], 'pan_indian'),
  ('Sugarcane Juice', NULL, 'beverage', ARRAY['veg']::text[], 'pan_indian'),
  ('Tender Coconut', NULL, 'beverage', ARRAY['veg']::text[], 'south_indian'),
  ('Rose Milk', NULL, 'beverage', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Smoothie', NULL, 'beverage', ARRAY['veg']::text[], 'pan_indian')
ON CONFLICT (name_english, category) DO NOTHING;

-- Chunk H — SIDE (catch-all, 18 items)
INSERT INTO public.mess_menu_item_library (name_english, name_tamil, category, dietary_tags, region_typical) VALUES
  ('Papad', NULL, 'side', ARRAY['veg']::text[], 'pan_indian'),
  ('Appalam', E'அப்பளம்', 'side', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Fryums', NULL, 'side', ARRAY['veg']::text[], 'pan_indian'),
  ('Vadagam', NULL, 'side', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Plain Curd Side', NULL, 'side', ARRAY['veg']::text[], 'pan_indian'),
  ('Mixed Salad', NULL, 'side', ARRAY['veg']::text[], 'pan_indian'),
  ('Onion Cucumber Salad', NULL, 'side', ARRAY['veg']::text[], 'pan_indian'),
  ('Carrot Beetroot Salad', NULL, 'side', ARRAY['veg']::text[], 'pan_indian'),
  ('Sprouted Moong', NULL, 'side', ARRAY['veg']::text[], 'pan_indian'),
  ('Sprouted Channa', NULL, 'side', ARRAY['veg']::text[], 'pan_indian'),
  ('Fresh Banana', NULL, 'side', ARRAY['veg']::text[], 'pan_indian'),
  ('Fresh Apple', NULL, 'side', ARRAY['veg']::text[], 'pan_indian'),
  ('Fresh Orange', NULL, 'side', ARRAY['veg']::text[], 'pan_indian'),
  ('Fresh Watermelon', NULL, 'side', ARRAY['veg']::text[], 'pan_indian'),
  ('Boiled Peanuts', NULL, 'side', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Roasted Peanuts', NULL, 'side', ARRAY['veg']::text[], 'pan_indian'),
  ('Sundal Side', NULL, 'side', ARRAY['veg']::text[], 'tamil_nadu'),
  ('Onion Slices', NULL, 'side', ARRAY['veg']::text[], 'pan_indian')
ON CONFLICT (name_english, category) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6) platform_policies — 1 row for runtime knob
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_policies (
  policy_key,
  scope_type, scope_id,
  value, data_type,
  description,
  ui_widget, ui_consequence, ui_category,
  is_system, is_active
) VALUES
  (
    'mess.menu.library_auto_promote_enabled',
    'global', NULL,
    'false'::jsonb, 'boolean',
    'Mess Menu: when true, items typed into the weekly-menu editor that don''t exist in mess_menu_item_library are auto-promoted into the library (saved as new rows with needs_native_review=true). When false (default), the editor only suggests existing library rows — typed-but-unknown items stay on the weekly menu but never enter the catalogue. Director enables once the seeded catalogue is audited.',
    'toggle',
    'true grows the library automatically from real editor activity (risk: typos and one-off items pollute the catalogue). false keeps the library as a stable curated reference (risk: catalogue stagnates).',
    'Mess — Library',
    true, true
  )
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7) Verification (raises NOTICE on success, EXCEPTION on failure)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_total           integer;
  v_with_tamil      integer;
  v_breakfast       integer;
  v_lunch           integer;
  v_tea             integer;
  v_dinner          integer;
  v_sweet           integer;
  v_condiment       integer;
  v_beverage        integer;
  v_side            integer;
  v_policy_present  integer;
BEGIN
  SELECT count(*) INTO v_total FROM public.mess_menu_item_library;
  SELECT count(*) INTO v_with_tamil FROM public.mess_menu_item_library WHERE name_tamil IS NOT NULL;

  IF v_total < 270 THEN
    RAISE EXCEPTION 'Library seed failed: expected >= 270 rows, got %', v_total;
  END IF;

  SELECT count(*) INTO v_breakfast FROM public.mess_menu_item_library WHERE category = 'breakfast';
  SELECT count(*) INTO v_lunch FROM public.mess_menu_item_library WHERE category = 'lunch';
  SELECT count(*) INTO v_tea FROM public.mess_menu_item_library WHERE category = 'tea';
  SELECT count(*) INTO v_dinner FROM public.mess_menu_item_library WHERE category = 'dinner';
  SELECT count(*) INTO v_sweet FROM public.mess_menu_item_library WHERE category = 'sweet';
  SELECT count(*) INTO v_condiment FROM public.mess_menu_item_library WHERE category = 'condiment';
  SELECT count(*) INTO v_beverage FROM public.mess_menu_item_library WHERE category = 'beverage';
  SELECT count(*) INTO v_side FROM public.mess_menu_item_library WHERE category = 'side';

  SELECT count(*) INTO v_policy_present
    FROM public.platform_policies
   WHERE policy_key = 'mess.menu.library_auto_promote_enabled'
     AND scope_type = 'global';

  IF v_policy_present < 1 THEN
    RAISE EXCEPTION 'mess.menu.library_auto_promote_enabled policy missing';
  END IF;

  RAISE NOTICE 'mess_menu_item_library seeded: total=% (tamil=%), breakfast=%, lunch=%, tea=%, dinner=%, sweet=%, condiment=%, beverage=%, side=%, policies=%',
    v_total, v_with_tamil, v_breakfast, v_lunch, v_tea, v_dinner, v_sweet, v_condiment, v_beverage, v_side, v_policy_present;
END $$;
