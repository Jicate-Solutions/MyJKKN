-- Seed the two cleaning types the housekeeping catalogue ships with:
-- Room Cleaning and Toilet Cleaning.
--
-- The catalogue went global in 20260909110000_housekeeping_types_global.sql, so
-- these are TWO rows in total, not two per institution. Every campus books the
-- same two services; who may book them is decided by room category below.
--
-- ELIGIBILITY = the 6 premium / premium_plus categories, which is the standing
-- rule, not a new one. 20260827130000_housekeeping_premium_room_and_allocation_
-- required.sql recorded the Director's Option A of 2026-08-27: only premium room
-- learners can book housekeeping. That used to be enforced by a tier resolver
-- (fn_housekeeping_entitlement_tier); the rebuild replaced the resolver with the
-- explicit hostel_cleaning_type_categories junction, so the same policy is now
-- expressed as which categories are attached to which type. Same outcome,
-- visible in a table instead of buried in plpgsql.
--
-- Selected BY tier_key, never by hardcoded UUID: category ids are generated, and
-- a 7th premium category added later should inherit the rule rather than silently
-- sit outside it. Today that resolves to 6 rows — Premium Room, Premium Plus Room
-- and Premium Room + AC, boys and girls — covering 122 live residents.
--
-- NO EXPENSE LINES ON PURPOSE. expected_cost_inr is SNAPSHOT onto every booking
-- at book time and never recomputed, so a placeholder cost would be frozen
-- permanently onto every booking made before someone corrected it. Zero is the
-- honest value until the real consumable rates are known; they can be added
-- through the Cleaning Types UI at any point, and only bookings made after that
-- carry them.
--
-- Idempotent: re-running changes nothing. Both inserts are ON CONFLICT DO
-- NOTHING — ux_hk_types_name (unique on lower(name)) for the types, and the
-- (type_id, category_id) primary key for the junction.

-- ==========================================================================
-- 1. The two types
-- ==========================================================================
INSERT INTO public.hostel_cleaning_types
  (name, description, duration_minutes, usage_limit_count, usage_period, is_active, sort_order)
VALUES
  ('Room Cleaning',
   'Full clean of the room: floor, furniture, dusting and waste removal.',
   45, 1, 'week', true, 1),
  ('Toilet Cleaning',
   'Clean of the attached toilet and bathroom: fittings, floor and waste removal.',
   30, 2, 'week', true, 2)
ON CONFLICT (lower(name)) DO NOTHING;

-- ==========================================================================
-- 2. Eligibility — premium and premium_plus room categories
-- ==========================================================================
-- An EMPTY junction means nobody can book the type: fn_cl_housekeeping_book
-- returns 'category_not_eligible' and the type is invisible in the resident
-- picker. It fails closed, so this insert is what actually switches the two
-- types on.
INSERT INTO public.hostel_cleaning_type_categories (type_id, category_id)
SELECT t.id, c.id
FROM public.hostel_cleaning_types t
CROSS JOIN public.hostel_categories c
WHERE t.name IN ('Room Cleaning', 'Toilet Cleaning')
  AND c.tier_key IN ('premium', 'premium_plus')
ON CONFLICT (type_id, category_id) DO NOTHING;
