-- 20260807140000_campus_living_curated_upgrade_ladder.sql
-- Campus Living: make the room-upgrade graph an EXPLICIT, curated allowlist.
--
-- Until now the upgrade graph was *implicit*: any active, gender-matched category
-- with a published fee STRICTLY HIGHER than the resident's current category showed
-- up as an option. That has two problems:
--   1. It produced nonsense edges. "Deluxe Plus Room" was priced 2,500 (it is an
--      ADD-ON price — pay to self-pick your Deluxe room — not a full category fee),
--      which made it the CHEAPEST category and therefore the bottom of the ladder.
--      Every resident on it saw Classic/Deluxe/Premium as "upgrades", and nobody
--      could ever upgrade INTO it.
--   2. The intended Deluxe -> Deluxe Plus move was impossible: 2,500 < 35,000 fails
--      the fee comparison in the loader AND the "Downgrades are not allowed" guard
--      in _cl_upgrade_room_category.
--
-- Fix, in two parts, NEITHER of which needs a code change:
--   (a) Reprice Deluxe Plus to its true total (Deluxe 35,000 + 2,500 add-on = 37,500).
--       It now sits correctly ABOVE Deluxe, so the fee comparison and the downgrade
--       guard both pass, and it stops being the ladder's bottom rung. The 2,500 the
--       resident actually pays lives in hostel_category_upgrade_fees, where it belongs.
--   (b) Turn on requires_explicit_upgrade for EVERY active room category. That flag
--       (already used by "Premium Room + AC") means "only reachable via a configured
--       from->to pair". With it on everywhere, hostel_category_upgrade_fees becomes the
--       single source of truth for the whole graph — editable from Fee Config, no
--       migration needed to add or remove an edge ever again.
--
-- Resulting ladder (per gender) is exactly the 7 curated edges:
--   Classic -> Deluxe | Premium | Premium + AC
--   Deluxe  -> Premium | Premium + AC | Deluxe Plus
--   Premium -> Premium + AC

-- (a) Reprice Deluxe Plus: add-on price -> true total. Safe: ZERO learners are on
--     this category today, so no resident's bill or category changes.
UPDATE public.hostel_fees hf
   SET amount = 37500, updated_at = now()
  FROM public.hostel_categories c
 WHERE hf.hostel_category_id = c.id
   AND c.name = 'Deluxe Plus Room'
   AND hf.mess_category_id IS NULL
   AND hf.is_active
   AND hf.hostel_year_id = (SELECT id FROM public.hostel_years WHERE is_current LIMIT 1);

-- (b) Every active room category is now explicit-only. Unconfigured pairs vanish,
--     which is what removes the three bogus "Deluxe Plus -> X" edges.
UPDATE public.hostel_categories
   SET requires_explicit_upgrade = true, updated_at = now()
 WHERE is_active AND NOT requires_explicit_upgrade;

-- (c) The one missing edge: Deluxe -> Deluxe Plus at the 2,500 add-on price, for
--     every gender that has both categories. Looked up BY NAME + TYPE — never
--     hardcode generated ids in a data migration.
INSERT INTO public.hostel_category_upgrade_fees (
  hostel_year_id, from_hostel_category_id, to_hostel_category_id, amount
)
SELECT y.id, d.id, dp.id, 2500
  FROM (SELECT id FROM public.hostel_years WHERE is_current LIMIT 1) y
  JOIN public.hostel_categories d  ON d.name  = 'Deluxe Room'      AND d.is_active
  JOIN public.hostel_categories dp ON dp.name = 'Deluxe Plus Room' AND dp.is_active
                                  AND dp.type = d.type
ON CONFLICT DO NOTHING;
