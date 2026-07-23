-- Campus Living — mirror the girls hostel/mess upgrade fees onto the boys categories.
--
-- Background: category upgrade fees (hostel_category_upgrade_fees) had only been
-- configured for the GIRLS gender variants. Categories are gender-typed, so each
-- girls pair (e.g. Classic Room → Deluxe Room) has a boys counterpart with the same
-- name that carried NO upgrade fee — boys upgrades silently fell back to the raw
-- fee difference. The pricing is identical across genders, so we replicate every
-- girls pair onto the matching boys pair with the same amount + hostel year.
--
-- Generic by design: matches girls → boys categories by NAME (not hardcoded UUIDs),
-- covers every hostel year that has girls rows, and is idempotent via NOT EXISTS so
-- a replay (or a re-run after new girls pairs are added) inserts only what's missing.

-- Room upgrade pairs
INSERT INTO hostel_category_upgrade_fees
  (hostel_year_id, from_hostel_category_id, to_hostel_category_id,
   from_mess_category_id, to_mess_category_id, amount, is_active)
SELECT
  uf.hostel_year_id,
  bf.id,            -- boys "from" (same name as the girls source)
  bt.id,            -- boys "to"
  NULL, NULL,
  uf.amount,
  uf.is_active
FROM hostel_category_upgrade_fees uf
JOIN hostel_categories gf ON gf.id = uf.from_hostel_category_id AND gf.type = 'girls'
JOIN hostel_categories gt ON gt.id = uf.to_hostel_category_id   AND gt.type = 'girls'
JOIN hostel_categories bf ON bf.name = gf.name AND bf.type = 'boys'
JOIN hostel_categories bt ON bt.name = gt.name AND bt.type = 'boys'
WHERE uf.from_hostel_category_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM hostel_category_upgrade_fees x
    WHERE x.hostel_year_id = uf.hostel_year_id
      AND x.from_hostel_category_id = bf.id
      AND x.to_hostel_category_id = bt.id
  );

-- Mess upgrade pairs
INSERT INTO hostel_category_upgrade_fees
  (hostel_year_id, from_hostel_category_id, to_hostel_category_id,
   from_mess_category_id, to_mess_category_id, amount, is_active)
SELECT
  uf.hostel_year_id,
  NULL, NULL,
  bf.id,            -- boys "from" mess
  bt.id,            -- boys "to" mess
  uf.amount,
  uf.is_active
FROM hostel_category_upgrade_fees uf
JOIN mess_categories gf ON gf.id = uf.from_mess_category_id AND gf.type = 'girls'
JOIN mess_categories gt ON gt.id = uf.to_mess_category_id   AND gt.type = 'girls'
JOIN mess_categories bf ON bf.name = gf.name AND bf.type = 'boys'
JOIN mess_categories bt ON bt.name = gt.name AND bt.type = 'boys'
WHERE uf.from_mess_category_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM hostel_category_upgrade_fees x
    WHERE x.hostel_year_id = uf.hostel_year_id
      AND x.from_mess_category_id = bf.id
      AND x.to_mess_category_id = bt.id
  );
